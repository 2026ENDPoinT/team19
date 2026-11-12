"""Q-AI-28 BE compatibility: AI module path, AI error class, call convention, plan ids.

No paid call and no real AI function is ever executed:
- every real `pipeline.*` AI function is replaced by one that fails the test if called (autouse),
- the non-sample runs use a FAKE AI package written to a temp dir and an isolated temp data dir
  (so no stored pending job can start), and never read the repository `.env`.
"""
import importlib
import json
import sqlite3
import sys
import textwrap
import time

import pytest
from fastapi.testclient import TestClient

from test_api import pdf_bytes, wait_job  # noqa: F401  (shared helpers)

from backend.pipeline import (AI_FUNCTIONS, DEFAULT_AI_MODULE, Pipeline, PipelineError as BEError,
                              convert_ai_error)

FAKE_NAME = "fakeai_q28"

FAKE_AI_SOURCE = '''
"""Fake AI package following contracts/pipeline.md. Strict about the call convention."""
from pathlib import Path
import wave

from .errors import PipelineError

CALLS = []
FAIL = {}          # function name -> exception instance to raise
MISSING_EMPTY = True


def _maybe_fail(name):
    if name in FAIL:
        raise FAIL[name]


def extract_pdf(pdf_path, out_dir):
    assert isinstance(pdf_path, str) and isinstance(out_dir, str), "paths must be str"
    CALLS.append(("extract_pdf", pdf_path, out_dir))
    _maybe_fail("extract_pdf")
    from pypdf import PdfReader
    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    pages = []
    for i, page in enumerate(PdfReader(pdf_path).pages, start=1):
        png = out / f"page-{i}.png"
        png.write_bytes(b"\\x89PNG\\r\\n\\x1a\\nfake")
        text = (page.extract_text() or "").strip()
        pages.append({"number": i, "text": text, "imagePath": str(png), "empty": not text})
    return {"pageCount": len(pages), "pages": pages}


def describe_pages(pages):
    assert isinstance(pages, list) and all({"number", "text", "imagePath"} <= set(p) for p in pages)
    CALLS.append(("describe_pages", [sorted(p) for p in pages]))
    _maybe_fail("describe_pages")
    return {"pages": [{"number": p["number"], "description": f"해설 {p['number']}", "kind": "content", "textBroken": False} for p in pages], "usage": []}


def plan_outline(mode, pages, descriptions=None):
    assert isinstance(mode, str) and isinstance(pages, list) and isinstance(descriptions, list)
    assert all({"number", "text"} <= set(p) for p in pages)
    assert all(set(d) == {"number", "description"} for d in descriptions)
    CALLS.append(("plan_outline", mode, [sorted(p) for p in pages], descriptions))
    _maybe_fail("plan_outline")
    return {"sections": [{"title": "구역", "planIds": ["c1", "c2"]}],
            "clipPlans": [
                {"id": "c1", "order": 0, "title": "첫 개념", "kind": "concept", "sourcePages": [1], "prerequisites": [], "brief": "첫 번째 설명입니다."},
                {"id": "c2", "order": 1, "title": "둘째 개념", "kind": "process", "sourcePages": [2], "prerequisites": ["c1"], "brief": "두 번째 설명입니다."}],
            "usage": []}


def make_blueprint(clip_plan, pages, page_count):
    assert isinstance(clip_plan, dict) and isinstance(pages, list) and isinstance(page_count, int)
    assert {"id", "title", "sourcePages", "prerequisites", "brief"} <= set(clip_plan)
    assert all({"number", "text"} <= set(p) for p in pages)
    CALLS.append(("make_blueprint", clip_plan["id"], [p["number"] for p in pages], page_count))
    _maybe_fail("make_blueprint")
    title, line = clip_plan["title"], clip_plan["brief"]
    return {"blueprint": {"version": 0, "title": title, "theme": "dark", "scenes": [
        {"id": "s1", "clear": True, "lines": [line], "texts": [
            {"id": "t1", "slot": "top", "style": "title", "content": title, "hidden": False},
            {"id": "t2", "slot": "middle", "style": "body", "content": line, "hidden": False}],
         "slides": [], "diagrams": [], "grids": [], "codes": [],
         "actions": [{"line": 0, "do": "setText", "target": "t2", "args": [line]}],
         "sourcePages": clip_plan["sourcePages"]}]}, "usage": []}


def make_audio(blueprint, out_dir):
    assert isinstance(blueprint, dict) and isinstance(out_dir, str), "out_dir must be str"
    CALLS.append(("make_audio", out_dir))
    _maybe_fail("make_audio")
    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    lines = [l for s in blueprint["scenes"] for l in s["lines"]]
    caps, t = [], 0.0
    for i, text in enumerate(lines):
        caps.append({"sceneId": "s1", "lineIndex": i, "text": text, "startSec": t, "endSec": t + 2.0}); t += 2.3
    dur = max(t - 0.3, 2.0)
    path = out / "audio.wav"
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000); w.writeframes(b"\\x00\\x00" * int(dur * 8000))
    return {"audioPath": str(path), "durationSec": dur, "captions": caps, "usage": []}
'''

