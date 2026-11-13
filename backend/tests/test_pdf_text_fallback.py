"""BUG-FE-01: synthetic PDFs only; sample API tests use isolated temporary DBs."""
import builtins
import io
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

from PIL import Image
from pypdf import PdfReader, PdfWriter
import pytest

from backend import pdf_text_fallback as extraction
from test_api import client, pdf_bytes, wait_job  # noqa: F401 (isolated sample fixture)


@pytest.fixture(autouse=True)
def no_paid_ai(monkeypatch):
    import pipeline

    def forbidden(*args, **kwargs):
        raise AssertionError("Real AI functions and .env loading are forbidden")

    for name in ("extract_pdf", "describe_pages", "plan_outline", "make_blueprint", "make_audio", "_load_env"):
        monkeypatch.setattr(pipeline, name, forbidden)


def block_pymupdf(monkeypatch, error):
    original = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name == "pymupdf":
            raise error
        return original(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)


@pytest.fixture()
def korean_pdf(tmp_path):
    import pymupdf

    texts = ["Software Engineering\nCourse Introduction",
             "소프트웨어 공학(Software Engineering)\n학습 목표",
             "강의 정보\n과목 안내"]
    path = tmp_path / "synthetic-korean.pdf"
    with pymupdf.open() as document:
        for text in texts:
            page = document.new_page(width=612, height=792)
            page.insert_text((72, 72), text, fontname="korea", fontsize=12)
        document.save(path)
    return path, texts


def test_pymupdf_is_preferred_and_result_shape_and_placeholders_are_preserved(tmp_path, monkeypatch):
    source = tmp_path / "source.pdf"
    source.write_bytes(pdf_bytes())
    document = MagicMock()
    document.needs_pass, document.page_count = False, 3
    texts = ["Software Engineering\nCourse Introduction", "소프트웨어 공학\n강의 정보", ""]
    pages = [SimpleNamespace(get_text=Mock(return_value=text)) for text in texts]
    document.__iter__.return_value = pages
    context = MagicMock()
    context.__enter__.return_value = document
    open_pdf = Mock(return_value=context)
    monkeypatch.setitem(sys.modules, "pymupdf", SimpleNamespace(open=open_pdf))
    reader = Mock(side_effect=AssertionError("pypdf must not run when PyMuPDF loads"))
    monkeypatch.setattr(extraction, "PdfReader", reader)

    result = extraction.extract_pdf_text_only(source, tmp_path / "pages")
    assert set(result) == {"pageCount", "pages"} and result["pageCount"] == 3
    assert [p["text"] for p in result["pages"]] == texts
    assert [p["number"] for p in result["pages"]] == [1, 2, 3]
    assert [p["empty"] for p in result["pages"]] == [False, False, True]
    for n, page in enumerate(result["pages"], 1):
        assert set(page) == {"number", "text", "imagePath", "empty"}
        assert page["imagePath"] == str(tmp_path / "pages" / f"page-{n}.png")
        with Image.open(page["imagePath"]) as image:
            image.load()
            assert image.format == "PNG" and image.size == (420, 600)
    open_pdf.assert_called_once_with(stream=source.read_bytes(), filetype="pdf")
    for page in pages:
        page.get_text.assert_called_once_with("text")
    context.__exit__.assert_called_once()
    reader.assert_not_called()


def test_real_pymupdf_preserves_synthetic_korean_and_line_breaks(korean_pdf, tmp_path):
    path, texts = korean_pdf
    before = path.read_bytes()
    result = extraction.extract_pdf_text_only(path, tmp_path / "pages")
    assert [p["text"] for p in result["pages"]] == texts
    assert path.read_bytes() == before


@pytest.mark.parametrize("error", [ImportError("not installed"), OSError(577, "DLL blocked")])
def test_import_or_dll_failure_uses_pypdf_and_logs_quality_limit(tmp_path, monkeypatch, caplog, error):
    path = tmp_path / "source.pdf"
    path.write_bytes(pdf_bytes())
    expected = [(p.extract_text() or "").strip() for p in PdfReader(path).pages]
    block_pymupdf(monkeypatch, error)
    result = extraction.extract_pdf_text_only(path, tmp_path / "pages")
    assert result["pageCount"] == 2
    assert [p["text"] for p in result["pages"]] == expected
    assert [p["number"] for p in result["pages"]] == [1, 2]
    for page in result["pages"]:
        with Image.open(page["imagePath"]) as image:
            image.load()
            assert image.format == "PNG" and image.size == (420, 600)
    assert "pypdf로 대체" in caplog.text and "품질은 보장되지 않습니다" in caplog.text


