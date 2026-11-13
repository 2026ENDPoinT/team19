"""FE <-> BE integration checks for the upload -> prepare -> outline -> clip flow (P-FE-07/08).

AI_MODE=sample only: no paid API, no real AI. Results are PDF excerpts, placeholder page
images and silent WAV audio. Pipeline steps are paused with gates so every state the FE
polls (pending / running + stage / completed / failed) can be observed through the real API.
"""
import importlib
import io
import sys
import threading
import time

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

# Reuse the fixtures and helpers of the existing API tests.
from test_api import client, pdf_bytes, wait_job  # noqa: F401


class Gate:
    """Pause selected Pipeline methods until the test releases them."""

    def __init__(self, monkeypatch, names):
        from backend.pipeline import Pipeline
        self.count = {n: 0 for n in names}
        self.sem = {n: threading.Semaphore(0) for n in names}
        self.lock = threading.Lock()
        self.passthrough = False
        for name in names:
            original = getattr(Pipeline, name)

            def wrapper(inst, *args, _n=name, _o=original, **kw):
                with self.lock:
                    self.count[_n] += 1
                if not self.passthrough:
                    assert self.sem[_n].acquire(timeout=30), f"gate {_n} was never released"
                return _o(inst, *args, **kw)

            monkeypatch.setattr(Pipeline, name, wrapper)

    def wait(self, name, n=1, timeout=10):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.count[name] >= n:
                return
            time.sleep(0.02)
        raise AssertionError(f"{name} was not reached {n} time(s)")

    def release(self, name, n=1):
        for _ in range(n):
            self.sem[name].release()

    def open_all(self):
        self.passthrough = True
        for sem in self.sem.values():
            for _ in range(50):
                sem.release()


@pytest.fixture()
def make_gate(client, monkeypatch):  # depends on client so gates open before the executor stops
    gates = []

    def factory(*names):
        gate = Gate(monkeypatch, names)
        gates.append(gate)
        return gate

    yield factory
    for gate in gates:
        gate.open_all()


def upload(client, data=None, name="lecture.pdf"):
    r = client.post("/lectures", files={"file": (name, data if data is not None else pdf_bytes(), "application/pdf")})
    assert r.status_code == 202, r.text
    return r.json()


def prepared_lecture(client):
    ticket = upload(client)
    assert wait_job(client, ticket["jobId"])["status"] == "completed"
    return ticket["lectureId"]


def job(client, job_id):
    r = client.get(f"/jobs/{job_id}")
    assert r.status_code == 200
    return r.json()


def restart(client):
    """Simulate a server restart on the same data directory (setup() runs again on import)."""
    module = sys.modules["backend.app"]
    module._executor.shutdown(wait=True)
    module = importlib.reload(module)
    return module, TestClient(module.app)


# --- P-FE-07: upload and preparation -------------------------------------------------------

def test_prepare_states_stages_and_queueing(client, make_gate):
    gate = make_gate("__init__", "extract_pdf", "describe_pages")
    first = upload(client)
    assert set(first) == {"lectureId", "jobId", "status"} and first["status"] == "pending"
    gate.wait("__init__")
    assert job(client, first["jobId"]) == {"id": first["jobId"], "type": "prepare", "status": "running",
                                           "stage": "starting", "progress": None, "error": None}

    second = upload(client)  # single worker is busy: this one only waits in the queue
    assert job(client, second["jobId"])["status"] == "pending"
    assert job(client, second["jobId"])["stage"] == "queued"
    waiting = client.get(f"/lectures/{second['lectureId']}").json()
    assert (waiting["status"], waiting["pageCount"], waiting["pages"]) == ("pending", None, [])
    assert waiting["preparationJobId"] == second["jobId"]

    gate.release("__init__"); gate.wait("extract_pdf")
    assert job(client, first["jobId"])["stage"] == "extracting"
    running = client.get(f"/lectures/{first['lectureId']}").json()
    assert (running["status"], running["pageCount"], running["pages"]) == ("running", None, [])
    gate.release("extract_pdf"); gate.wait("describe_pages")
    assert job(client, first["jobId"])["stage"] == "describing"
    gate.release("describe_pages")
    done = wait_job(client, first["jobId"])
    assert (done["status"], done["stage"], done["error"]) == ("completed", "finished", None)

    ready = client.get(f"/lectures/{first['lectureId']}").json()
    assert ready["status"] == "ready" and ready["pageCount"] == 2 and ready["preparationJobId"] == first["jobId"]
    assert [p["number"] for p in ready["pages"]] == [1, 2]
    for page in ready["pages"]:
        image = client.get(page["imageUrl"])
        assert image.status_code == 200 and image.content.startswith(b"\x89PNG")
    gate.open_all()
    assert wait_job(client, second["jobId"])["status"] == "completed"


