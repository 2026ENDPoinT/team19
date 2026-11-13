"""Q-FE-14 / P-FE-14: BE keeps unknown per-line fields (lineSourcePages) untouched. Fake AI only, no paid calls."""
import json

from test_api import client, wait_job  # noqa: F401
from test_ai_module_compat import forbid_real_ai, live, prepared, wait_clips  # noqa: F401


def with_line_pages(live, monkeypatch):
    original = live.fake.make_blueprint

    def annotated(*args):
        result = original(*args)
        blueprint = result.get("blueprint", result)
        expected = []
        for scene in blueprint["scenes"]:
            pages = scene["sourcePages"] or [None]
            # same length/order as lines; None = "no direct evidence"
            scene["lineSourcePages"] = [None if i == 0 else pages[0] for i, _ in enumerate(scene["lines"])]
            expected.append(scene["lineSourcePages"])
        result["_expected"] = expected
        return result

    monkeypatch.setattr(live.fake, "make_blueprint", annotated)


def test_line_source_pages_survive_validators_storage_and_clip_api(live, monkeypatch):
    with_line_pages(live, monkeypatch)
    lid = prepared(live)
    live.post(f"/lectures/{lid}/outlines", json={"mode": "intro"})
    outline = wait_clips(live, lid)
    done = [c for c in outline["clips"] if c["status"] == "completed"]
    assert done, outline
    for clip in done:
        body = live.get(f"/clips/{clip['id']}").json()
        scenes = body["result"]["blueprint"]["scenes"]
        assert all(len(s["lineSourcePages"]) == len(s["lines"]) for s in scenes)
        assert any(None in s["lineSourcePages"] for s in scenes)  # null is kept, not coerced
        # captions still expose sceneId + lineIndex, the key FE joins on
        by_scene = {s["id"]: s for s in scenes}
        for cap in body["result"]["captions"]:
            assert cap["lineIndex"] < len(by_scene[cap["sceneId"]]["lineSourcePages"])
        with live.app_module.conn() as db:
            stored = json.loads(db.execute("SELECT result_json FROM clips WHERE id=?", (clip["id"],)).fetchone()[0])
        assert stored["blueprint"]["scenes"] == scenes  # API returns exactly what SQLite holds


def test_ai_validator_accepts_well_formed_line_source_pages(live):
    """A well-formed field (same length as lines, in-range page or null) must not break validation.

    Deliberately silent about malformed values: whether the AI validator rejects them is the AI role's
    decision, so this test neither requires nor forbids it.
    """
    from pipeline.validate import validate_blueprint
    blueprint = live.fake.make_blueprint({"id": "c1", "title": "t", "sourcePages": [1], "prerequisites": [], "brief": "b"}, [{"number": 1, "text": "x"}], 2)
    blueprint = blueprint.get("blueprint", blueprint)
    assert validate_blueprint(blueprint, 2) == []
    for scene in blueprint["scenes"]:
        scene["lineSourcePages"] = [None] + [1] * (len(scene["lines"]) - 1)
    assert validate_blueprint(blueprint, 2) == []
