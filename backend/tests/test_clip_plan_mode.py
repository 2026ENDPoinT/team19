"""D-57: AI clip plans carry `mode`; BE must keep it in plan_json and hand it to make_blueprint unchanged.

API mode ids stay intro/review/exam. Fake AI only, temp DB, no paid calls.
"""
import json

import pytest

from test_api import client, wait_job  # noqa: F401
from test_ai_module_compat import forbid_real_ai, live, prepared, wait_clips  # noqa: F401


@pytest.mark.parametrize("mode", ["intro", "review", "exam"])
def test_plan_mode_reaches_make_blueprint_through_plan_json_and_retry(live, monkeypatch, mode):
    plan_outline, make_blueprint = live.fake.plan_outline, live.fake.make_blueprint
    received = []

    def planned(m, *args):
        result = plan_outline(m, *args)
        for plan in result["clipPlans"]:
            plan["mode"] = m  # what pipeline.outline.normalize now does
        return result

    def blueprint(plan, *args):
        received.append((plan["id"], plan.get("mode")))
        return make_blueprint(plan, *args)

    monkeypatch.setattr(live.fake, "plan_outline", planned)
    monkeypatch.setattr(live.fake, "make_blueprint", blueprint)
    lid = prepared(live)
    assert live.post(f"/lectures/{lid}/outlines", json={"mode": mode}).status_code == 202
    outline = wait_clips(live, lid, mode)
    assert [c["status"] for c in outline["clips"]] == ["completed"] * len(outline["clips"])
    assert sorted(received) == [("c1", mode), ("c2", mode)]
    with live.app_module.conn() as db:
        stored = [json.loads(r["plan_json"]) for r in db.execute("SELECT plan_json FROM clips")]
    assert stored and all(p["mode"] == mode for p in stored)
    assert "mode" not in outline["clips"][0]  # outline response shape is unchanged


def test_failed_clip_retry_keeps_plan_mode(live, monkeypatch):
    plan_outline, make_blueprint = live.fake.plan_outline, live.fake.make_blueprint
    received = []

    def planned(m, *args):
        result = plan_outline(m, *args)
        for plan in result["clipPlans"]:
            plan["mode"] = m
        return result

    def blueprint(plan, *args):
        received.append(plan.get("mode"))
        return make_blueprint(plan, *args)

    monkeypatch.setattr(live.fake, "plan_outline", planned)
    monkeypatch.setattr(live.fake, "make_blueprint", blueprint)
    live.fake.FAIL["make_blueprint"] = live.fake.errors.PipelineError("PROVIDER_TIMEOUT", "fake", True)
    lid = prepared(live)
    live.post(f"/lectures/{lid}/outlines", json={"mode": "exam"})
    failed = wait_clips(live, lid, "exam")["clips"]
    assert all(c["status"] == "failed" for c in failed)
    live.fake.FAIL.clear()
    received.clear()
    retry = live.post(f"/jobs/{failed[0]['jobId']}/retry", json={}).json()
    assert wait_job(live, retry["jobId"])["status"] == "completed"
    assert received == ["exam"]


def test_old_plans_without_mode_still_work(live):
    lid = prepared(live)
    live.post(f"/lectures/{lid}/outlines", json={"mode": "intro"})
    outline = wait_clips(live, lid)
    assert all(c["status"] == "completed" for c in outline["clips"])