FAKE_ERRORS_SOURCE = '''
class PipelineError(Exception):
    def __init__(self, code, message, retryable):
        super().__init__(f"{code}: {message}")
        self.code, self.message, self.retryable = code, message, retryable
'''


@pytest.fixture(autouse=True)
def forbid_real_ai(monkeypatch):
    """Safety net: a real AI function call fails the test (it would read .env and could be paid)."""
    import pipeline

    def boom(*a, **k):
        raise AssertionError("real AI function must not run in tests")

    for name in AI_FUNCTIONS:
        monkeypatch.setattr(pipeline, name, boom)


def write_fake(tmp_path, monkeypatch, name=FAKE_NAME, omit=None):
    pkg = tmp_path / "fake_modules" / name
    pkg.mkdir(parents=True)
    source = FAKE_AI_SOURCE
    if omit:  # drop one required function to test the missing-function check
        source = source.replace(f"def {omit}(", f"def _not_{omit}(")
    (pkg / "__init__.py").write_text(source, encoding="utf-8")
    (pkg / "errors.py").write_text(FAKE_ERRORS_SOURCE, encoding="utf-8")
    monkeypatch.syspath_prepend(str(tmp_path / "fake_modules"))
    for key in [k for k in sys.modules if k == name or k.startswith(name + ".")]:
        monkeypatch.delitem(sys.modules, key)
    return name


# ---------------------------------------------------------------- Q-AI-28-1: module path

def test_default_module_is_the_real_pipeline_package(monkeypatch):
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.delenv("AI_PIPELINE_MODULE", raising=False)
    pipe = Pipeline()
    assert DEFAULT_AI_MODULE == "pipeline"
    assert pipe.module.__name__ == "pipeline"
    # only checks the five functions exist; they are never called (see forbid_real_ai)
    assert all(callable(getattr(pipe.module, n)) for n in AI_FUNCTIONS)
    assert pipe.sample is False


def test_empty_env_value_uses_default(monkeypatch):
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("AI_PIPELINE_MODULE", "")
    assert Pipeline().module.__name__ == "pipeline"


def test_explicit_env_module_wins_over_default(tmp_path, monkeypatch):
    name = write_fake(tmp_path, monkeypatch)
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("AI_PIPELINE_MODULE", name)
    assert Pipeline().module.__name__ == name


def test_missing_module_is_a_clear_error(monkeypatch):
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("AI_PIPELINE_MODULE", "no_such_ai_module_q28")
    with pytest.raises(RuntimeError, match="AI 모듈을 불러오지 못했습니다: no_such_ai_module_q28"):
        Pipeline()


@pytest.mark.parametrize("missing", AI_FUNCTIONS)
def test_each_missing_function_is_reported(tmp_path, monkeypatch, missing):
    name = write_fake(tmp_path, monkeypatch, omit=missing)
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("AI_PIPELINE_MODULE", name)
    with pytest.raises(RuntimeError, match=f"AI 함수 누락: {name}.{missing}"):
        Pipeline()


