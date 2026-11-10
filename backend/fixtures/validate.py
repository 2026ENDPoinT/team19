"""Offline fixture integrity checks. BE/Codex, 2026-11-10.

Run from the repository root: python -m backend.fixtures.validate
This checks the documented fixture subset, not the complete API specification.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import re
import struct

from pipeline.validate import validate_blueprint

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
STATES = {"pending", "running", "completed", "failed"}
MODES = {"intro", "review", "exam"}


class FixtureError(ValueError):
    pass


def check(condition, message):
    if not condition:
        raise FixtureError(message)


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        check(key not in result, f"duplicate JSON key: {key}")
        result[key] = value
    return result


def read_json(path):
    def bad_constant(value):
        raise FixtureError(f"non-finite JSON number: {value}")
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_pairs,
                      parse_constant=bad_constant)


def digest(value):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True,
                     separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def error(value):
    check(isinstance(value, dict) and set(value) == {"code", "message", "retryable"}, "error fields")
    check(all(isinstance(value[k], str) and value[k] for k in ("code", "message")), "error text")
    check(type(value["retryable"]) is bool, "error retryability")


def identifier(value):
    check(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]+", value), f"invalid ID: {value}")


def fields(value, expected):
    check(isinstance(value, dict) and set(value) == set(expected.split()), f"fields: {expected}")


def local_file(relative, root=ROOT):
    check(isinstance(relative, str) and relative and ":" not in relative
          and "\\" not in relative and not relative.startswith("/"), "relative file path")
    path = (root / relative).resolve()
    # Repository-owned files only. In particular no sandbox/runtime source dependency.
    check(path.is_relative_to(root.resolve()) or path.is_relative_to(REPO / "samples"),
          f"disallowed file location: {relative}")
    check(path.is_file(), f"missing reference file: {relative}")
    return path


def validate(data, manifest, root=ROOT):
    check(data.get("notice") and manifest.get("notice"), "missing notice")
    check(manifest["owner"] == "BE" and manifest["version"] == 1, "owner/version")
    cases = data["cases"]
    check(len(cases) == manifest["caseCount"] == 66, "case count")
    by_name, jobs, lectures, outlines, plans, clips = {}, {}, set(), set(), {}, {}
    job_states, clip_states, results = set(), set(), set()
    assets = {}
    for asset in manifest["assets"]:
        check(asset["url"].startswith("/assets/") and asset["url"] not in assets, "duplicate/invalid asset URL")
        check(asset["availability"] == "unavailable" and asset["file"] is None
              and asset["reason"], "historical media must be explicitly unavailable")
        check(asset["contentType"] in {"image/png", "audio/wav"}, "asset MIME")
        assets[asset["url"]] = asset

    def pages(numbers):
        check(isinstance(numbers, list) and len(numbers) == len(set(numbers)), "page list")
        for number in numbers:
            check(type(number) is int and 1 <= number <= manifest["pageCount"], "page number")
            check(f"/assets/img_{number}" in assets, "page asset reference")

    for case in cases:
        fields(case, "name request response")
        name, request, response = case["name"], case["request"], case["response"]
        check(isinstance(name, str) and name and name not in by_name, "duplicate/invalid case ID")
        by_name[name] = case
        fields(response, "status body")
        check(set(request) in ({"method", "path"}, {"method", "path", "body"}), "request fields")
        method, path, body, http = request["method"], request["path"], response["body"], response["status"]
        check(method in {"GET", "POST"} and isinstance(path, str), "request method/path")
        route = re.fullmatch(r"/(lectures(?:/[^/]+(?:/outlines(?:/[^/]+)?)?)?|jobs/[^/]+(?:/retry)?|clips/[^/]+|assets/[^/]+)", path)
        check(route is not None and ".." not in path, "API path")
        is_post = path == "/lectures" or path.endswith("/outlines") or path.endswith("/retry")
        check((method == "POST") == is_post, "method/endpoint mismatch")
        check(method != "GET" or "body" not in request, "GET body")
        check(type(http) is int and http in {200, 202, 404, 409, 413, 415, 422, 503}, "HTTP status")
        if http >= 400:
            fields(body, "error")
            error(body["error"])
            codes = {
                404: {"LECTURE_NOT_FOUND", "OUTLINE_NOT_FOUND", "CLIP_NOT_FOUND", "JOB_NOT_FOUND", "ASSET_NOT_FOUND"},
                409: {"LECTURE_NOT_READY", "RETRY_NOT_ALLOWED"}, 413: {"FILE_TOO_LARGE"},
                415: {"UNSUPPORTED_FILE_TYPE"}, 422: {"INVALID_PDF", "INVALID_MODE"},
                503: {"STORAGE_UNAVAILABLE"},
            }
            check(body["error"]["code"] in codes[http], "HTTP/error code mismatch")
            continue
        if method == "POST":
            check(body["status"] in {"pending", "running", "completed"}, "POST state")
            check(http != 202 or body["status"] in {"pending", "running"}, "202 state")
            if path == "/lectures":
                fields(body, "lectureId jobId status")
                lectures.add(body["lectureId"])
            elif path.endswith("/outlines"):
                fields(body, "outlineId jobId status reused")
                check(request.get("body", {}).get("mode") in MODES, "mode")
                check(type(body["reused"]) is bool, "reused flag")
                check(http != 200 or body["reused"] and body["status"] == "completed", "reuse HTTP 200")
            else:
                fields(body, "jobId retryOf status")
                check(request.get("body") == {} and body["retryOf"] == path.split("/")[2]
                      and body["jobId"] != body["retryOf"], "retry lineage")
            continue
        check(http == 200, "GET status")
        if "/outlines/" not in path:
            check(body["id"] == path.split("/")[-1], "GET ID")
        identifier(body["id"])
        if path.startswith("/jobs/"):
            fields(body, "id type status stage progress error")
            check(body["status"] in STATES and body["progress"] is None, "job status/progress")
            check(isinstance(body["stage"], str) and body["stage"], "job stage")
            if body["id"] in jobs:
                check(jobs[body["id"]]["type"] == body["type"], "job type changed")
            jobs.setdefault(body["id"], {"type": body["type"], "states": set()})["states"].add(body["status"])
            job_states.add(body["status"])
        elif path.startswith("/clips/"):
            fields(body, "id planId status error result")
            check(body["status"] in STATES, "clip status")
            clip_states.add(body["status"])
            check(body["id"] not in clips or clips[body["id"]] == body["planId"], "clip plan changed")
            clips[body["id"]] = body["planId"]
            if body["status"] != "completed":
                check(body["result"] is None, "unfinished clip result")
            else:
                result = body["result"]
                fields(result, "resultId durationSec audioUrl blueprint captions")
                identifier(result["resultId"])
                check(result["resultId"] not in results, "duplicate result ID")
                results.add(result["resultId"])
                check(result["audioUrl"] in assets and assets[result["audioUrl"]]["contentType"] == "audio/wav", "audio asset reference")
                blueprint_errors = validate_blueprint(result["blueprint"], manifest["pageCount"])
                check(not blueprint_errors, f"official blueprint validator: {blueprint_errors}")
                check(digest(result["blueprint"]) == manifest["blueprint"]["sha256"], "blueprint fingerprint")
                expected = [(s["id"], i, text) for s in result["blueprint"]["scenes"] for i, text in enumerate(s["lines"])]
                check(len(expected) == len(result["captions"]), "caption count")
                duration = result["durationSec"]
                check(type(duration) in {int, float} and math.isfinite(duration) and duration > 0, "duration")
                end = 0
                for caption, line in zip(result["captions"], expected):
                    fields(caption, "sceneId lineIndex text startSec endSec")
                    check(type(caption["lineIndex"]) is int and (caption["sceneId"], caption["lineIndex"], caption["text"]) == line, "caption reference")
                    start, finish = caption["startSec"], caption["endSec"]
                    check(all(type(n) in {int, float} and math.isfinite(n) for n in (start, finish))
                          and end <= start < finish <= duration, "caption times")
                    end = finish
                for scene in result["blueprint"]["scenes"]:
                    pages(scene["sourcePages"])
        elif "/outlines/" in path:
            fields(body, "id mode status jobId clips")
            # Unlike other GET endpoints, the path ends in mode, not resource ID.
            outlines.add(body["id"])
            check(body["mode"] in MODES and body["mode"] == path.split("/")[-1], "outline mode")
            check(body["status"] in {"planning", "ready"}, "outline state")
            check(body["status"] != "planning" or not body["clips"], "planning clips")
            seen, seen_plans = set(), set()
            for index, clip in enumerate(body["clips"]):
                fields(clip, "id planId order title sourcePages status jobId error")
                check(type(clip["order"]) is int and clip["order"] == index, "clip order")
                check(clip["id"] not in seen and clip["planId"] not in seen_plans, "duplicate outline clip/plan")
                seen.add(clip["id"]); seen_plans.add(clip["planId"])
                check(clip["id"] not in plans or plans[clip["id"]] == clip["planId"], "plan reference changed")
                plans[clip["id"]] = clip["planId"]
                check(clip["status"] in STATES, "outline clip status")
                check(clip["jobId"] is not None or clip["status"] == "pending", "unregistered clip state")
                pages(clip["sourcePages"])
                error(clip["error"]) if clip["status"] == "failed" else check(clip["error"] is None, "outline clip error")
        else:
            fields(body, "id title status pageCount preparationJobId pages")
            lectures.add(body["id"])
            check(body["status"] in {"processing", "ready"}, "lecture state")
            if body["status"] == "processing":
                check(body["pageCount"] is None and body["pages"] == [], "processing lecture")
            else:
                check(body["pageCount"] == manifest["pageCount"], "page count")
                pages([p["number"] for p in body["pages"]])
                for page in body["pages"]:
                    fields(page, "number imageUrl")
                    check(page["imageUrl"] == f"/assets/img_{page['number']}", "page URL")
        if "error" in body:
            error(body["error"]) if body["status"] == "failed" else check(body["error"] is None, "unexpected error")

    for case in cases:
        if case["response"]["status"] >= 400:
            continue
        body = case["response"]["body"]
        for key in ("jobId", "preparationJobId", "retryOf"):
            if body.get(key) is not None:
                identifier(body[key]); check(body[key] in jobs, f"missing job reference: {body[key]}")
        if "outlineId" in body:
            check(body["outlineId"] in outlines, "outline reference")
        path = case["request"]["path"]
        if path.startswith("/lectures/"):
            check(path.split("/")[2] in lectures, "lecture reference")
        for clip in body.get("clips", []):
            if clip["jobId"] is not None:
                job = jobs.get(clip["jobId"])
                check(job is not None and job["type"] == "generate_clip" and clip["status"] in job["states"], "clip/job reference or state")
    check(all(plans.get(cid) == pid for cid, pid in clips.items()), "clip/outline plan reference")
    check(job_states == clip_states == STATES, "state coverage")
    for flow in manifest["flows"].values():
        prior = {}
        for name in flow:
            check(name in by_name, f"unknown flow case: {name}")
            case = by_name[name]
            if case["request"]["method"] == "GET" and case["request"]["path"].startswith("/jobs/") and case["response"]["status"] == 200:
                job = case["response"]["body"]
                allowed = {"pending": {"pending", "running"}, "running": {"running", "completed", "failed"}, "completed": {"completed"}, "failed": {"failed"}}
                check(job["id"] not in prior or job["status"] in allowed[prior[job["id"]]], "job transition")
                prior[job["id"]] = job["status"]

    review = manifest["contractReview"]
    groups = [review["shapeCompatible"]] + [issue["cases"] for issue in review["historical"]]
    reviewed = [name for group in groups for name in group]
    check(len(reviewed) == len(set(reviewed)) and set(reviewed) == set(by_name), "contract review coverage")
    historical = {name for issue in review["historical"] for name in issue["cases"]}
    for case in cases:
        body = case["response"]["body"]
        partial = body.get("status") == "ready" and any(c["jobId"] is None for c in body.get("clips", []))
        if partial or case["name"] == "clip.unregistered" or case["response"]["status"] == 200 and case["request"]["method"] == "POST":
            check(case["name"] in historical, "unlabelled historical contract difference")

    for media in manifest["referenceMedia"]:
        path = local_file(media["file"], root)
        check(path.is_relative_to(REPO / "samples") and media["kind"] == "image/png", "reference media location/type")
        raw = path.read_bytes()
        check(raw[:8] == b"\x89PNG\r\n\x1a\n" and raw[12:16] == b"IHDR", "PNG header")
        check(all(struct.unpack(">II", raw[16:24])), "PNG dimensions")
    for playback in manifest["playbackReferences"]:
        result = read_json(local_file(playback["resultFile"], root))
        audio = local_file(playback["audioFile"], root)
        check(result["audioUrl"] == audio.name, "reference result/audio pairing")
        check(audio.is_relative_to(REPO / "samples") and playback["apiPath"] == f"/clips/{playback['clipId']}"
              and playback["audioUrl"] == f"/assets/{playback['clipId']}-audio", "reference API mapping")
    # Run last so structural failures are reported before the immutable migration fingerprint.
    check(digest(cases) == manifest["provenance"]["casePayloadSha256"], "migrated case payload changed; review provenance")
    return {"cases": len(cases), "shapeCompatible": len(review["shapeCompatible"]),
            "historical": len(historical), "flows": len(manifest["flows"]), "unavailableAssets": len(assets)}


def main():
    try:
        summary = validate(read_json(ROOT / "cases.json"), read_json(ROOT / "manifest.json"))
    except (ValueError, OSError, KeyError, TypeError, IndexError) as exc:
        print(f"FAIL: {exc}")
        return 1
    print("PASS:", json.dumps(summary), "(offline integrity only; not live HTTP/playback)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