def test_invalid_upload_and_unknown_ids(client):
    def code(r, status):
        assert r.status_code == status, r.text
        err = r.json()["error"]
        assert set(err) == {"code", "message", "retryable"}
        return err["code"]

    assert code(client.post("/lectures", files={"file": ("a.txt", b"x", "text/plain")}), 415) == "UNSUPPORTED_FILE_TYPE"
    assert code(client.post("/lectures", files={"file": ("a.pdf", b"not a pdf", "application/pdf")}), 422) == "INVALID_PDF"
    assert code(client.get("/jobs/job_nope"), 404) == "JOB_NOT_FOUND"
    assert code(client.get("/lectures/lec_nope"), 404) == "LECTURE_NOT_FOUND"
    assert code(client.get("/lectures/lec_nope/outlines/intro"), 404) == "LECTURE_NOT_FOUND"
    assert code(client.post("/lectures/lec_nope/outlines", json={"mode": "intro"}), 404) == "LECTURE_NOT_FOUND"
    assert code(client.get("/clips/clip_nope"), 404) == "CLIP_NOT_FOUND"
    assert code(client.post("/jobs/job_nope/retry"), 404) == "JOB_NOT_FOUND"
    assert code(client.get("/assets/asset_nope"), 404) == "ASSET_NOT_FOUND"


def test_malformed_requests_use_the_contract_error_shape(client):
    lecture_id = prepared_lecture(client)
    for response in (client.post("/lectures"), client.post(f"/lectures/{lecture_id}/outlines", json={})):
        assert response.status_code == 422, response.text
        err = response.json().get("error")
        assert err and set(err) == {"code", "message", "retryable"}, response.text  # contracts/api.md "오류 모양"


def test_rejected_upload_is_not_listed(client):
    client.post("/lectures", files={"file": ("a.pdf", b"not a pdf", "application/pdf")})
    assert client.get("/lectures").json() == []


def test_header_only_pdf_fails_as_job_error(client):
    ticket = upload(client, b"%PDF-1.4\ngarbage that pypdf cannot read\n", "broken.pdf")
    failed = wait_job(client, ticket["jobId"])
    assert (failed["status"], failed["stage"]) == ("failed", "failed")
    assert failed["error"]["code"] == "INVALID_PDF" and failed["error"]["retryable"] is False
    lecture = client.get(f"/lectures/{ticket['lectureId']}").json()
    assert (lecture["status"], lecture["pageCount"], lecture["pages"]) == ("failed", None, [])
    blocked = client.post(f"/lectures/{ticket['lectureId']}/outlines", json={"mode": "intro"})
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "LECTURE_NOT_READY"
    assert "Traceback" not in blocked.text and "local-data" not in failed["error"]["message"]


def test_outline_requires_ready_lecture_and_valid_mode(client, make_gate):
    gate = make_gate("__init__")
    ticket = upload(client)
    gate.wait("__init__")
    early = client.post(f"/lectures/{ticket['lectureId']}/outlines", json={"mode": "intro"})
    assert early.status_code == 409 and early.json()["error"] == {
        "code": "LECTURE_NOT_READY", "message": "PDF 분석이 아직 완료되지 않았습니다.", "retryable": True}
    bad = client.post(f"/lectures/{ticket['lectureId']}/outlines", json={"mode": "expert"})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "INVALID_MODE"
    gate.open_all()


def test_get_outline_invalid_mode_follows_contract(client):
    lecture_id = prepared_lecture(client)
    missing = client.get(f"/lectures/{lecture_id}/outlines/intro")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "OUTLINE_NOT_FOUND"
    bad = client.get(f"/lectures/{lecture_id}/outlines/expert")
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "INVALID_MODE"  # contracts/api.md