def test_sample_mode_is_unchanged_and_does_not_load_any_module(monkeypatch):
    monkeypatch.setenv("AI_MODE", "sample")
    monkeypatch.setenv("AI_PIPELINE_MODULE", "no_such_ai_module_q28")  # ignored in sample mode
    pipe = Pipeline()
    assert pipe.sample is True and not hasattr(pipe, "module")
    plan = pipe.plan_outline("intro", [{"number": 1, "text": "Quick sort pivot."}], [])
    assert plan["clipPlans"][0]["title"] == "Quick sort pivot."


# ---------------------------------------------------------------- Q-AI-28-2: error class (unit)

def test_real_ai_error_class_is_recognized(tmp_path, monkeypatch):
    from pipeline.errors import PipelineError as AIError
    name = write_fake(tmp_path, monkeypatch)
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("AI_PIPELINE_MODULE", name)
    pipe = Pipeline()
    sys.modules[name].FAIL["plan_outline"] = AIError("OUTLINE_INVALID", "클립 목록을 만들지 못했습니다.", True)
    with pytest.raises(BEError) as info:
        pipe.plan_outline("intro", [], [])
    assert (info.value.code, info.value.message, info.value.retryable) == ("OUTLINE_INVALID", "클립 목록을 만들지 못했습니다.", True)


def test_convert_ai_error_rejects_malformed_fields():
    class Bad(Exception):
        def __init__(self, code, message, retryable):
            self.code, self.message, self.retryable = code, message, retryable

    generic = ("INTERNAL_ERROR", "처리 중 오류가 발생했습니다. 서버 로그를 확인해 주세요.", True)
    for bad in (Bad("lower_case", "m", True), Bad("PROVIDER_ERROR", "", True), Bad("PROVIDER_ERROR", None, True),
                Bad("PROVIDER_ERROR", "m", "yes"), Bad(None, "m", True), Bad("X" * 80, "m", True)):
        c = convert_ai_error(bad)
        assert (c.code, c.message, c.retryable) == generic
    long = convert_ai_error(Bad("PROVIDER_ERROR", "가" * 500, True))
    assert len(long.message) == 300


# ---------------------------------------------------------------- API-level fixture (fake AI, isolated data)

@pytest.fixture()
def live(tmp_path, monkeypatch):
    """Real-mode (non-sample) server wired to the FAKE AI package and an empty temp data dir."""
    name = write_fake(tmp_path, monkeypatch)
    monkeypatch.setenv("TEAM19_DATA_DIR", str(tmp_path / "server"))
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("AI_PIPELINE_MODULE", name)
    monkeypatch.setenv("BE_WORKERS", "1")
    fake = importlib.import_module(name)
    if "backend.app" in sys.modules:
        sys.modules["backend.app"]._executor.shutdown(wait=True)
        module = importlib.reload(sys.modules["backend.app"])
    else:
        module = importlib.import_module("backend.app")
    assert module.ROOT == (tmp_path / "server").resolve()
    try:
        with TestClient(module.app) as c:
            c.fake, c.root, c.app_module = fake, tmp_path / "server", module
            yield c
    finally:
        module._executor.shutdown(wait=True)


def upload(client):
    r = client.post("/lectures", files={"file": ("lecture.pdf", pdf_bytes(), "application/pdf")})
    assert r.status_code == 202, r.text
    return r.json()["lectureId"], r.json()["jobId"]


def prepared(client):
    lid, jid = upload(client)
    assert wait_job(client, jid)["status"] == "completed"
    return lid


