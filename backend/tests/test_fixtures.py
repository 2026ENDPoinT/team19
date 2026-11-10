"""BE/Codex: fixture corruption checks without server calls or sandbox access."""
from copy import deepcopy
import os
import subprocess
import sys
import textwrap

import pytest

from backend.fixtures.validate import ROOT, FixtureError, read_json, validate


def fixture_data():
    return read_json(ROOT / "cases.json"), read_json(ROOT / "manifest.json")


def case(data, name):
    return next(c for c in data["cases"] if c["name"] == name)


def test_official_fixtures_are_consistent():
    summary = validate(*fixture_data())
    assert summary == {"cases": 66, "shapeCompatible": 59, "historical": 7,
                       "flows": 9, "unavailableAssets": 5}


@pytest.mark.parametrize("text", ['{"id":1,"id":2}', '{"n":NaN}', '{"n":Infinity}', '{broken'])
def test_invalid_json_is_rejected(tmp_path, text):
    path = tmp_path / "invalid.json"
    path.write_text(text, encoding="utf-8")
    with pytest.raises(ValueError):
        read_json(path)


@pytest.mark.parametrize("corruption,expected", [
    ("duplicate-case", "duplicate/invalid case"),
    ("wrong-job-id", "missing job reference"),
    ("invalid-state", "job status/progress"),
    ("wrong-http-code", "HTTP/error code mismatch"),
    ("get-body", "GET body"),
    ("wrong-method", "method/endpoint"),
    ("nonempty-pending-result", "unfinished clip result"),
    ("unknown-flow", "unknown flow case"),
    ("invalid-transition", "job transition"),
    ("retry-same-job", "retry lineage"),
    ("wrong-clip-job", "clip/job reference or state"),
    ("missing-page-mapping", "page asset reference"),
    ("caption-reference", "caption reference"),
    ("caption-overlap", "caption times"),
    ("invalid-blueprint", "official blueprint validator"),
    ("unlabelled-history", "unlabelled historical contract difference"),
    ("missing-file", "missing reference file"),
    ("sandbox-reference", "disallowed file location"),
    ("unavailable-media-hidden", "explicitly unavailable"),
    ("wrong-result-audio", "reference result/audio pairing"),
    ("changed-migration", "migrated case payload changed"),
])
def test_fixture_corruption_is_rejected(corruption, expected):
    data, manifest = fixture_data()
    body = lambda name: case(data, name)["response"]["body"]
    if corruption == "duplicate-case":
        data["cases"][1]["name"] = data["cases"][0]["name"]
    elif corruption == "wrong-job-id":
        body("upload.accepted")["jobId"] = "missing"
    elif corruption == "invalid-state":
        body("prepare.pending")["status"] = "waiting"
    elif corruption == "wrong-http-code":
        case(data, "upload.too-large")["response"]["status"] = 415
    elif corruption == "get-body":
        case(data, "prepare.pending")["request"]["body"] = {}
    elif corruption == "wrong-method":
        case(data, "upload.accepted")["request"]["method"] = "GET"
    elif corruption == "nonempty-pending-result":
        body("clip.pending")["result"] = {}
    elif corruption == "unknown-flow":
        manifest["flows"]["preparation"].append("missing")
    elif corruption == "invalid-transition":
        manifest["flows"]["preparation"].append("prepare.pending")
    elif corruption == "retry-same-job":
        body("retry.accepted")["jobId"] = body("retry.accepted")["retryOf"]
    elif corruption == "wrong-clip-job":
        body("outline.review.A.registered")["clips"][0]["jobId"] = "job_01"
    elif corruption == "missing-page-mapping":
        manifest["assets"] = [a for a in manifest["assets"] if a["url"] != "/assets/img_52"]
    elif corruption == "caption-reference":
        body("clip.completed")["result"]["captions"][0]["sceneId"] = "missing"
    elif corruption == "caption-overlap":
        body("clip.completed")["result"]["captions"][1]["startSec"] = 0
    elif corruption == "invalid-blueprint":
        body("clip.completed")["result"]["blueprint"]["theme"] = "light"
    elif corruption == "unlabelled-history":
        issue = manifest["contractReview"]["historical"][0]
        name = issue["cases"].pop()
        manifest["contractReview"]["shapeCompatible"].append(name)
    elif corruption == "missing-file":
        manifest["referenceMedia"][0]["file"] = "../../samples/parts-test/pages/missing.png"
    elif corruption == "sandbox-reference":
        manifest["referenceMedia"][0]["file"] = "../../sandbox/be/fe-fixtures/media/page-31.png"
    elif corruption == "unavailable-media-hidden":
        manifest["assets"][0]["availability"] = "available"
    elif corruption == "wrong-result-audio":
        manifest["playbackReferences"][0]["audioFile"] = "../../samples/parts-test/audio.wav"
    elif corruption == "changed-migration":
        body("lecture.ready")["title"] += " modified"
    with pytest.raises(FixtureError, match=expected):
        validate(data, manifest)


def test_request_response_payloads_are_not_modified_by_validation():
    data, manifest = fixture_data()
    original = deepcopy((data, manifest))
    validate(data, manifest)
    assert (data, manifest) == original


def test_fixture_import_and_sample_api_do_not_load_pdf_extractor(tmp_path):
    # A fresh interpreter measures imports caused by these operations, independent
    # of pytest collecting AI's extraction tests in the parent interpreter.
    script = textwrap.dedent('''
        import sys
        from pathlib import Path
        from unittest.mock import patch

        original_path = list(sys.path)
        import backend.fixtures.validate as fixtures
        import pipeline.validate as blueprint
        import backend.pipeline as adapter

        repo = Path.cwd()
        assert Path(fixtures.__file__).resolve() == repo / 'backend/fixtures/validate.py'
        assert Path(blueprint.__file__).resolve() == repo / 'pipeline/validate.py'
        assert Path(adapter.__file__).resolve() == repo / 'backend/pipeline.py'
        assert fixtures is not blueprint and adapter is not sys.modules['pipeline']
        assert fixtures.validate_blueprint is blueprint.validate_blueprint
        assert 'validate' not in sys.modules
        assert sys.path == original_path
        fixtures.validate(fixtures.read_json(fixtures.ROOT / 'cases.json'),
                          fixtures.read_json(fixtures.ROOT / 'manifest.json'))
        forbidden = {'pipeline.extract', 'pymupdf', 'fitz'}
        assert forbidden.isdisjoint(sys.modules), sorted(forbidden.intersection(sys.modules))

        from fastapi.testclient import TestClient
        from backend.app import app, _executor

        try:
            with patch.object(adapter.Pipeline, '__init__',
                              side_effect=AssertionError('Generation is forbidden')):
                with TestClient(app) as client:
                    for clip_id in ('parts-test', 'clip-01', 'clip-01-b'):
                        response = client.get('/clips/' + clip_id)
                        assert response.status_code == 200, response.text
                        assert response.json()['status'] == 'completed'
        finally:
            _executor.shutdown(wait=True)
        assert forbidden.isdisjoint(sys.modules), sorted(forbidden.intersection(sys.modules))
        assert sys.path == original_path
        print('Fresh-process fixture imports and 3 sample API queries passed')
    ''')
    environment = os.environ.copy()
    environment.update(AI_MODE="sample", SAMPLE_MP4="0", TEAM19_DATA_DIR=str(tmp_path / "server"))
    result = subprocess.run([sys.executable, "-c", script], cwd=ROOT.parents[1],
                            env=environment, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "3 sample API queries passed" in result.stdout
