"""Job usage persistence: fake AI/sample only, isolated SQLite, no provider calls."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
import sqlite3
import threading

import pytest

from test_api import client, wait_job  # noqa: F401
from test_ai_module_compat import (  # noqa: F401
    forbid_real_ai, live, prepared, upload, wait_clips,
)


FUNCTIONS = {"describing": "describe_pages", "planning": "plan_outline",
             "blueprint": "make_blueprint", "audio": "make_audio"}


@pytest.fixture()
def metered(live, monkeypatch):
    monkeypatch.setenv("SAMPLE_MP4", "0")
    for name in FUNCTIONS.values():
        original = getattr(live.fake, name)

        def measured(*args, _original=original, _name=name):
            result = _original(*args)
            usage = {"provider": "fake", "model": _name, "costUsd": 0.0123}
            if _name == "make_audio":
                usage.update(costIsEstimate=True, newAudioSec=2, reusedLines=0, voice="test")
            else:
                usage.update(inputTokens=11, outputTokens=7, cacheReadTokens=3)
            # One stage can contain several provider calls, including the same model twice.
            result["usage"] = [usage, dict(usage)] if _name == "make_blueprint" else [usage]
            return result

        monkeypatch.setattr(live.fake, name, measured)
    return live


def records(module, jid=None):
    with module.conn() as db:
        rows = db.execute("SELECT * FROM job_usage" + (" WHERE job_id=?" if jid else ""),
                          (jid,) if jid else ()).fetchall()
    return {(r["job_id"], r["stage"]):
            (r["status"], json.loads(r["usage_json"]) if r["usage_json"] is not None else None)
            for r in rows}


def finish(client):
    lid = prepared(client)
    ticket = client.post(f"/lectures/{lid}/outlines", json={"mode": "intro"}).json()
    wait_job(client, ticket["jobId"])
    outline = wait_clips(client, lid)
    for clip in outline["clips"]:
        wait_job(client, clip["jobId"])  # Clip completion precedes the Job's final commit.
    return lid, ticket, outline


def test_sample_records_explicit_empty_usage_without_changing_api(client, monkeypatch):
    monkeypatch.setenv("SAMPLE_MP4", "0")
    lid, ticket = upload(client)
    assert wait_job(client, ticket)["status"] == "completed"
    started = client.post(f"/lectures/{lid}/outlines", json={"mode": "intro"}).json()
    assert wait_job(client, started["jobId"])["status"] == "completed"
    outline = wait_clips(client, lid)
    module = __import__("backend.app", fromlist=["app"])
    usage = records(module)
    assert len(usage) == 6 and all(r == ("recorded", []) for r in usage.values())
    job = client.get(f"/jobs/{ticket}").json()
    assert set(job) == {"id", "type", "status", "stage", "progress", "error"}
    clip = client.get(f"/clips/{outline['clips'][0]['id']}").json()
    assert set(clip) == {"id", "planId", "status", "error", "result"}
    assert clip["result"]["sample"] is True
    assert "usage" not in clip["result"]


def test_all_paid_stages_preserve_call_lists_and_tts_estimates(metered):
    lid, ticket, outline = finish(metered)
    usage = records(metered.app_module)
    prepare_id = metered.get(f"/lectures/{lid}").json()["preparationJobId"]
    expected = {(prepare_id, "describing"), (ticket["jobId"], "planning")}
    expected |= {(c["jobId"], stage) for c in outline["clips"] for stage in ("blueprint", "audio")}
    assert set(usage) == expected
    for (_, stage), (status, payload) in usage.items():
        assert status == "recorded" and payload[0]["model"] == FUNCTIONS[stage]
        assert payload[0]["costUsd"] == 0.0123
        if stage == "blueprint":
            assert len(payload) == 2 and payload[0] == payload[1]
        elif stage == "audio":
            assert payload[0]["costIsEstimate"] is True
            assert payload[0]["voice"] == "test" and "inputTokens" not in payload[0]


def run_to_stage(client, label):
    lid, jid = upload(client)
    if label == "describing":
        return [wait_job(client, jid)]
    assert wait_job(client, jid)["status"] == "completed"
    ticket = client.post(f"/lectures/{lid}/outlines", json={"mode": "intro"}).json()
    if label == "planning":
        return [wait_job(client, ticket["jobId"])]
    return [wait_job(client, c["jobId"]) for c in wait_clips(client, lid)["clips"]]


@pytest.mark.parametrize("label", FUNCTIONS)
@pytest.mark.parametrize("failure", ["call", "validation"])
def test_failed_call_is_unknown_but_returned_usage_survives_validation(metered, monkeypatch, label, failure):
    name = FUNCTIONS[label]
    if failure == "call":
        metered.fake.FAIL[name] = metered.fake.errors.PipelineError("PROVIDER_TIMEOUT", "fake", True)
    else:
        original = getattr(metered.fake, name)

        def invalid(*args):
            result = original(*args)
            if label == "describing":
                result["pages"] = [{"number": "invalid"}]
            elif label == "planning":
                result["clipPlans"] = []
            elif label == "blueprint":
                result["blueprint"] = {}
            else:
                result["captions"] = []
            return result

        monkeypatch.setattr(metered.fake, name, invalid)
    jobs = run_to_stage(metered, label)
    assert jobs and all(j["status"] == "failed" for j in jobs)
    usage = records(metered.app_module)
    if label != "describing":
        assert all(status == "recorded" for (_, stage), (status, _) in usage.items() if stage == "describing")
    if label in ("blueprint", "audio"):
        assert all(status == "recorded" for (_, stage), (status, _) in usage.items() if stage == "planning")
    for job in jobs:
        status, payload = usage[(job["id"], label)]
        if failure == "call":
            assert (status, payload) == ("unavailable", None)
        else:
            assert status == "recorded" and payload[0]["costUsd"] == 0.0123
        if label == "audio":
            assert usage[(job["id"], "blueprint")][0] == "recorded"
        if label == "blueprint":
            assert (job["id"], "audio") not in usage  # Not attempted is different from unknown.


@pytest.mark.parametrize("payload", [None, "missing", {}, ["bad"], [{"costUsd": float("nan")}], [{"bad": object()}]])
def test_missing_or_invalid_usage_is_not_zero_cost(metered, monkeypatch, payload):
    original = metered.fake.describe_pages

    def describe(*args):
        result = original(*args)
        if payload == "missing":
            result.pop("usage")
        else:
            result["usage"] = payload
        return result

    monkeypatch.setattr(metered.fake, "describe_pages", describe)
    _, jid = upload(metered)
    assert wait_job(metered, jid)["status"] == "completed"
    assert records(metered.app_module, jid) == {(jid, "describing"): ("unavailable", None)}


def test_previous_usage_is_committed_while_next_stage_is_running(metered, monkeypatch):
    entered, release = threading.Event(), threading.Event()

    def audio(*args):
        entered.set()
        assert release.wait(10)
        raise metered.fake.errors.PipelineError("TTS_FAILED", "fake", True)

    monkeypatch.setattr(metered.fake, "make_audio", audio)
    lid = prepared(metered)
    metered.post(f"/lectures/{lid}/outlines", json={"mode": "intro"})
    try:
        assert entered.wait(5)
        outline = metered.get(f"/lectures/{lid}/outlines/intro").json()
        jid = outline["clips"][0]["jobId"]
        assert records(metered.app_module, jid)[(jid, "blueprint")][0] == "recorded"
        assert records(metered.app_module, jid)[(jid, "audio")] == ("started", None)
    finally:
        release.set()
    assert all(c["status"] == "failed" for c in wait_clips(metered, lid)["clips"])


def test_concurrent_jobs_are_separate_and_same_stage_cannot_call_twice(metered):
    module = metered.app_module
    with module.conn() as db:
        ids = [module.job_create(db, "outline", "fake") for _ in range(2)]
    barrier = threading.Barrier(2)

    def fake_usage(jid):
        barrier.wait(timeout=5)
        return {"usage": [{"provider": "fake", "model": jid, "costUsd": 0.1}]}

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(module.call_with_usage, jid, "planning", fake_usage, jid) for jid in ids]
        for future in futures:
            future.result(timeout=10)
    for jid in ids:
        stored = records(module, jid)
        assert stored[(jid, "planning")][1][0]["model"] == jid
        called = []
        with pytest.raises(sqlite3.IntegrityError):
            module.call_with_usage(jid, "planning", lambda: called.append(True))
        assert not called and records(module, jid) == stored


def test_retry_gets_new_usage_without_overwriting_failed_attempt(metered):
    metered.fake.FAIL["make_audio"] = metered.fake.errors.PipelineError("TTS_FAILED", "fake", True)
    _, _, outline = finish(metered)
    old = outline["clips"][0]["jobId"]
    before = records(metered.app_module, old)
    assert before[(old, "audio")] == ("unavailable", None)
    metered.fake.FAIL.clear()
    retry = metered.post(f"/jobs/{old}/retry", json={}).json()
    assert retry["retryOf"] == old and retry["jobId"] != old
    assert wait_job(metered, retry["jobId"])["status"] == "completed"
    assert records(metered.app_module, old) == before
    assert set(records(metered.app_module, retry["jobId"])) == {
        (retry["jobId"], "blueprint"), (retry["jobId"], "audio")}


def test_usage_write_failure_stops_before_audio_and_is_not_zero(metered, monkeypatch):
    module = metered.app_module
    connect, blueprint = module.conn, metered.fake.make_blueprint
    pending_write = False

    def generated(*args):
        nonlocal pending_write
        result = blueprint(*args)
        pending_write = True
        return result

    @contextmanager
    def fail_usage_write():
        nonlocal pending_write
        if pending_write:
            pending_write = False
            raise sqlite3.OperationalError("fake usage write failure")
        with connect() as db:
            yield db

    monkeypatch.setattr(metered.fake, "make_blueprint", generated)
    monkeypatch.setattr(module, "conn", fail_usage_write)
    _, _, outline = finish(metered)
    assert all(c["status"] == "failed" for c in outline["clips"])
    assert not any(call[0] == "make_audio" for call in metered.fake.CALLS)
    for clip in outline["clips"]:
        jid = clip["jobId"]
        assert records(module, jid) == {(jid, "blueprint"): ("unavailable", None)}


def test_restart_keeps_known_usage_and_marks_interrupted_stage_unknown(metered):
    module = metered.app_module
    with module.conn() as db:
        jid = module.job_create(db, "clip", "fake")
        db.execute("UPDATE jobs SET status='running' WHERE id=?", (jid,))
    module.call_with_usage(jid, "blueprint", lambda: {"usage": [{"costUsd": 0.1}]})
    with module.conn() as db:
        db.execute("INSERT INTO job_usage(job_id,stage,status) VALUES(?,'audio','started')", (jid,))
    before = records(module, jid)[(jid, "blueprint")]
    module.setup()
    module.setup()  # Idempotent schema/recovery, no duplicate rows.
    assert records(module, jid) == {(jid, "blueprint"): before, (jid, "audio"): ("unavailable", None)}
    job = metered.get(f"/jobs/{jid}").json()
    assert job["status"] == "failed" and job["error"]["code"] == "SERVER_RESTARTED"


def test_legacy_schema_addition_preserves_existing_rows_results_and_assets(metered, monkeypatch):
    _, _, outline = finish(metered)
    module = metered.app_module
    clip_id = outline["clips"][0]["id"]
    result_before = metered.get(f"/clips/{clip_id}").json()
    audio_url = result_before["result"]["audioUrl"]
    audio_before = metered.get(audio_url).content
    legacy = metered.root / "legacy.sqlite3"  # Entire fixture is a fresh temporary folder.
    tables = ("lectures", "pages", "outlines", "clips", "jobs", "assets")
    snapshot = {}
    with module.conn() as source, sqlite3.connect(legacy) as destination:
        for table in tables:
            schema = source.execute("SELECT sql FROM sqlite_master WHERE name=?", (table,)).fetchone()[0]
            destination.execute(schema)
            rows = [tuple(r) for r in source.execute(f"SELECT * FROM {table} ORDER BY rowid")]
            snapshot[table] = rows
            if rows:
                destination.executemany(f"INSERT INTO {table} VALUES({','.join('?' for _ in rows[0])})", rows)
    monkeypatch.setattr(module, "DB", legacy)
    module.setup()
    assert records(module) == {}  # Historical costs are unknown; never backfilled as zero.
    with module.conn() as db:
        for table in tables:
            assert [tuple(r) for r in db.execute(f"SELECT * FROM {table} ORDER BY rowid")] == snapshot[table]
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    assert metered.get(f"/clips/{clip_id}").json() == result_before
    assert metered.get(audio_url).content == audio_before
