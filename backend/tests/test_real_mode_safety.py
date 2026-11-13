"""D-44/D-45: isolated DBs and fake AI only; never load .env or call providers."""
import importlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading

import pytest
from fastapi.testclient import TestClient

from backend.pipeline import Pipeline, get_ai_mode
from test_api import wait_job
from test_ai_module_compat import (  # noqa: F401 (reuse fake AI and safety fixtures)
    forbid_real_ai, live, prepared, upload, wait_clips,
)


@pytest.fixture(autouse=True)
def forbid_env_loading(monkeypatch, forbid_real_ai):
    import pipeline

    def forbidden():
        raise AssertionError(".env must not be read in safety tests")

    monkeypatch.setattr(pipeline, "_load_env", forbidden)
    monkeypatch.setenv("SAMPLE_MP4", "0")


def restart(live):
    module = live.app_module
    module._executor.shutdown(wait=True)
    importlib.reload(module)
    return TestClient(module.app)


def queued(live, monkeypatch, kind):
    """Stop dispatch at each boundary, without inventing a different DB schema."""
    module = live.app_module
    monkeypatch.setattr(module, "dispatch", lambda jid: None)
    lid, jid = upload(live)
    if kind == "prepare":
        return lid, jid, lid
    module.execute(jid)
    assert live.get(f"/lectures/{lid}").json()["status"] == "ready"
    ticket = live.post(f"/lectures/{lid}/outlines", json={"mode": "intro"}).json()
    if kind == "outline":
        return lid, ticket["jobId"], ticket["outlineId"]
    module.execute(ticket["jobId"])
    clip = live.get(f"/lectures/{lid}/outlines/intro").json()["clips"][0]
    return lid, clip["jobId"], clip["id"]


def assert_interrupted(client, lid, jid, target, kind):
    job = client.get(f"/jobs/{jid}").json()
    assert (job["status"], job["stage"]) == ("failed", "interrupted")
    assert job["error"] == {
        "code": "SERVER_RESTARTED",
        "message": "서버 재시작으로 중단되었습니다. 다시 시도해 주세요.",
        "retryable": True,
    }
    lecture = client.get(f"/lectures/{lid}").json()
    assert lecture["status"] == ("failed" if kind == "prepare" else "ready")
    if kind == "prepare":
        with sys.modules["backend.app"].conn() as db:
            error = db.execute("SELECT error FROM lectures WHERE id=?", (lid,)).fetchone()[0]
        assert json.loads(error) == job["error"]
    else:
        outline = client.get(f"/lectures/{lid}/outlines/intro").json()
        assert outline["status"] == ("failed" if kind == "outline" else "ready")
        if kind == "clip":
            clip = client.get(f"/clips/{target}").json()
            listed = next(c for c in outline["clips"] if c["id"] == target)
            assert clip["status"] == listed["status"] == "failed"
            assert clip["error"] == listed["error"] == job["error"]
            assert clip["result"] is None


@pytest.mark.parametrize("kind", ["prepare", "outline", "clip"])
@pytest.mark.parametrize("crash", ["pending", "running", "claimed"])
def test_real_restart_fails_jobs_and_targets_without_ai_and_allows_retry(live, monkeypatch, kind, crash):
    lid, jid, target = queued(live, monkeypatch, kind)
    module = live.app_module
    if crash != "pending":
        with module.conn() as db:
            db.execute("UPDATE jobs SET status='running' WHERE id=?", (jid,))
            if crash == "running":
                table = {"prepare": "lectures", "outline": "outlines", "clip": "clips"}[kind]
                state = "planning" if kind == "outline" else "running"
                db.execute(f"UPDATE {table} SET status=? WHERE id=?", (state, target))
    calls_before = list(live.fake.CALLS)
    with restart(live) as fresh:
        module._executor.shutdown(wait=True)  # drain any accidental automatic dispatch
        assert live.fake.CALLS == calls_before
        assert_interrupted(fresh, lid, jid, target, kind)
        dispatched = []
        monkeypatch.setattr(module, "dispatch", dispatched.append)
        assert module.resume_pending() == 0 and not dispatched

    # A second restart preserves the failure; only this POST starts new work.
    with restart(live) as fresh:
        assert_interrupted(fresh, lid, jid, target, kind)
        retry = fresh.post(f"/jobs/{jid}/retry")
        assert retry.status_code == 202
        new = retry.json()
        assert new["retryOf"] == jid and new["jobId"] != jid
        assert wait_job(fresh, new["jobId"])["status"] == "completed"
        assert fresh.get(f"/jobs/{jid}").json()["status"] == "failed"
        assert fresh.post(f"/jobs/{jid}/retry").status_code == 409
        if kind == "prepare":
            lecture = fresh.get(f"/lectures/{lid}").json()
            assert lecture["status"] == "ready" and lecture["preparationJobId"] == new["jobId"]
        elif kind == "outline":
            assert all(c["status"] == "completed" for c in wait_clips(fresh, lid)["clips"])
        else:
            clip = fresh.get(f"/clips/{target}").json()
            assert clip["status"] == "completed" and clip["error"] is None
            assert clip["result"]["sample"] is False


@pytest.mark.parametrize("kind", ["prepare", "outline", "clip"])
def test_sample_restart_fails_claimed_job_even_if_target_is_still_pending(live, monkeypatch, kind):
    lid, jid, target = queued(live, monkeypatch, kind)
    with live.app_module.conn() as db:
        db.execute("UPDATE jobs SET status='running' WHERE id=?", (jid,))
    monkeypatch.setenv("AI_MODE", "sample")
    with restart(live) as fresh:
        assert_interrupted(fresh, lid, jid, target, kind)


