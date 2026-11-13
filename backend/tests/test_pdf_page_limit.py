"""Upload policy: no PDF file-size limit, at most 100 pages (101+ -> 422 PDF_PAGE_LIMIT_EXCEEDED).

Temp SQLite / temp folders / fake AI only. Page counts come from the PDF structure; the file size never decides.
"""
import builtins
import io
import sys

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject

from test_api import client, pdf_bytes, wait_job  # noqa: F401
from test_ai_module_compat import forbid_real_ai, live  # noqa: F401

A = "device-pagelimit000001"
B = "device-pagelimit000002"
MIB = 1024 * 1024
MESSAGE = "PDF는 최대 100페이지까지 업로드할 수 있습니다."


def pdf_with_pages(n, padding_mib=0, encrypt=False):
    """n blank pages. `padding_mib` adds an unreferenced stream so the file is large but still n pages."""
    writer = PdfWriter()
    for _ in range(n):
        writer.add_blank_page(width=200, height=200)
    if padding_mib:
        stream = DecodedStreamObject()
        stream.set_data(b"0" * (padding_mib * MIB))
        writer._add_object(stream)
    if encrypt:
        writer.encrypt("secret", algorithm="RC4-128")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def module():
    return sys.modules["backend.app"]


def up(client, data, owner=A, name="lecture.pdf"):
    headers = {} if owner is None else {"X-Owner-Id": owner}
    return client.post("/lectures", files={"file": (name, data, "application/pdf")}, headers=headers)


def counts():
    with module().conn() as db:
        return tuple(db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("lectures", "jobs", "pages"))


def lecture_folders():
    root = module().ROOT / "lectures"
    return sorted(p.name for p in root.iterdir()) if root.exists() else []


@pytest.mark.parametrize("pages", [1, 2, 99, 100])
def test_up_to_100_pages_is_accepted(client, pages):
    r = up(client, pdf_with_pages(pages))
    assert r.status_code == 202 and set(r.json()) == {"lectureId", "jobId", "status"}
    assert wait_job(client, r.json()["jobId"])["status"] == "completed"
    assert client.get(f"/lectures/{r.json()['lectureId']}").json()["pageCount"] == pages


@pytest.mark.parametrize("pages", [101, 150])
def test_over_100_pages_is_rejected_with_the_documented_error(client, pages):
    before_folders = lecture_folders()
    r = up(client, pdf_with_pages(pages))
    assert r.status_code == 422
    assert r.json() == {"error": {"code": "PDF_PAGE_LIMIT_EXCEEDED", "message": MESSAGE, "retryable": False}}
    assert counts() == (0, 0, 0)
    assert lecture_folders() == before_folders == []


def test_rejected_upload_creates_no_job_and_calls_no_ai_and_changes_nothing_else(live):
    kept = up(live, pdf_with_pages(3), A).json()
    assert wait_job(live, kept["jobId"])["status"] == "completed"
    before_counts, before_folders, before_calls = counts(), lecture_folders(), list(live.fake.CALLS)
    kept_pdf = (module().ROOT / "lectures" / kept["lectureId"] / "original.pdf").read_bytes()
    for owner in (A, B, None):
        r = up(live, pdf_with_pages(101), owner)
        assert r.status_code == 422 and r.json()["error"]["code"] == "PDF_PAGE_LIMIT_EXCEEDED"
    assert counts() == before_counts and lecture_folders() == before_folders  # no row, Job, file or folder
    assert live.fake.CALLS == before_calls  # the (fake) AI pipeline was never called
    assert (module().ROOT / "lectures" / kept["lectureId"] / "original.pdf").read_bytes() == kept_pdf
    assert live.get(f"/lectures/{kept['lectureId']}").status_code == 200


def test_files_over_20_and_32_mib_are_accepted_when_within_100_pages(client, monkeypatch):
    monkeypatch.setattr(module(), "dispatch", lambda jid: None)  # only acceptance is under test, not processing
    for mib, pages in ((21, 3), (33, 100)):
        data = pdf_with_pages(pages, padding_mib=mib)
        assert len(data) > mib * MIB
        r = up(client, data, A, f"big{mib}.pdf")
        assert r.status_code == 202, r.text
        stored = module().ROOT / "lectures" / r.json()["lectureId"] / "original.pdf"
        assert stored.stat().st_size == len(data)
    assert counts()[0] == 2