@pytest.mark.parametrize("error", [ValueError("invalid PDF"), OSError("PDF read failed")])
def test_pdf_read_errors_are_not_hidden_by_switching_extractors(tmp_path, monkeypatch, error):
    source = tmp_path / "source.pdf"
    source.write_bytes(pdf_bytes())
    monkeypatch.setitem(sys.modules, "pymupdf", SimpleNamespace(open=Mock(side_effect=error)))
    reader = Mock(side_effect=AssertionError("PDF errors must not trigger fallback"))
    monkeypatch.setattr(extraction, "PdfReader", reader)
    with pytest.raises(type(error), match=str(error)):
        extraction.extract_pdf_text_only(source, tmp_path / "pages")
    reader.assert_not_called()


@pytest.mark.parametrize("engine", ["pymupdf", "pypdf"])
@pytest.mark.parametrize("fault", ["zero_pages", "encrypted", "malformed"])
def test_invalid_pdf_still_fails_prepare_with_contract_error(client, monkeypatch, engine, fault):
    if engine == "pypdf":
        block_pymupdf(monkeypatch, ImportError("unavailable"))
    writer = PdfWriter()
    if fault == "encrypted":
        writer.add_blank_page(width=612, height=792)
        writer.encrypt("test-only-password")
    data = io.BytesIO()
    writer.write(data)
    raw = b"%PDF-1.4\nnot a valid PDF" if fault == "malformed" else data.getvalue()
    response = client.post("/lectures", files={"file": ("invalid.pdf", raw, "application/pdf")})
    assert response.status_code == 202
    ticket = response.json()
    job = wait_job(client, ticket["jobId"])
    assert job["status"] == "failed"
    assert job["error"] == {"code": "INVALID_PDF", "message": "PDF를 읽지 못했습니다.", "retryable": False}
    lecture = client.get(f"/lectures/{ticket['lectureId']}").json()
    assert lecture["status"] == "failed" and lecture["pages"] == []


@pytest.mark.parametrize("engine", ["pymupdf", "pypdf"])
def test_sample_text_reaches_db_clip_title_outline_and_media(client, korean_pdf, monkeypatch, engine):
    path, expected = korean_pdf
    raw = path.read_bytes()
    monkeypatch.setenv("SAMPLE_MP4", "0")
    if engine == "pypdf":
        # The fallback preserves pypdf's output; it does not promise to repair it.
        expected = [(p.extract_text() or "").strip() for p in PdfReader(io.BytesIO(raw)).pages]
        block_pymupdf(monkeypatch, OSError(577, "DLL blocked"))
    ticket = client.post("/lectures", files={"file": ("synthetic-korean.pdf", raw, "application/pdf")}).json()
    assert wait_job(client, ticket["jobId"])["status"] == "completed"
    lid = ticket["lectureId"]
    module = sys.modules["backend.app"]
    with module.conn() as db:
        saved = db.execute("SELECT number,text FROM pages WHERE lecture_id=? ORDER BY number", (lid,)).fetchall()
    assert [p["number"] for p in saved] == [1, 2, 3]
    assert [p["text"] for p in saved] == expected
    lecture = client.get(f"/lectures/{lid}").json()
    assert lecture["pageCount"] == 3
    for page in lecture["pages"]:
        response = client.get(page["imageUrl"])
        assert response.status_code == 200
        with Image.open(io.BytesIO(response.content)) as image:
            image.load()
            assert image.format == "PNG" and image.size == (420, 600)

    url = f"/lectures/{lid}/outlines"
    outlined = client.post(url, json={"mode": "intro"}).json()
    assert wait_job(client, outlined["jobId"])["status"] == "completed"
    clips = client.get(url + "/intro").json()["clips"]
    titles = [" ".join(text.split())[:35] for text in expected]
    assert len(clips) == 3 and [c["title"] for c in clips] == titles
    with module.conn() as db:
        stored = db.execute("SELECT title FROM clips WHERE outline_id=? ORDER BY position", (outlined["outlineId"],)).fetchall()
    assert [c["title"] for c in stored] == titles
    for clip in clips:
        assert wait_job(client, clip["jobId"])["status"] == "completed"
        result = client.get(f"/clips/{clip['id']}").json()["result"]
        assert result["sample"] is True
        assert result["blueprint"]["scenes"][0]["sourcePages"] == clip["sourcePages"]
        assert client.get(result["audioUrl"]).content.startswith(b"RIFF")
        assert client.head(result["audioUrl"]).status_code == 200
        assert client.get(result["audioUrl"], headers={"Range": "bytes=0-31"}).status_code == 206
    assert client.post(url, json={"mode": "intro"}).json()["reused"] is True
    assert path.read_bytes() == raw