def test_sample_pending_outline_resumes(live, monkeypatch):
    lid, jid, _ = queued(live, monkeypatch, "outline")
    monkeypatch.setenv("AI_MODE", "sample")
    with restart(live) as fresh:
        assert wait_job(fresh, jid)["status"] == "completed"
        assert all(c["status"] == "completed" for c in wait_clips(fresh, lid)["clips"])


@pytest.mark.parametrize("mode,override,expected", [
    (None, None, 1), ("sample", None, 1), ("sample", "4", 4), ("sample", "0", 1),
    ("real", None, 3), ("real", "1", 1), ("real", "2", 2),
    ("real", "3", 3), ("real", "4", 3), ("real", "99", 3),
])
def test_mode_defaults_worker_limits_and_health(live, monkeypatch, mode, override, expected):
    for name, value in (("AI_MODE", mode), ("BE_WORKERS", override)):
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
    with restart(live) as fresh:
        canonical = mode or "sample"
        assert get_ai_mode() == canonical
        assert fresh.get("/health").json() == {"status": "ok", "aiMode": canonical}
        assert Pipeline().sample == (canonical == "sample")
        assert live.app_module.WORKERS == live.app_module._executor._max_workers == expected


@pytest.mark.parametrize("mode", ["samle", "live", "", "REAL", " sample ", "false"])
def test_invalid_mode_rejects_adapter_and_server_before_db_creation(tmp_path, monkeypatch, mode):
    monkeypatch.setenv("AI_MODE", mode)
    with pytest.raises(ValueError, match="AI_MODE.*sample.*real"):
        Pipeline()
    root = tmp_path / "must-not-be-created"
    environment = dict(os.environ, TEAM19_DATA_DIR=str(root), AI_MODE=mode,
                       AI_PIPELINE_MODULE="no_paid_module", PYTHONDONTWRITEBYTECODE="1")
    result = subprocess.run([sys.executable, "-c", "import backend.app"],
                            cwd=Path(__file__).resolve().parents[2], env=environment,
                            capture_output=True, timeout=15)
    assert result.returncode != 0
    assert b"AI_MODE must be 'sample' or 'real'" in result.stderr
    assert not root.exists()


def test_real_completed_results_survive_restart(live):
    lid = prepared(live)
    live.post(f"/lectures/{lid}/outlines", json={"mode": "intro"})
    outline = wait_clips(live, lid)
    before = [live.get(f"/clips/{c['id']}").json() for c in outline["clips"]]
    calls = list(live.fake.CALLS)
    with restart(live) as fresh:
        assert fresh.get(f"/lectures/{lid}/outlines/intro").json() == outline
        assert [fresh.get(f"/clips/{c['id']}").json() for c in outline["clips"]] == before
        assert live.fake.CALLS == calls


def test_same_job_dispatched_concurrently_runs_only_once(live, monkeypatch):
    monkeypatch.delenv("BE_WORKERS")
    with restart(live) as fresh:
        fresh.app_module = live.app_module
        lid, jid, _ = queued(fresh, monkeypatch, "prepare")
        entered, release = threading.Event(), threading.Event()
        calls = []
        original = live.fake.extract_pdf

        def blocked(*args):
            calls.append(1)
            entered.set()
            assert release.wait(10)
            return original(*args)

        monkeypatch.setattr(live.fake, "extract_pdf", blocked)
        executor = live.app_module._executor
        first = executor.submit(live.app_module.execute, jid)
        try:
            assert entered.wait(5)
            duplicates = [executor.submit(live.app_module.execute, jid) for _ in range(8)]
            for future in duplicates:
                future.result(timeout=5)
            assert len(calls) == 1
        finally:
            release.set()
            first.result(timeout=10)
        assert wait_job(fresh, jid)["status"] == "completed"
        assert fresh.get(f"/lectures/{lid}").json()["status"] == "ready"
        with live.app_module.conn() as db:
            assert db.execute("SELECT COUNT(*) FROM pages WHERE lecture_id=?", (lid,)).fetchone()[0] == 2


def test_three_real_clips_generate_and_store_concurrently(live, monkeypatch):
    monkeypatch.delenv("BE_WORKERS")
    with restart(live) as fresh:
        lid = prepared(fresh)
        three_entered, release, lock = threading.Event(), threading.Event(), threading.Lock()
        active, peak = 0, 0
        original = live.fake.make_blueprint

        def blocked(*args):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
                if active == 3:
                    three_entered.set()
            try:
                assert release.wait(10)
                return original(*args)
            finally:
                with lock:
                    active -= 1

        monkeypatch.setattr(live.fake, "make_blueprint", blocked)
        try:
            for mode in ("intro", "review"):
                assert fresh.post(f"/lectures/{lid}/outlines", json={"mode": mode}).status_code == 202
            assert three_entered.wait(5), "three distinct real-mode jobs did not run together"
            assert peak == 3
        finally:
            release.set()
        clips = [c for mode in ("intro", "review") for c in wait_clips(fresh, lid, mode)["clips"]]
        assert len(clips) == 4 and all(c["status"] == "completed" for c in clips)
        results = [fresh.get(f"/clips/{c['id']}").json()["result"] for c in clips]
        assert len({r["resultId"] for r in results}) == len({r["audioUrl"] for r in results}) == 4
        assert all(fresh.get(r["audioUrl"]).status_code == 200 and r["sample"] is False for r in results)
        with live.app_module.conn() as db:
            assert db.execute("PRAGMA quick_check").fetchone()[0] == "ok"
            assert db.execute("SELECT COUNT(*) FROM jobs WHERE status!='completed'").fetchone()[0] == 0