def test_a_huge_file_is_still_rejected_by_page_count_not_by_size(client):
    data = pdf_with_pages(101, padding_mib=33)
    r = up(client, data)
    assert r.status_code == 422 and r.json()["error"]["code"] == "PDF_PAGE_LIMIT_EXCEEDED"
    assert counts() == (0, 0, 0) and lecture_folders() == []


def test_size_limit_code_and_setting_are_gone(client):
    assert not hasattr(module(), "MAX_BYTES")
    assert module().MAX_PDF_PAGES == 100
    r = up(client, pdf_with_pages(1))
    assert r.status_code == 202


@pytest.mark.parametrize("case", ["garbage", "truncated", "encrypted", "zero_pages"])
def test_unreadable_encrypted_or_empty_pdfs_are_invalid_pdf(client, case):
    data = {"garbage": b"%PDF-1.4\nthis is not a pdf at all\n",
            "truncated": pdf_bytes()[:200],
            "encrypted": pdf_with_pages(2, encrypt=True),
            "zero_pages": pdf_with_pages(0)}[case]
    r = up(client, data)
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_PDF"
    body = r.text
    assert "Traceback" not in body and "pymupdf" not in body.lower() and "pypdf" not in body.lower()
    assert str(module().ROOT) not in body  # no internal path or library error reaches the client
    assert counts() == (0, 0, 0) and lecture_folders() == []


def test_missing_pdf_header_and_wrong_extension_keep_their_codes(client):
    assert up(client, b"not a pdf").json()["error"]["code"] == "INVALID_PDF"
    assert up(client, pdf_bytes(), name="notes.txt").status_code == 415
    assert counts() == (0, 0, 0) and lecture_folders() == []


def test_page_count_falls_back_to_pypdf_when_pymupdf_cannot_load(client, monkeypatch):
    real_import = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name == "pymupdf":
            raise OSError("DLL blocked")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)
    assert module().count_pdf_pages.__name__ == "count_pdf_pages"
    ok, over = up(client, pdf_with_pages(100)), up(client, pdf_with_pages(101))
    assert ok.status_code == 202
    assert over.status_code == 422 and over.json()["error"]["code"] == "PDF_PAGE_LIMIT_EXCEEDED"


def test_storage_error_while_saving_is_503_and_cleans_up(client, monkeypatch):
    real_open = type(module().ROOT).open

    def failing(self, mode="r", *args, **kwargs):
        if self.name == "original.pdf" and "w" in mode:
            raise OSError("disk full")
        return real_open(self, mode, *args, **kwargs)

    monkeypatch.setattr(type(module().ROOT), "open", failing)
    r = up(client, pdf_with_pages(1))
    assert r.status_code == 503 and r.json()["error"]["code"] == "STORAGE_UNAVAILABLE"
    assert "disk full" not in r.text and counts() == (0, 0, 0) and lecture_folders() == []


def test_identical_uploads_still_reuse_one_lecture_and_other_owners_stay_separate(client):
    data = pdf_with_pages(5)
    first = up(client, data, A).json()
    again = up(client, data, A, "renamed.pdf").json()
    assert (again["lectureId"], again["jobId"]) == (first["lectureId"], first["jobId"])
    other = up(client, data, B).json()
    assert other["lectureId"] != first["lectureId"]
    assert up(client, pdf_with_pages(101), A).status_code == 422  # a rejected upload does not touch them
    assert [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": A}).json()] == [first["lectureId"]]
    assert [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": B}).json()] == [other["lectureId"]]
    assert len(lecture_folders()) == 2


def test_existing_flow_upload_prepare_and_modes_still_work(client):
    r = up(client, pdf_bytes()).json()
    assert wait_job(client, r["jobId"])["status"] == "completed"
    lecture = client.get(f"/lectures/{r['lectureId']}").json()
    assert lecture["status"] == "ready" and lecture["preparationJobId"] == r["jobId"]
    assert client.post(f"/lectures/{r['lectureId']}/outlines", json={"mode": "intro"}).status_code == 202