# --- P-FE-08: outline, clips, playback payload -----------------------------------------------

def test_outline_clip_states_partial_completion_and_playable_result(client, make_gate):
    lecture_id = prepared_lecture(client)
    gate = make_gate("plan_outline", "make_blueprint", "make_audio")

    started = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "review"})
    assert started.status_code == 202
    body = started.json()
    assert set(body) == {"outlineId", "jobId", "status", "reused"} and body["reused"] is False
    gate.wait("plan_outline")
    assert job(client, body["jobId"])["type"] == "outline" and job(client, body["jobId"])["stage"] == "planning"
    planning = client.get(f"/lectures/{lecture_id}/outlines/review").json()
    assert (planning["status"], planning["clips"], planning["jobId"]) == ("planning", [], body["jobId"])

    again = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "review"})  # duplicate while running
    assert again.status_code == 202
    assert again.json() == {"outlineId": body["outlineId"], "jobId": body["jobId"], "status": "running", "reused": True}

    gate.release("plan_outline"); gate.wait("make_blueprint")
    outline = client.get(f"/lectures/{lecture_id}/outlines/review").json()
    assert outline["status"] == "ready" and job(client, body["jobId"])["status"] == "completed"
    first, second = outline["clips"]
    assert [first["order"], second["order"]] == [0, 1]
    assert {"id", "planId", "order", "title", "kind", "sourcePages", "status", "jobId", "error"} == set(first)
    assert (first["status"], second["status"]) == ("running", "pending")
    assert job(client, first["jobId"])["stage"] == "blueprint"
    assert (job(client, second["jobId"])["status"], job(client, second["jobId"])["stage"]) == ("pending", "queued")
    for clip in (first, second):  # not finished: result is null, still HTTP 200
        r = client.get(f"/clips/{clip['id']}")
        assert r.status_code == 200 and r.json()["result"] is None and r.json()["status"] in ("running", "pending")

    gate.release("make_blueprint"); gate.wait("make_audio")
    assert job(client, first["jobId"])["stage"] == "audio"
    gate.release("make_audio")
    assert wait_job(client, first["jobId"])["status"] == "completed"
    gate.wait("make_blueprint", 2)  # second clip started; first is already playable
    partial = client.get(f"/lectures/{lecture_id}/outlines/review").json()["clips"]
    assert [c["status"] for c in partial] == ["completed", "running"]
    assert client.get(f"/clips/{second['id']}").json()["result"] is None
    gate.open_all()
    assert wait_job(client, second["jobId"], timeout=35)["status"] == "completed"
    other = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "intro"})  # other mode is independent
    assert other.status_code == 202 and other.json()["outlineId"] != body["outlineId"] and other.json()["reused"] is False

    # Everything the existing FE player needs from a completed clip.
    done = client.get(f"/clips/{first['id']}").json()
    assert done["status"] == "completed" and done["error"] is None and done["planId"] == first["planId"]
    result = done["result"]
    assert result["sample"] is True and result["blueprint"]["version"] == 0 and result["blueprint"]["theme"] == "dark"
    pages = client.get(f"/lectures/{lecture_id}").json()["pages"]
    assert all(set(s["sourcePages"]) <= {p["number"] for p in pages} for s in result["blueprint"]["scenes"])
    previous = 0.0
    for cap in result["captions"]:
        assert cap["startSec"] >= previous and cap["endSec"] > cap["startSec"] and cap["endSec"] <= result["durationSec"] + 0.1
        previous = cap["endSec"]
    assert result["audioUrl"].startswith("/assets/")
    audio = client.get(result["audioUrl"])
    assert audio.status_code == 200 and audio.headers["content-type"] == "audio/wav" and audio.content[:4] == b"RIFF"
    assert client.head(result["audioUrl"]).status_code == 200
    ranged = client.get(result["audioUrl"], headers={"Range": "bytes=0-99"})
    assert ranged.status_code == 206 and len(ranged.content) == 100
    assert client.get(result["previewVideoUrl"]).content[4:8] == b"ftyp"

    reused = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "review"})
    assert reused.status_code == 200  # completed outline is reused (contract table says 202; known difference)
    assert reused.json() == {"outlineId": body["outlineId"], "jobId": body["jobId"], "status": "completed", "reused": True}