def wait_clips(client, lid, mode="intro", timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        r = client.get(f"/lectures/{lid}/outlines/{mode}")
        if r.status_code == 200:
            o = r.json()
            if o["status"] == "failed" or (o["clips"] and all(c["status"] in ("completed", "failed") for c in o["clips"])):
                return o
        time.sleep(0.04)
    raise AssertionError("outline did not finish")


# ---------------------------------------------------------------- Q-AI-28 contract call convention + full flow

def test_full_flow_with_fake_ai_follows_the_contract(live):
    lid = prepared(live)
    lecture = live.get(f"/lectures/{lid}").json()
    assert lecture["status"] == "ready" and lecture["pageCount"] == 2
    assert [p["number"] for p in lecture["pages"]] == [1, 2]
    live.fake.FAIL.clear()
    r = live.post(f"/lectures/{lid}/outlines", json={"mode": "review"})
    assert r.status_code == 202
    outline = wait_clips(live, lid, "review")
    assert outline["status"] == "ready" and [c["status"] for c in outline["clips"]] == ["completed", "completed"]
    clip = live.get(f"/clips/{outline['clips'][0]['id']}").json()
    res = clip["result"]
    assert res["sample"] is False                          # real-mode flag, not the sample fixture
    assert res["blueprint"]["scenes"][0]["lines"] == ["첫 번째 설명입니다."]
    assert res["captions"][0]["text"] == "첫 번째 설명입니다."
    audio = live.get(res["audioUrl"])
    assert audio.status_code == 200 and audio.headers["content-type"] == "audio/wav"
    calls = {c[0]: c for c in live.fake.CALLS}
    # paths reach the AI as str inside the isolated data dir; the AI wrote only there
    assert calls["extract_pdf"][1].endswith("original.pdf") and str(live.root.resolve()) in calls["extract_pdf"][1]
    assert str(live.root.resolve()) in calls["make_audio"][1]
    # the AI sees page dicts with number/text/imagePath (BE stores description only, not `empty`)
    assert calls["describe_pages"][1][0] == ["empty", "imagePath", "number", "text"]
    assert calls["plan_outline"][1] == "review"
    assert calls["plan_outline"][2][0] == ["description", "imagePath", "number", "text"]
    assert [c for c in live.fake.CALLS if c[0] == "make_blueprint"][0][2:] == ([1], 2)  # only the clip's own pages, pageCount int


def test_ai_plan_ids_and_prerequisites_are_preserved(live):
    lid = prepared(live)
    live.post(f"/lectures/{lid}/outlines", json={"mode": "intro"})
    outline = wait_clips(live, lid)
    api_ids = [c["planId"] for c in outline["clips"]]
    assert len(set(api_ids)) == 2 and all(i.startswith("plan_") for i in api_ids)
    assert not {"c1", "c2"} & set(api_ids)                 # BE planId never collides with the AI's local ids

    def stored():
        db = sqlite3.connect(live.root / "team19.sqlite3")
        try:
            plans = [json.loads(r[0]) for r in db.execute("SELECT plan_json FROM clips ORDER BY position")]
            plan_ids = [r[0] for r in db.execute("SELECT plan_id FROM clips ORDER BY position")]
            sections = json.loads(db.execute("SELECT sections FROM outlines").fetchone()[0])
        finally:
            db.close()
        return plans, plan_ids, sections

    plans, plan_ids, sections = stored()
    assert [p["id"] for p in plans] == ["c1", "c2"]                       # AI original id
    assert [p["prerequisites"] for p in plans] == [[], ["c1"]]            # relation kept, still in AI ids
    assert sections == [{"title": "구역", "planIds": ["c1", "c2"]}]       # sections also use AI ids
    assert plan_ids == api_ids and not set(plan_ids) & {p["id"] for p in plans}
    # the generation received the AI's own plan (with id/prerequisites), not the BE planId
    assert [c[1] for c in live.fake.CALLS if c[0] == "make_blueprint"] == ["c1", "c2"]
    # re-reading and a server restart (same data dir) lose nothing
    again = live.get(f"/lectures/{lid}/outlines/intro").json()
    assert [c["planId"] for c in again["clips"]] == api_ids
    live.app_module._executor.shutdown(wait=True)
    importlib.reload(live.app_module)
    with TestClient(live.app_module.app) as c2:
        assert [c["planId"] for c in c2.get(f"/lectures/{lid}/outlines/intro").json()["clips"]] == api_ids
    assert stored() == (plans, plan_ids, sections)


# ---------------------------------------------------------------- Q-AI-28-2: errors through the real API

AI_CASES = [
    # stage failing, code, retryable
    ("plan_outline", "OUTLINE_INVALID", True, "클립 목록을 만들지 못했습니다. 다시 시도해 주세요."),
    ("plan_outline", "INVALID_MODE", False, "알 수 없는 모드입니다."),
    ("make_blueprint", "PROVIDER_RATE_LIMIT", True, "AI 서비스 요청이 많습니다. 잠시 후 다시 시도해 주세요."),
    ("make_blueprint", "BLUEPRINT_INVALID", True, "설계도를 만들지 못했습니다. 다시 시도해 주세요."),
    ("make_audio", "PROVIDER_TIMEOUT", True, "음성 서비스 응답이 늦습니다. 다시 시도해 주세요."),
]


@pytest.mark.parametrize("fn,code,retryable,message", AI_CASES)
@pytest.mark.parametrize("own_class", [True, False], ids=["fake-package-error-class", "real-pipeline.errors-class"])
def test_ai_error_is_preserved_in_job_status(live, fn, code, retryable, message, own_class):
    if own_class:
        from fakeai_q28.errors import PipelineError as Err   # the package's own class (found via <module>.errors)
    else:
        from pipeline.errors import PipelineError as Err      # the real AI package's class (fallback lookup)
    lid = prepared(live)
    live.fake.FAIL[fn] = Err(code, message, retryable)
    live.post(f"/lectures/{lid}/outlines", json={"mode": "intro"})
    outline = wait_clips(live, lid)
    expected = {"code": code, "message": message, "retryable": retryable}
    if fn == "plan_outline":
        assert outline["status"] == "failed"
        jid = outline["jobId"]
    else:
        assert outline["status"] == "ready"
        assert all(c["status"] == "failed" and c["error"] == expected for c in outline["clips"])
        jid = outline["clips"][0]["jobId"]
    job = live.get(f"/jobs/{jid}")
    assert job.status_code == 200
    body = job.json()
    assert body["status"] == "failed" and body["stage"] == "failed" and body["error"] == expected
    assert set(body["error"]) == {"code", "message", "retryable"}


def test_prepare_failure_from_ai_keeps_code_on_job_and_lecture(live):
    from fakeai_q28.errors import PipelineError as Err
    live.fake.FAIL["extract_pdf"] = Err("PDF_INVALID", "PDF 파일을 열 수 없습니다.", False)
    lid, jid = upload(live)
    expected = {"code": "PDF_INVALID", "message": "PDF 파일을 열 수 없습니다.", "retryable": False}
    job = wait_job(live, jid)
    assert job["status"] == "failed" and job["error"] == expected
    assert live.get(f"/lectures/{lid}").json()["status"] == "failed"


SECRET = "C:\\Users\\someone\\.env sk-live-secret-key"


class Impostor(Exception):
    """Has code/message/retryable like an AI error but is NOT the AI's PipelineError class."""
    code, message, retryable = "PROVIDER_ERROR", f"leak {SECRET}", False


@pytest.mark.parametrize("exc", [RuntimeError(f"boom {SECRET}"), KeyError(SECRET), Impostor(SECRET)],
                         ids=["RuntimeError", "KeyError", "impostor-with-code-attribute"])
def test_unexpected_exceptions_stay_internal_error_and_leak_nothing(live, exc):
    lid = prepared(live)
    live.fake.FAIL["make_blueprint"] = exc
    live.post(f"/lectures/{lid}/outlines", json={"mode": "intro"})
    outline = wait_clips(live, lid)
    jid = outline["clips"][0]["jobId"]
    r = live.get(f"/jobs/{jid}")
    assert r.json()["error"] == {"code": "INTERNAL_ERROR", "message": "처리 중 오류가 발생했습니다. 서버 로그를 확인해 주세요.", "retryable": True}
    assert "sk-live" not in r.text and ".env" not in r.text and "someone" not in r.text
    assert "sk-live" not in live.get(f"/lectures/{lid}/outlines/intro").text


def test_failed_ai_job_can_be_retried_after_the_cause_is_fixed(live):
    from fakeai_q28.errors import PipelineError as Err
    lid = prepared(live)
    live.fake.FAIL["plan_outline"] = Err("PROVIDER_TIMEOUT", "AI 서비스 응답이 늦습니다. 다시 시도해 주세요.", True)
    live.post(f"/lectures/{lid}/outlines", json={"mode": "intro"})
    failed = wait_clips(live, lid)
    assert failed["status"] == "failed"
    live.fake.FAIL.clear()
    r = live.post(f"/jobs/{failed['jobId']}/retry", json={})
    assert r.status_code == 202
    ok = wait_clips(live, lid)
    assert ok["status"] == "ready" and len(ok["clips"]) == 2
