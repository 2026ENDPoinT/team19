"""D-50 personal lecture list (X-Owner-Id). Sample mode, temp SQLite, no AI/network.

The device ID only filters GET /lectures. It is NOT authentication: other endpoints stay open by ID.
"""
import sqlite3
import sys

import pytest

from test_api import client, pdf_bytes, wait_job  # noqa: F401

A = "device-aaaaaaaaaaaaaaaa"
B = "device_BBBBBBBBBBBBBBBB-1"


def up(client, owner=None, name="lecture.pdf", extra=b""):
    # extra makes the bytes differ: identical PDFs of one owner are reused (P-FE-15), not listed twice
    headers = {} if owner is None else {"X-Owner-Id": owner}
    return client.post("/lectures", files={"file": (name, pdf_bytes() + extra, "application/pdf")}, headers=headers)


def listing(client, owner=None):
    return client.get("/lectures", headers={} if owner is None else {"X-Owner-Id": owner})


def test_each_owner_sees_only_own_lectures_newest_first(client):
    a1 = up(client, A, "a1.pdf").json()["lectureId"]
    b1 = up(client, B, "b1.pdf").json()["lectureId"]
    a2 = up(client, A, "a2.pdf", extra=b"\n% second\n").json()["lectureId"]
    assert [l["id"] for l in listing(client, A).json()] == [a2, a1]
    assert [l["id"] for l in listing(client, B).json()] == [b1]
    assert listing(client, "device-cccccccccccccccc").json() == []
    assert set(listing(client, B).json()[0]) == {"id", "title", "status", "pageCount"}  # shape unchanged
    assert listing(client, B).json()[0]["title"] == "b1.pdf"


def test_missing_header_uploads_ownerless_and_lists_nothing(client):
    r = up(client)
    assert r.status_code == 202 and set(r.json()) == {"lectureId", "jobId", "status"}
    assert wait_job(client, r.json()["jobId"])["status"] == "completed"  # old FE flow still works
    assert listing(client).json() == []
    assert listing(client, A).json() == []
    assert client.get(f"/lectures/{r.json()['lectureId']}").status_code == 200  # open by ID, as before


@pytest.mark.parametrize("bad", ["", "short", "a" * 65, "has space 1234567890", "한글한글한글한글한글한글한글한글".encode("utf-8"), "id;DROP TABLE x;--", "dev/../etc12345678"])
def test_malformed_header_is_rejected_not_ignored(client, bad):
    r = up(client, bad)
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_REQUEST"
    r = client.get("/lectures", headers={"X-Owner-Id": bad})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_REQUEST"
    assert listing(client, A).json() == []  # a rejected upload stored nothing


def test_length_boundaries_are_accepted(client):
    for owner in ("a" * 16, "b" * 64):
        assert up(client, owner).status_code == 202
        assert len(listing(client, owner).json()) == 1


def test_owner_id_is_not_access_control_for_other_endpoints(client):
    """Documented limitation: ID-based endpoints ignore the header entirely."""
    lid = up(client, A).json()["lectureId"]
    assert client.get(f"/lectures/{lid}").status_code == 200
    assert client.get(f"/lectures/{lid}", headers={"X-Owner-Id": B}).status_code == 200


def test_existing_flow_and_job_api_unchanged_with_owner_header(client):
    r = up(client, A)
    job = wait_job(client, r.json()["jobId"])
    assert job["status"] == "completed" and set(job) == {"id", "type", "status", "stage", "progress", "error"}
    lec = client.get(f"/lectures/{r.json()['lectureId']}").json()
    assert lec["status"] == "ready" and "ownerId" not in lec and "owner_id" not in lec
    started = client.post(f"/lectures/{lec['id']}/outlines", json={"mode": "intro"})
    assert started.status_code == 202


def test_legacy_database_is_migrated_in_place_and_rows_kept(client, tmp_path, monkeypatch):
    module = sys.modules["backend.app"]
    legacy = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(legacy) as db:
        db.execute("CREATE TABLE lectures (id TEXT PRIMARY KEY, title TEXT, pdf_path TEXT, page_count INTEGER, status TEXT NOT NULL, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)")
        db.execute("INSERT INTO lectures(id,title,pdf_path,page_count,status) VALUES('lec_old','old.pdf','/x/original.pdf',3,'ready')")
    monkeypatch.setattr(module, "DB", legacy)
    module.setup()
    module.setup()  # idempotent: no "duplicate column" error on the second start
    with module.conn() as db:
        cols = [c["name"] for c in db.execute("PRAGMA table_info(lectures)")]
        row = dict(db.execute("SELECT * FROM lectures WHERE id='lec_old'").fetchone())
    assert cols.count("owner_id") == 1
    assert row["title"] == "old.pdf" and row["page_count"] == 3 and row["status"] == "ready" and row["owner_id"] is None
    assert listing(client, A).json() == []  # ownerless history is not handed to anyone
    assert client.get("/lectures/lec_old").status_code == 200  # still readable by ID
    assert up(client, A).status_code == 202
    assert [l["title"] for l in listing(client, A).json()] == ["lecture.pdf"]
