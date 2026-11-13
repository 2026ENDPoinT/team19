"""P-FE-15 MVP: same owner + same PDF bytes reuse one lecture; the lecture list shows one entry per PDF.

Sample mode / temp SQLite / no AI calls. Nothing is ever deleted or merged.
"""
import hashlib
import sqlite3
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

from test_api import client, pdf_bytes, wait_job  # noqa: F401
from test_ai_module_compat import wait_clips  # noqa: F401

A = "device-aaaaaaaaaaaaaaaa"
B = "device-bbbbbbbbbbbbbbbb"
SAME = pdf_bytes()
OTHER = SAME + b"\n% different bytes, same visible text\n"


def up(client, data=SAME, owner=A, name="lecture.pdf"):
    headers = {} if owner is None else {"X-Owner-Id": owner}
    return client.post("/lectures", files={"file": (name, data, "application/pdf")}, headers=headers)


def module():
    return sys.modules["backend.app"]


def count(sql, args=()):
    with module().conn() as db:
        return db.execute(sql, args).fetchone()[0]


def listing(client, owner=A):
    return client.get("/lectures", headers={"X-Owner-Id": owner}).json()


def test_same_pdf_same_owner_returns_existing_lecture_and_job(client):
    first = up(client).json()
    again = up(client, name="renamed copy.pdf")  # different file name, same bytes
    assert again.status_code == 202 and set(again.json()) == {"lectureId", "jobId", "status"}
    assert (again.json()["lectureId"], again.json()["jobId"]) == (first["lectureId"], first["jobId"])
    assert count("SELECT COUNT(*) FROM lectures") == 1 and count("SELECT COUNT(*) FROM jobs WHERE type='prepare'") == 1
    assert len(listing(client)) == 1


def test_same_name_different_bytes_is_a_separate_lecture(client):
    a = up(client, SAME, name="same-name.pdf").json()
    b = up(client, OTHER, name="same-name.pdf").json()
    assert a["lectureId"] != b["lectureId"] and a["jobId"] != b["jobId"]
    assert len(listing(client)) == 2


def test_other_owner_and_ownerless_uploads_are_never_crossed(client):
    first = up(client, owner=A).json()
    assert up(client, owner=B).json()["lectureId"] != first["lectureId"]
    ownerless = [up(client, owner=None).json()["lectureId"] for _ in range(2)]
    assert len(set(ownerless)) == 2 and first["lectureId"] not in ownerless  # old behaviour without the header
    assert [l["id"] for l in listing(client, A)] == [first["lectureId"]]


def test_concurrent_identical_uploads_make_one_lecture_and_one_job(client):
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: up(client).json(), range(8)))
    assert len({r["lectureId"] for r in results}) == 1 and len({r["jobId"] for r in results}) == 1
    assert count("SELECT COUNT(*) FROM lectures") == 1 and count("SELECT COUNT(*) FROM jobs WHERE type='prepare'") == 1


