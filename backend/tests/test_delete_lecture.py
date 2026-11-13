"""Permanent lecture deletion: DELETE /lectures/{id} with X-Owner-Id (a device label, not authentication).

Sample mode, temp SQLite and temp files, no AI calls. Only the requesting owner's identical-PDF lectures go.
"""
import json
import sqlite3
import sys
import threading
from pathlib import Path

import pytest

from test_api import client, pdf_bytes, wait_job  # noqa: F401
from test_ai_module_compat import wait_clips  # noqa: F401
from test_pdf_dedup import A, B, OTHER, SAME, count, module, up

TABLES = ("lectures", "pages", "outlines", "clips", "jobs", "job_usage", "assets")


def delete(client, lid, owner=A):
    return client.delete(f"/lectures/{lid}", headers={} if owner is None else {"X-Owner-Id": owner})


def build(client, data=SAME, owner=A, name="lecture.pdf"):
    """A lecture with finished prepare, outline and clips (sample mode, MP4 preview on)."""
    ticket = up(client, data, owner, name).json()
    lid = ticket["lectureId"]
    assert wait_job(client, ticket["jobId"])["status"] == "completed"
    assert client.post(f"/lectures/{lid}/outlines", json={"mode": "intro"}).status_code == 202
    outline = wait_clips(client, lid)
    assert outline["clips"] and all(c["status"] == "completed" for c in outline["clips"])
    for c in outline["clips"]:
        wait_job(client, c["jobId"])
    return lid, outline


def snapshot(lid):
    """Every row and folder that belongs to one lecture, found through the database."""
    m = module()
    with m.conn() as db:
        outlines = [r["id"] for r in db.execute("SELECT id FROM outlines WHERE lecture_id=?", (lid,))]
        clips = [r["id"] for o in outlines for r in db.execute("SELECT id FROM clips WHERE outline_id=?", (o,))]
        targets = [lid] + outlines + clips
        jobs = [r["id"] for t in targets for r in db.execute("SELECT id FROM jobs WHERE target_id=?", (t,))]
        lecture_dir, clip_dirs = m.ROOT / "lectures" / lid, [m.ROOT / "clips" / c for c in clips]
        assets = [r["id"] for r in db.execute("SELECT id,path FROM assets") if any(
            Path(r["path"]).resolve().is_relative_to(d) for d in [lecture_dir] + clip_dirs)]
    return {"lecture": lid, "outlines": outlines, "clips": clips, "jobs": jobs, "assets": assets,
            "dirs": [lecture_dir] + clip_dirs}


def table_counts():
    return {t: count(f"SELECT COUNT(*) FROM {t}") for t in TABLES}


def usage_rows(job_ids):
    with module().conn() as db:
        return sum(db.execute("SELECT COUNT(*) FROM job_usage WHERE job_id=?", (j,)).fetchone()[0] for j in job_ids)


def test_owner_deletes_everything_of_the_lecture(client):
    lid, outline = build(client)
    snap = snapshot(lid)
    assert snap["jobs"] and snap["assets"] and usage_rows(snap["jobs"]) > 0
    assert (snap["dirs"][0] / "original.pdf").is_file() and any(p.suffix == ".mp4" for d in snap["dirs"][1:] for p in d.rglob("*"))
    clip = client.get(f"/clips/{snap['clips'][0]}").json()
    audio_url = clip["result"]["audioUrl"]
    page_url = client.get(f"/lectures/{lid}").json()["pages"][0]["imageUrl"]
    assert client.get(audio_url).status_code == 200 and client.get(page_url).status_code == 200

    r = delete(client, lid)
    assert r.status_code == 204 and r.content == b""
    assert table_counts() == {t: 0 for t in TABLES}
    assert not any(d.exists() for d in snap["dirs"])
    assert not (module().ROOT / ".trash").exists() or not list((module().ROOT / ".trash").iterdir())
    assert client.get(f"/lectures/{lid}").status_code == 404
    assert client.get(f"/lectures/{lid}/outlines/intro").status_code == 404
    for cid in snap["clips"]:
        assert client.get(f"/clips/{cid}").status_code == 404
    for jid in snap["jobs"]:
        assert client.get(f"/jobs/{jid}").status_code == 404
    assert client.get(audio_url).status_code == 404 and client.get(page_url).status_code == 404
    assert client.get("/lectures", headers={"X-Owner-Id": A}).json() == []
    assert client.post(f"/lectures/{lid}/outlines", json={"mode": "review"}).status_code == 404
    assert client.post(f"/jobs/{snap['jobs'][0]}/retry", json={}).status_code == 404