def test_clip_failure_is_isolated_and_retryable(client, monkeypatch):
    from backend.pipeline import Pipeline, PipelineError
    lecture_id = prepared_lecture(client)
    original, calls = Pipeline.make_blueprint, []

    def flaky(self, plan, pages, page_count):
        calls.append(1)
        if len(calls) == 1:
            raise PipelineError("BLUEPRINT_INVALID", "설계도 형식 검사에 실패했습니다.", True)
        return original(self, plan, pages, page_count)

    monkeypatch.setattr(Pipeline, "make_blueprint", flaky)
    started = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "exam"}).json()
    wait_job(client, started["jobId"])
    clips = client.get(f"/lectures/{lecture_id}/outlines/exam").json()["clips"]
    bad = wait_job(client, clips[0]["jobId"])
    assert wait_job(client, clips[1]["jobId"], timeout=35)["status"] == "completed"
    assert (bad["status"], bad["stage"], bad["error"]["code"], bad["error"]["retryable"]) == ("failed", "failed", "BLUEPRINT_INVALID", True)
    listed = client.get(f"/lectures/{lecture_id}/outlines/exam").json()
    assert listed["status"] == "ready" and [c["status"] for c in listed["clips"]] == ["failed", "completed"]
    assert listed["clips"][0]["error"]["code"] == "BLUEPRINT_INVALID"
    failed_clip = client.get(f"/clips/{clips[0]['id']}").json()
    assert failed_clip["status"] == "failed" and failed_clip["result"] is None and failed_clip["error"]["code"] == "BLUEPRINT_INVALID"

    retried = client.post(f"/jobs/{clips[0]['jobId']}/retry")
    assert retried.status_code == 202 and retried.json()["retryOf"] == clips[0]["jobId"]
    assert wait_job(client, retried.json()["jobId"], timeout=35)["status"] == "completed"
    after = client.get(f"/lectures/{lecture_id}/outlines/exam").json()["clips"]
    assert [c["status"] for c in after] == ["completed", "completed"] and after[0]["jobId"] == retried.json()["jobId"]
    assert client.post(f"/jobs/{retried.json()['jobId']}/retry").status_code == 409  # completed jobs cannot be retried


def test_unexpected_error_hides_internal_details(client, monkeypatch):
    from backend.pipeline import Pipeline
    lecture_id = prepared_lecture(client)

    def boom(self, *args):
        raise RuntimeError(r"C:\secret\path sk-should-not-leak")

    monkeypatch.setattr(Pipeline, "plan_outline", boom)
    started = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "intro"}).json()
    failed = wait_job(client, started["jobId"])
    assert failed["status"] == "failed" and failed["error"]["code"] == "INTERNAL_ERROR"
    assert "secret" not in str(failed) and "sk-" not in str(failed)
    assert client.get(f"/lectures/{lecture_id}/outlines/intro").json()["status"] == "failed"
    # Asking again does not start a new run: it reports the failed outline (re-run is POST /jobs/{id}/retry).
    again = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "intro"})
    assert again.status_code == 202
    assert again.json() == {"outlineId": started["outlineId"], "jobId": started["jobId"], "status": "failed", "reused": True}


def test_navigating_away_does_not_cancel_server_jobs(client):
    # The FE only stops polling. The server job keeps running and the result can be read later.
    ticket = upload(client)
    lecture_id = ticket["lectureId"]
    outline = None
    assert wait_job(client, ticket["jobId"])["status"] == "completed"
    client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "intro"})  # never polled by this "user"
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        r = client.get(f"/lectures/{lecture_id}/outlines/intro")
        if r.status_code == 200 and r.json()["clips"] and all(c["status"] == "completed" for c in r.json()["clips"]):
            outline = r.json()
            break
        time.sleep(0.1)
    assert outline is not None


# --- restart / recovery ------------------------------------------------------------------------

def test_pending_jobs_resume_after_restart(client, monkeypatch):
    """Jobs persisted as 'pending' but never started (server stopped while queued) must still run."""
    module = sys.modules["backend.app"]
    monkeypatch.setattr(module, "dispatch", lambda jid: None)  # the process "dies" before the executor runs anything
    ticket = upload(client)
    assert job(client, ticket["jobId"])["status"] == "pending"
    _, fresh = restart(client)
    assert wait_job(fresh, ticket["jobId"])["status"] == "completed"
    assert fresh.get(f"/lectures/{ticket['lectureId']}").json()["status"] == "ready"


