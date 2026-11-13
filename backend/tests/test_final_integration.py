"""PDF upload policy (no size limit, max 100 pages) together with permanent deletion and duplicate handling.

Temp SQLite / temp folders / sample or fake AI only. Nothing here calls a paid API.
"""
from test_api import client, wait_job  # noqa: F401
from test_ai_module_compat import forbid_real_ai, live, wait_clips  # noqa: F401
from test_delete_lecture import A, B, build, delete, module, snapshot, table_counts, up  # noqa: F401
from test_pdf_page_limit import MIB, pdf_with_pages


def listing(client, owner=A):
    return [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": owner}).json()]


def test_big_pdf_lifecycle_upload_reuse_delete_reupload(client):
    big = pdf_with_pages(100, padding_mib=33)  # over 32 MiB, exactly 100 pages
    assert len(big) > 32 * MIB
    first = up(client, big, A, "big.pdf").json()
    assert wait_job(client, first["jobId"], timeout=120)["status"] == "completed"
    assert client.get(f"/lectures/{first['lectureId']}").json()["pageCount"] == 100
    again = up(client, big, A, "renamed-big.pdf").json()  # same bytes: the same lecture and job
    assert (again["lectureId"], again["jobId"]) == (first["lectureId"], first["jobId"])
    assert listing(client) == [first["lectureId"]]
    folder = module().ROOT / "lectures" / first["lectureId"]
    assert (folder / "original.pdf").stat().st_size == len(big)

    assert delete(client, first["lectureId"]).status_code == 204
    assert not folder.exists() and table_counts() == {t: 0 for t in table_counts()}
    new = up(client, big, A, "big.pdf").json()
    assert new["lectureId"] != first["lectureId"] and new["jobId"] != first["jobId"]
    assert wait_job(client, new["jobId"], timeout=120)["status"] == "completed"


def test_too_long_pdf_is_refused_without_touching_anything_while_other_data_is_kept(live):
    kept, _ = build(live)
    other_owner, _ = build(live, owner=B)
    before_counts, before_calls = table_counts(), list(live.fake.CALLS)
    r = up(live, pdf_with_pages(101), A)
    assert r.status_code == 422 and r.json()["error"]["code"] == "PDF_TOO_LONG" and r.json()["error"]["retryable"] is False
    assert "100쪽" in r.json()["error"]["message"] and "나눠서" in r.json()["error"]["message"]
    assert table_counts() == before_counts and live.fake.CALLS == before_calls
    assert listing(live) == [kept] and listing(live, B) == [other_owner]
    # a rejected upload never blocks deleting or re-uploading
    assert delete(live, kept).status_code == 204
    assert listing(live) == [] and listing(live, B) == [other_owner]
    assert up(live, pdf_with_pages(100), A).status_code == 202


def test_latest_ready_duplicate_is_shown_and_one_delete_removes_the_group(client):
    data = pdf_with_pages(7)
    ids = []
    for i in range(3):  # old duplicates created before the reuse feature
        r = up(client, data, A, f"copy{i}.pdf").json()
        assert wait_job(client, r["jobId"])["status"] == "completed"
        ids.append(r["lectureId"])
        with module().conn() as db:
            db.execute("UPDATE lectures SET reuse_key=NULL,pdf_sha256=NULL,ai_mode=NULL WHERE id=?", (r["lectureId"],))
    client.post(f"/lectures/{ids[0]}/outlines", json={"mode": "intro"})
    assert all(c["status"] == "completed" for c in wait_clips(client, ids[0])["clips"])  # the oldest has clips
    others = up(client, pdf_with_pages(8), A, "other.pdf").json()["lectureId"]
    foreign = up(client, data, B, "same-bytes-other-owner.pdf").json()["lectureId"]
    assert listing(client) == [others, ids[-1]]  # newest ready duplicate, clips are not counted
    assert delete(client, ids[-1]).status_code == 204
    assert listing(client) == [others]
    assert all(client.get(f"/lectures/{i}").status_code == 404 for i in ids)
    assert client.get(f"/lectures/{foreign}").status_code == 200 and listing(client, B) == [foreign]


def test_cors_covers_upload_list_and_delete_for_the_browser(client):
    origin = "http://localhost:5173"
    for method in ("POST", "GET", "DELETE"):
        r = client.options("/lectures/lec_x", headers={"Origin": origin, "Access-Control-Request-Method": method,
                                                      "Access-Control-Request-Headers": "x-owner-id"})
        assert r.status_code == 200 and method in r.headers["access-control-allow-methods"]
    over = up(client, pdf_with_pages(101), A)
    assert set(over.json()["error"]) == {"code", "message", "retryable"}