def test_shared_development_samples_are_not_touched(client):
    lid, _ = build(client)
    assert delete(client, lid).status_code == 204
    assert client.get("/clips/clip-01").status_code == 200
    assert client.get("/assets/clip-01-audio").status_code == 200


def test_other_owner_ownerless_and_missing_lectures_are_404_and_untouched(client):
    lid, _ = build(client)
    before = table_counts()
    assert delete(client, lid, B).status_code == 404
    assert delete(client, "lec_doesnotexist0000").status_code == 404
    assert client.delete(f"/lectures/{lid}", headers={"X-Owner-Id": B}).json()["error"]["code"] == "LECTURE_NOT_FOUND"
    ownerless = up(client, OTHER, owner=None).json()["lectureId"]
    assert delete(client, ownerless).status_code == 404 and delete(client, ownerless, B).status_code == 404
    assert table_counts()["lectures"] == before["lectures"] + 1
    assert (module().ROOT / "lectures" / ownerless / "original.pdf").is_file()
    assert client.get(f"/lectures/{lid}").status_code == 200


@pytest.mark.parametrize("bad", ["short", "a" * 65, "has space 1234567890", "id;DROP TABLE x;--"])
def test_missing_or_malformed_owner_header_is_422_and_deletes_nothing(client, bad):
    lid, _ = build(client)
    before = table_counts()
    r = delete(client, lid, None)
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_REQUEST"
    assert delete(client, lid, bad).status_code == 422
    assert table_counts() == before and (module().ROOT / "lectures" / lid / "original.pdf").is_file()


def make_duplicates(client, owner=A, count_=3):
    """Emulate rows from before Q-FE-19: same PDF, no hash and no reuse key, several lectures."""
    ids = []
    for i in range(count_):
        r = up(client, SAME, owner, f"dup{i}.pdf").json()
        assert wait_job(client, r["jobId"])["status"] == "completed"
        ids.append(r["lectureId"])
        with module().conn() as db:
            db.execute("UPDATE lectures SET reuse_key=NULL,pdf_sha256=NULL,ai_mode=NULL WHERE id=?", (r["lectureId"],))
    return ids


def test_deleting_one_list_entry_removes_all_identical_pdfs_of_that_owner_only(client):
    dups = make_duplicates(client)
    dups_snap = [snapshot(i) for i in dups]
    other_pdf = build(client, OTHER, A, "different.pdf")[0]
    other_owner = build(client, SAME, B, "same-but-b.pdf")[0]
    ownerless = up(client, SAME, owner=None).json()["lectureId"]
    keep = [snapshot(i) for i in (other_pdf, other_owner, ownerless)]

    shown = client.get("/lectures", headers={"X-Owner-Id": A}).json()
    assert len([s for s in shown if s["id"] in dups]) == 1  # the list shows one representative
    representative = next(s["id"] for s in shown if s["id"] in dups)
    assert delete(client, representative).status_code == 204
    for snap in dups_snap:  # all identical lectures are gone: no old duplicate resurfaces
        assert client.get(f"/lectures/{snap['lecture']}").status_code == 404
        assert not any(d.exists() for d in snap["dirs"])
    assert [s["id"] for s in client.get("/lectures", headers={"X-Owner-Id": A}).json()] == [other_pdf]
    for snap in keep:  # different PDF, other owner and ownerless copy keep everything
        assert client.get(f"/lectures/{snap['lecture']}").status_code == 200
        assert all(d.exists() for d in snap["dirs"])
        assert all(client.get(f"/jobs/{j}").status_code == 200 for j in snap["jobs"])
    assert [s["id"] for s in client.get("/lectures", headers={"X-Owner-Id": B}).json()] == [other_owner]


def test_deleting_any_duplicate_id_also_removes_the_group(client):
    dups = make_duplicates(client)
    assert delete(client, dups[0]).status_code == 204  # not the representative
    assert all(client.get(f"/lectures/{i}").status_code == 404 for i in dups)