def test_pending_clip_jobs_resume_after_restart(client, monkeypatch):
    lecture_id = prepared_lecture(client)
    module = sys.modules["backend.app"]
    monkeypatch.setattr(module, "dispatch", lambda jid: None)
    outline_id = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "review"}).json()
    module.execute(outline_id["jobId"])  # plan synchronously; clip jobs stay queued in the DB
    clips = client.get(f"/lectures/{lecture_id}/outlines/review").json()["clips"]
    assert [c["status"] for c in clips] == ["pending", "pending"]
    _, fresh = restart(client)
    for clip in clips:
        assert wait_job(fresh, clip["jobId"], timeout=35)["status"] == "completed"
    assert all(fresh.get(f"/clips/{c['id']}").json()["result"] is not None for c in clips)


def _crash_state(module, sql, args=()):
    with module.conn() as db:
        db.execute(sql, args)


def test_restart_interrupts_running_prepare_and_retry_uses_new_job(client):
    module = sys.modules["backend.app"]
    lecture_id = prepared_lecture(client)
    old_job = client.get(f"/lectures/{lecture_id}").json()["preparationJobId"]
    # State a crash would leave: job and lecture still marked running.
    _crash_state(module, "UPDATE jobs SET status='running',stage='describing' WHERE id=?", (old_job,))
    _crash_state(module, "UPDATE lectures SET status='running' WHERE id=?", (lecture_id,))
    _, fresh = restart(client)
    interrupted = job(fresh, old_job)
    assert (interrupted["status"], interrupted["stage"]) == ("failed", "interrupted")
    assert interrupted["error"]["code"] == "SERVER_RESTARTED" and interrupted["error"]["retryable"] is True
    assert fresh.get(f"/lectures/{lecture_id}").json()["status"] == "failed"  # never rerun automatically
    retried = fresh.post(f"/jobs/{old_job}/retry").json()
    assert wait_job(fresh, retried["jobId"])["status"] == "completed"
    lecture = fresh.get(f"/lectures/{lecture_id}").json()
    assert lecture["status"] == "ready" and lecture["pageCount"] == 2
    assert lecture["preparationJobId"] == retried["jobId"]  # FE compares this with the job it is polling


def test_restart_interrupts_outline_planning_consistently(client, monkeypatch):
    module = sys.modules["backend.app"]
    lecture_id = prepared_lecture(client)
    # Leave the outline at the pre-call boundary instead of generating and deleting jobs.
    monkeypatch.setattr(module, "dispatch", lambda jid: None)
    jid = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "review"}).json()["jobId"]
    outline_id = client.get(f"/lectures/{lecture_id}/outlines/review").json()["id"]
    _crash_state(module, "UPDATE jobs SET status='running',stage='planning' WHERE id=?", (jid,))
    _crash_state(module, "UPDATE outlines SET status='planning' WHERE id=?", (outline_id,))
    _crash_state(module, "INSERT INTO job_usage(job_id,stage,status) VALUES(?,'planning','started')", (jid,))
    _, fresh = restart(client)
    assert job(fresh, jid)["status"] == "failed"
    assert fresh.get(f"/lectures/{lecture_id}/outlines/review").json()["status"] == "failed"
    retried = fresh.post(f"/jobs/{jid}/retry")
    assert retried.status_code == 202
    assert wait_job(fresh, retried.json()["jobId"])["status"] == "completed"


def test_restart_interrupts_running_clip_with_visible_error(client):
    module = sys.modules["backend.app"]
    lecture_id = prepared_lecture(client)
    jid = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "review"}).json()["jobId"]
    wait_job(client, jid)
    clips = client.get(f"/lectures/{lecture_id}/outlines/review").json()["clips"]
    for c in clips:
        wait_job(client, c["jobId"], timeout=35)
    target = clips[0]
    _crash_state(module, "UPDATE jobs SET status='running',stage='audio' WHERE id=?", (target["jobId"],))
    _crash_state(module, "UPDATE clips SET status='running',result_json=NULL,error=NULL WHERE id=?", (target["id"],))
    _, fresh = restart(client)
    listed = fresh.get(f"/lectures/{lecture_id}/outlines/review").json()["clips"][0]
    assert listed["status"] == "failed"
    assert listed["error"] and listed["error"]["code"] == "SERVER_RESTARTED"  # FE shows clip.error text
    single = fresh.get(f"/clips/{target['id']}").json()
    assert single["status"] == "failed" and single["result"] is None and single["error"]["code"] == "SERVER_RESTARTED"
    assert wait_job(fresh, fresh.post(f"/jobs/{target['jobId']}/retry").json()["jobId"], timeout=35)["status"] == "completed"