def test_claim_is_atomic_across_threads(client, tmp_path):
    m = module()
    barrier = threading.Barrier(6)
    outcomes = []

    def claim(i):
        barrier.wait(timeout=5)
        outcomes.append(m.claim_lecture(A, "f" * 64, "x.pdf", tmp_path / f"{i}.pdf", f"lec_t{i}"))

    threads = [threading.Thread(target=claim, args=(i,)) for i in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(10)
    assert len(outcomes) == 6 and sum(1 for o in outcomes if o[3]) == 1
    assert len({o[0] for o in outcomes}) == 1 and len({o[1] for o in outcomes}) == 1


def test_ready_pending_running_reuse_and_flow_stays_compatible(client, monkeypatch):
    first = up(client).json()
    assert wait_job(client, first["jobId"])["status"] == "completed"
    ready = up(client, name="again.pdf").json()
    assert ready["lectureId"] == first["lectureId"] and ready["jobId"] == first["jobId"]
    # What the FE does next: poll the job, then open the lecture and compare preparationJobId with jobId.
    assert client.get(f"/jobs/{ready['jobId']}").json()["status"] == "completed"
    lecture = client.get(f"/lectures/{ready['lectureId']}").json()
    assert lecture["status"] == "ready" and lecture["preparationJobId"] == ready["jobId"] and lecture["pageCount"] == 2

    monkeypatch.setattr(module(), "dispatch", lambda jid: None)  # leave new work waiting
    pending = up(client, OTHER).json()
    assert pending["status"] == "pending"
    with module().conn() as db:
        db.execute("UPDATE lectures SET status='running' WHERE id=?", (pending["lectureId"],))
        db.execute("UPDATE jobs SET status='running',stage='describing' WHERE id=?", (pending["jobId"],))
    for _ in range(2):
        again = up(client, OTHER).json()
        assert (again["lectureId"], again["jobId"], again["status"]) == (pending["lectureId"], pending["jobId"], "running")
    assert count("SELECT COUNT(*) FROM jobs WHERE type='prepare'") == 2


def test_failed_lecture_is_not_reused_but_kept_and_still_retryable(client):
    first = up(client).json()
    assert wait_job(client, first["jobId"])["status"] == "completed"
    with module().conn() as db:
        db.execute("UPDATE lectures SET status='failed',error='{}' WHERE id=?", (first["lectureId"],))
        db.execute("UPDATE jobs SET status='failed',stage='failed' WHERE id=?", (first["jobId"],))
        before = [tuple(r) for r in db.execute("SELECT id,title,pdf_path,status,pdf_sha256 FROM lectures")]
    fresh = up(client).json()
    assert fresh["lectureId"] != first["lectureId"] and fresh["jobId"] != first["jobId"]
    assert wait_job(client, fresh["jobId"])["status"] == "completed"
    with module().conn() as db:
        kept = [tuple(r) for r in db.execute("SELECT id,title,pdf_path,status,pdf_sha256 FROM lectures WHERE id=?", (first["lectureId"],))]
    assert kept == before and (module().ROOT / "lectures" / first["lectureId"] / "original.pdf").is_file()
    assert up(client).json()["lectureId"] == fresh["lectureId"]  # the new one is now the reusable lecture
    retry = client.post(f"/jobs/{first['jobId']}/retry", json={})  # old record can still be retried, no key clash
    assert retry.status_code == 202
    assert wait_job(client, retry.json()["jobId"])["status"] == "completed"
    assert len(listing(client)) == 1


def test_reused_upload_leaves_no_extra_copy_and_keeps_limits(client, monkeypatch):
    first = up(client).json()
    up(client)
    assert sorted(p.name for p in (module().ROOT / "lectures").iterdir()) == [first["lectureId"]]
    r = up(client, b"%PDF-1.4 ok", name="x.txt")
    assert r.status_code == 415
    r = up(client, b"not a pdf", name="x.pdf")
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_PDF"
    monkeypatch.setattr(module(), "MAX_BYTES", 10)
    assert up(client, SAME + b"x").status_code == 413


def test_sample_and_real_results_do_not_mix(client, monkeypatch):
    m = module()
    sample = up(client).json()
    monkeypatch.setattr(m, "AI_MODE", "real")
    monkeypatch.setattr(m, "dispatch", lambda jid: None)  # never run anything
    real = up(client).json()
    assert real["lectureId"] != sample["lectureId"]


def make_old_duplicates(client, with_clips_on_first):
    """Emulate rows from before this feature: same PDF, no hash/key/mode, several lectures."""
    ids = []
    for i in range(3):
        r = up(client, name=f"dup{i}.pdf").json()
        assert wait_job(client, r["jobId"])["status"] == "completed"
        ids.append(r["lectureId"])
        with module().conn() as db:  # make the next upload create a fresh row, then blank the new columns
            db.execute("UPDATE lectures SET reuse_key=NULL,pdf_sha256=NULL,ai_mode=NULL WHERE id=?", (r["lectureId"],))
    if with_clips_on_first:
        client.post(f"/lectures/{ids[0]}/outlines", json={"mode": "intro"})
        outline = wait_clips(client, ids[0])
        assert outline["clips"] and all(c["status"] == "completed" for c in outline["clips"])
    return ids


def test_newest_ready_lecture_is_the_representative_even_if_an_older_one_has_clips(client):
    """Q-FE-19 fix: an old (possibly garbled) lecture with finished clips must not hide a newer ready one."""
    ids = make_old_duplicates(client, with_clips_on_first=True)
    assert count("SELECT COUNT(*) FROM clips WHERE status='completed'") >= 2  # the old lecture has clips
    shown = listing(client)
    assert [l["id"] for l in shown] == [ids[-1]]  # newest ready lecture, which has 0 clips
    assert set(shown[0]) == {"id", "title", "status", "pageCount"}
    clips_before = count("SELECT COUNT(*) FROM clips")
    for lid in ids:  # nothing deleted: every ID still opens, PDFs, jobs and clips intact
        assert client.get(f"/lectures/{lid}").status_code == 200
        assert (module().ROOT / "lectures" / lid / "original.pdf").read_bytes() == SAME
    assert count("SELECT COUNT(*) FROM lectures") == 3 and count("SELECT COUNT(*) FROM clips") == clips_before
    old_clips = client.get(f"/lectures/{ids[0]}/outlines/intro").json()["clips"]
    assert old_clips and all(c["status"] == "completed" for c in old_clips)  # still reachable by ID
    assert client.get(f"/clips/{old_clips[0]['id']}").json()["result"] is not None


def test_pending_newer_lecture_does_not_replace_a_ready_one(client, monkeypatch):
    ids = make_old_duplicates(client, with_clips_on_first=False)
    monkeypatch.setattr(module(), "dispatch", lambda jid: None)  # the new upload stays pending
    fresh = up(client, name="newest.pdf").json()
    assert fresh["lectureId"] not in ids
    assert client.get(f"/lectures/{fresh['lectureId']}").json()["status"] == "pending"
    assert [l["id"] for l in listing(client)] == [ids[-1]]  # ready stays until the new one is ready
    with module().conn() as db:
        db.execute("UPDATE lectures SET status='ready' WHERE id=?", (fresh["lectureId"],))
    assert [l["id"] for l in listing(client)] == [fresh["lectureId"]]


def test_failed_newest_lecture_falls_back_to_the_previous_ready_one(client):
    ids = make_old_duplicates(client, with_clips_on_first=True)
    with module().conn() as db:
        db.execute("UPDATE lectures SET status='failed' WHERE id=?", (ids[-1],))
    assert [l["id"] for l in listing(client)] == [ids[1]]  # next newest ready, not the failed one
    with module().conn() as db:
        db.execute("UPDATE lectures SET status='failed' WHERE id=?", (ids[1],))
    assert [l["id"] for l in listing(client)] == [ids[0]]  # the older ready lecture (with clips) when it is the only ready


def test_other_owner_and_other_pdf_are_not_affected_by_the_rule(client):
    ids = make_old_duplicates(client, with_clips_on_first=True)
    other_owner = up(client, SAME, owner=B).json()["lectureId"]
    other_pdf = up(client, OTHER, name="different.pdf").json()["lectureId"]
    assert [l["id"] for l in listing(client)] == [other_pdf, ids[-1]]
    assert [l["id"] for l in listing(client, B)] == [other_owner]


def test_old_duplicates_without_clips_pick_newest_ready_and_other_pdfs_stay(client):
    ids = make_old_duplicates(client, with_clips_on_first=False)
    other = up(client, OTHER, name="other.pdf").json()["lectureId"]
    shown = [l["id"] for l in listing(client)]
    assert shown == [other, ids[-1]]
    # Old rows never become reusable for uploads: the same PDF creates a new lecture instead of an old result.
    again = up(client).json()
    assert again["lectureId"] not in ids


def test_failed_old_duplicate_loses_to_ready_one(client):
    ids = make_old_duplicates(client, with_clips_on_first=False)
    with module().conn() as db:
        db.execute("UPDATE lectures SET status='failed' WHERE id=?", (ids[-1],))
    assert [l["id"] for l in listing(client)] == [ids[1]]


def test_legacy_database_gets_columns_without_touching_rows_or_files(client, tmp_path, monkeypatch):
    m = module()
    pdf = tmp_path / "old" / "original.pdf"
    pdf.parent.mkdir()
    pdf.write_bytes(SAME)
    legacy = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(legacy) as db:
        db.execute("CREATE TABLE lectures (id TEXT PRIMARY KEY, title TEXT, pdf_path TEXT, page_count INTEGER, status TEXT NOT NULL, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, owner_id TEXT)")
        for i in (1, 2):
            db.execute("INSERT INTO lectures(id,title,pdf_path,page_count,status,owner_id) VALUES(?,?,?,2,'ready',?)", (f"lec_old{i}", f"old{i}.pdf", str(pdf), A))
    monkeypatch.setattr(m, "DB", legacy)
    m.setup()
    m.setup()  # idempotent
    with m.conn() as db:
        cols = [c["name"] for c in db.execute("PRAGMA table_info(lectures)")]
        before = [tuple(r)[:7] for r in db.execute("SELECT * FROM lectures ORDER BY id")]
    assert {"pdf_sha256", "ai_mode", "reuse_key"} <= set(cols)
    assert [l["id"] for l in listing(client)] == ["lec_old2"]  # newest of the identical pair
    with m.conn() as db:
        after = [tuple(r)[:7] for r in db.execute("SELECT * FROM lectures ORDER BY id")]
        hashes = [r["pdf_sha256"] for r in db.execute("SELECT pdf_sha256 FROM lectures")]
        keys = [r["reuse_key"] for r in db.execute("SELECT reuse_key FROM lectures")]
    assert after == before and pdf.read_bytes() == SAME
    assert hashes == [hashlib.sha256(SAME).hexdigest()] * 2 and keys == [None, None]