def test_same_pdf_uploaded_again_gets_a_new_lecture_and_job(client):
    old = up(client).json()
    assert wait_job(client, old["jobId"])["status"] == "completed"
    assert delete(client, old["lectureId"]).status_code == 204
    new = up(client, name="again.pdf").json()
    assert new["lectureId"] != old["lectureId"] and new["jobId"] != old["jobId"]
    assert wait_job(client, new["jobId"])["status"] == "completed"
    assert client.get(f"/lectures/{new['lectureId']}").json()["status"] == "ready"
    assert [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": A}).json()] == [new["lectureId"]]


@pytest.mark.parametrize("kind", ["prepare", "clip"])
def test_running_job_gives_409_and_deletes_nothing(client, kind):
    lid, outline = build(client)
    snap = snapshot(lid)
    prepare_job = client.get(f"/lectures/{lid}").json()["preparationJobId"]
    victim = prepare_job if kind == "prepare" else outline["clips"][0]["jobId"]
    with module().conn() as db:
        db.execute("UPDATE jobs SET status='running' WHERE id=?", (victim,))
    before = table_counts()
    r = delete(client, lid)
    assert r.status_code == 409 and r.json()["error"]["code"] == "LECTURE_BUSY"
    assert table_counts() == before and all(d.exists() for d in snap["dirs"])
    with module().conn() as db:
        db.execute("UPDATE jobs SET status='completed' WHERE id=?", (victim,))
    assert delete(client, lid).status_code == 204  # allowed once nothing is running


def test_running_job_of_a_duplicate_blocks_the_whole_group(client):
    dups = make_duplicates(client)
    with module().conn() as db:
        jid = db.execute("SELECT id FROM jobs WHERE target_id=?", (dups[1],)).fetchone()["id"]
        db.execute("UPDATE jobs SET status='running' WHERE id=?", (jid,))
    assert delete(client, dups[0]).status_code == 409
    assert all(client.get(f"/lectures/{i}").status_code == 200 for i in dups)


def test_pending_job_is_removed_and_a_late_worker_does_nothing(client, monkeypatch):
    m = module()
    monkeypatch.setattr(m, "dispatch", lambda jid: None)  # the job stays pending
    ticket = up(client).json()
    assert client.get(f"/jobs/{ticket['jobId']}").json()["status"] == "pending"
    assert delete(client, ticket["lectureId"]).status_code == 204
    m.execute(ticket["jobId"])  # a worker that had already queued the job
    assert table_counts() == {t: 0 for t in TABLES}
    assert not (m.ROOT / "lectures" / ticket["lectureId"]).exists()


def test_delete_racing_a_worker_never_leaves_a_half_deleted_lecture(client, monkeypatch):
    m = module()
    monkeypatch.setattr(m, "dispatch", lambda jid: None)
    for i in range(4):
        ticket = up(client, SAME + f"\n%{i}\n".encode()).json()
        barrier = threading.Barrier(2)
        outcome = {}

        def worker():
            barrier.wait(5)
            m.execute(ticket["jobId"])

        def deleter():
            barrier.wait(5)
            outcome["status"] = delete(client, ticket["lectureId"]).status_code

        threads = [threading.Thread(target=worker), threading.Thread(target=deleter)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(30)
        assert outcome["status"] in (204, 409)
        lecture_rows = count("SELECT COUNT(*) FROM lectures WHERE id=?", (ticket["lectureId"],))
        job_rows = count("SELECT COUNT(*) FROM jobs WHERE id=?", (ticket["jobId"],))
        folder = (m.ROOT / "lectures" / ticket["lectureId"]).exists()
        if outcome["status"] == 204:
            assert (lecture_rows, job_rows, folder) == (0, 0, False)
            assert count("SELECT COUNT(*) FROM pages WHERE lecture_id=?", (ticket["lectureId"],)) == 0
        else:  # the worker claimed the job first: nothing was deleted
            assert (lecture_rows, job_rows, folder) == (1, 1, True)


def test_file_move_error_restores_everything_and_reports_503(client, monkeypatch):
    m = module()
    lid, _ = build(client)
    snap = snapshot(lid)
    before = table_counts()
    real_move, calls = m._move, []

    def flaky(src, dst):
        calls.append(src)
        if len(calls) == 2:
            raise PermissionError("file in use")
        real_move(src, dst)

    monkeypatch.setattr(m, "_move", flaky)
    r = delete(client, lid)
    assert r.status_code == 503 and r.json()["error"]["code"] == "STORAGE_UNAVAILABLE"
    assert table_counts() == before and all(d.exists() for d in snap["dirs"])
    assert (snap["dirs"][0] / "original.pdf").is_file()
    assert not (m.ROOT / ".trash").exists() or not list((m.ROOT / ".trash").iterdir())
    monkeypatch.setattr(m, "_move", real_move)
    assert delete(client, lid).status_code == 204  # and a retry works


def test_database_error_rolls_back_rows_and_puts_folders_back(client, monkeypatch):
    m = module()
    lid, _ = build(client)
    snap = snapshot(lid)
    before = table_counts()
    real = m.delete_rows

    def half_done(db, lectures, outlines, clips, jobs, assets):
        m.delete_in(db, "DELETE FROM job_usage WHERE job_id IN ({})", jobs)
        m.delete_in(db, "DELETE FROM jobs WHERE id IN ({})", jobs)
        raise sqlite3.OperationalError("disk I/O error")

    monkeypatch.setattr(m, "delete_rows", half_done)
    r = delete(client, lid)
    assert r.status_code == 503 and r.json()["error"]["code"] == "STORAGE_UNAVAILABLE"  # API error shape, not a crash
    assert table_counts() == before  # the partial deletes were rolled back
    assert all(d.exists() for d in snap["dirs"]) and (snap["dirs"][0] / "original.pdf").is_file()
    assert not (m.ROOT / ".trash").exists() or not list((m.ROOT / ".trash").iterdir())
    monkeypatch.setattr(m, "delete_rows", real)
    assert delete(client, lid).status_code == 204


def test_cleanup_failure_after_commit_is_reported_and_finished_on_restart(client, monkeypatch):
    m = module()
    lid, _ = build(client)
    snap = snapshot(lid)
    real_remove = m._remove_tree

    def broken(path):
        raise PermissionError("antivirus holds the file")

    monkeypatch.setattr(m, "_remove_tree", broken)
    r = delete(client, lid)
    assert r.status_code == 500 and r.json()["error"]["code"] == "STORAGE_CLEANUP_PENDING"
    assert client.get(f"/lectures/{lid}").status_code == 404 and table_counts() == {t: 0 for t in TABLES}
    leftovers = list((m.ROOT / ".trash").iterdir())
    assert len(leftovers) == 1 and not snap["dirs"][0].exists()
    monkeypatch.setattr(m, "_remove_tree", real_remove)
    m.recover_trash()  # what the next server start does
    assert not list((m.ROOT / ".trash").iterdir())


def test_crash_before_commit_is_undone_on_restart_and_after_commit_finished(client):
    """Folders in .trash whose lectures still exist are put back; those whose lectures are gone are removed."""
    m = module()
    alive = up(client).json()["lectureId"]
    assert wait_job(client, up(client).json()["jobId"])["status"] == "completed"
    folder = m.ROOT / "lectures" / alive
    trash = m.ROOT / ".trash" / "crashed"
    trash.mkdir(parents=True)
    m._move(folder, trash / "0")
    (trash / "manifest.json").write_text(json.dumps({"lectureIds": [alive], "moves": [{"name": "0", "original": str(folder)}]}))
    gone = m.ROOT / ".trash" / "finished"
    gone.mkdir()
    (gone / "0").mkdir()
    (gone / "manifest.json").write_text(json.dumps({"lectureIds": ["lec_gone0000000000"], "moves": [{"name": "0", "original": str(m.ROOT / "lectures" / "lec_gone0000000000")}]}))
    unknown = m.ROOT / ".trash" / "unknown"
    unknown.mkdir()
    m.recover_trash()
    assert (folder / "original.pdf").is_file() and not trash.exists() and not gone.exists()
    assert unknown.exists()  # no manifest: left alone


def test_only_real_folders_inside_root_are_ever_deleted(client, tmp_path):
    m = module()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "keep.txt").write_text("precious")
    assert m.owned_dir("lectures", "..") is None and m.owned_dir("lectures", "a/b") is None
    assert m.owned_dir("lectures", "..\\x") is None and m.owned_dir("lectures", str(outside)) is None
    assert m.owned_dir("lectures", "lec_missing0000000") is None
    # An asset row pointing outside the data folder, and one inside another lecture, must survive.
    lid, _ = build(client)
    other, _ = build(client, OTHER, A, "other.pdf")
    other_audio = snapshot(other)["assets"][0]
    with m.conn() as db:
        db.execute("INSERT INTO assets(id,path,mime) VALUES('asset_outside0000000',?,'text/plain')", (str(outside / "keep.txt"),))
        # A lecture row whose pdf_path lies outside ROOT: deletion goes by ROOT folders, never by that path.
        db.execute("UPDATE lectures SET pdf_path=? WHERE id=?", (str(outside / "keep.txt"), lid))
    assert delete(client, lid).status_code == 204
    assert (outside / "keep.txt").read_text() == "precious"
    assert count("SELECT COUNT(*) FROM assets WHERE id='asset_outside0000000'") == 1
    assert count("SELECT COUNT(*) FROM assets WHERE id=?", (other_audio,)) == 1


def test_cors_allows_delete_with_the_owner_header_and_keeps_other_methods(client):
    origin = "http://localhost:5173"
    for method in ("DELETE", "GET", "POST"):
        r = client.options("/lectures/lec_x", headers={"Origin": origin, "Access-Control-Request-Method": method,
                                                      "Access-Control-Request-Headers": "x-owner-id"})
        assert r.status_code == 200 and r.headers["access-control-allow-origin"] == origin
        assert method in r.headers["access-control-allow-methods"]
    assert "access-control-allow-origin" not in client.options("/lectures/lec_x", headers={
        "Origin": "https://evil.example", "Access-control-request-method": "DELETE"}).headers


def test_existing_flows_still_work_after_a_delete(client):
    a, _ = build(client)
    b, _ = build(client, OTHER, A, "b.pdf")
    assert delete(client, a).status_code == 204
    assert [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": A}).json()] == [b]
    again = up(client, OTHER, A).json()  # same PDF as b is still reused
    assert again["lectureId"] == b


def test_selecting_several_entries_and_deleting_them_one_by_one(client):
    """FE flow: check several list entries, then send one DELETE per entry and refresh the list."""
    first, _ = build(client, SAME, A, "one.pdf")
    second, _ = build(client, OTHER, A, "two.pdf")
    third, _ = build(client, SAME + b"\n%third\n", A, "three.pdf")
    keep_other_owner, _ = build(client, SAME, B, "b.pdf")
    shown = [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": A}).json()]
    assert sorted(shown) == sorted([first, second, third])
    results = [delete(client, lid).status_code for lid in (first, third)]
    assert results == [204, 204]
    assert [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": A}).json()] == [second]
    # An id that an earlier delete in the same batch already removed (same-PDF group) is a plain 404 for the FE.
    assert delete(client, first).status_code == 404
    assert delete(client, second).status_code == 204
    assert client.get("/lectures", headers={"X-Owner-Id": A}).json() == []
    assert [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": B}).json()] == [keep_other_owner]


def test_every_delete_outcome_has_its_own_status_and_code_for_the_fe(client):
    lid, outline = build(client)
    with module().conn() as db:
        db.execute("UPDATE jobs SET status='running' WHERE id=?", (outline["clips"][0]["jobId"],))
    outcomes = {
        "busy": delete(client, lid),
        "not_found": delete(client, "lec_unknown00000000"),
        "other_owner": delete(client, lid, B),
        "bad_header": delete(client, lid, "x"),
        "no_header": delete(client, lid, None),
    }
    shape = {k: (r.status_code, r.json()["error"]["code"]) for k, r in outcomes.items()}
    assert shape == {"busy": (409, "LECTURE_BUSY"), "not_found": (404, "LECTURE_NOT_FOUND"),
                     "other_owner": (404, "LECTURE_NOT_FOUND"), "bad_header": (422, "INVALID_REQUEST"),
                     "no_header": (422, "INVALID_REQUEST")}
    assert all(r.json()["error"]["retryable"] in (True, False) and r.json()["error"]["message"] for r in outcomes.values())


def test_representative_rule_and_delete_work_together(client):
    """Q-FE-19 + D-64: the newest ready lecture is shown (clips are ignored); deleting it removes the whole group
    and no old duplicate resurfaces; the same PDF uploaded again is a brand-new lecture."""
    old = make_duplicates(client, count_=3)
    for lid in old[:1]:  # the oldest duplicate has finished clips
        client.post(f"/lectures/{lid}/outlines", json={"mode": "intro"})
        assert all(c["status"] == "completed" for c in wait_clips(client, lid)["clips"])
    other = build(client, OTHER, A, "other.pdf")[0]
    other_owner = build(client, SAME, B, "b.pdf")[0]
    shown = [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": A}).json()]
    assert shown == [other, old[-1]]  # newest ready duplicate, not the older one with clips
    assert delete(client, old[-1]).status_code == 204
    after = [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": A}).json()]
    assert after == [other]  # no old duplicate comes back
    assert all(client.get(f"/lectures/{i}").status_code == 404 for i in old)
    assert client.get(f"/lectures/{other}").status_code == 200
    assert [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": B}).json()] == [other_owner]
    again = up(client, SAME, A, "again.pdf").json()
    assert again["lectureId"] not in old and again["jobId"]
    assert wait_job(client, again["jobId"])["status"] == "completed"
    assert [l["id"] for l in client.get("/lectures", headers={"X-Owner-Id": A}).json()] == [again["lectureId"], other]