def test_completed_work_survives_restart(client):
    lecture_id = prepared_lecture(client)
    jid = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "review"}).json()["jobId"]
    wait_job(client, jid)
    clips = client.get(f"/lectures/{lecture_id}/outlines/review").json()["clips"]
    for c in clips:
        wait_job(client, c["jobId"], timeout=35)
    before = client.get(f"/clips/{clips[0]['id']}").json()
    _, fresh = restart(client)
    assert fresh.get(f"/clips/{clips[0]['id']}").json() == before
    assert fresh.post(f"/lectures/{lecture_id}/outlines", json={"mode": "review"}).status_code == 200


# --- concurrency -------------------------------------------------------------------------------

def test_simultaneous_duplicate_outline_requests_reuse_one_outline(client):
    from concurrent.futures import ThreadPoolExecutor
    module = sys.modules["backend.app"]
    module.dispatch = lambda jid: None  # only the request race is under test; reload restores dispatch
    with module.conn() as db:  # 12 ready lectures without running any pipeline
        for n in range(12):
            db.execute("INSERT INTO lectures(id,title,pdf_path,status,page_count) VALUES(?,?,?,'ready',2)", (f"lec_race{n}", "race", "x", ))

    def burst(lecture_id):
        barrier = threading.Barrier(6)

        def post(_):
            barrier.wait()
            return client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "review"})

        with ThreadPoolExecutor(6) as pool:
            return list(pool.map(post, range(6)))

    for n in range(12):
        responses = burst(f"lec_race{n}")
        assert all(r.status_code in (200, 202) for r in responses), [r.text for r in responses]
        assert len({r.json()["outlineId"] for r in responses}) == 1
        assert sum(1 for r in responses if r.json()["reused"] is False) == 1


def test_retry_cannot_start_a_second_run_for_the_same_target(client, monkeypatch):
    from backend.pipeline import Pipeline, PipelineError
    lecture_id = prepared_lecture(client)
    original, calls = Pipeline.make_blueprint, []

    def fail_once(self, plan, pages, page_count):
        calls.append(1)
        if len(calls) == 1:
            raise PipelineError("BLUEPRINT_INVALID", "설계도 형식 검사에 실패했습니다.", True)
        return original(self, plan, pages, page_count)

    monkeypatch.setattr(Pipeline, "make_blueprint", fail_once)
    jid = client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "intro"}).json()["jobId"]
    wait_job(client, jid)
    clips = client.get(f"/lectures/{lecture_id}/outlines/intro").json()["clips"]
    failed_job = next(c["jobId"] for c in clips if wait_job(client, c["jobId"], timeout=35)["status"] == "failed")
    first = client.post(f"/jobs/{failed_job}/retry")
    assert first.status_code == 202
    second = client.post(f"/jobs/{failed_job}/retry")  # double click on the same failed job
    assert second.status_code == 409 and second.json()["error"]["code"] == "RETRY_NOT_ALLOWED"
    assert wait_job(client, first.json()["jobId"], timeout=35)["status"] == "completed"


def test_blank_pdf_reports_no_text_failure(client):
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    out = io.BytesIO()
    writer.write(out)
    lecture_id = prepared_lecture_from(client, out.getvalue())
    failed = wait_job(client, client.post(f"/lectures/{lecture_id}/outlines", json={"mode": "intro"}).json()["jobId"])
    assert failed["status"] == "failed" and failed["error"]["code"] == "PDF_NO_TEXT"


def prepared_lecture_from(client, data):
    ticket = upload(client, data)
    assert wait_job(client, ticket["jobId"])["status"] == "completed"
    return ticket["lectureId"]
