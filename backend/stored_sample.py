"""Read the AI-owned parts fixture without changing it or invoking AI APIs."""
from __future__ import annotations

import json
from pathlib import Path
import wave

from .pipeline import PipelineError, validate_result

SAMPLE_DIR = Path(__file__).resolve().parents[1] / "samples" / "parts-test"
CLIP_ID = "parts-test"
PLAN_ID = "plan_parts-test"
AUDIO_ID = "parts-test-audio"
# The sample references the 57-page divide-and-conquer lecture (D-34).
PAGE_COUNT = 57


def audio_path() -> Path | None:
    # Only this fixed file is public. Never use a request ID as a filesystem path.
    path = (SAMPLE_DIR / "audio.wav").resolve()
    if not path.is_relative_to(SAMPLE_DIR.resolve()) or not path.is_file():
        return None
    return path


def load_clip() -> dict:
    try:
        result = json.loads((SAMPLE_DIR / "result.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise PipelineError("SAMPLE_UNAVAILABLE", "저장된 샘플 결과를 읽을 수 없습니다.") from exc
    if (not isinstance(result, dict) or not isinstance(result.get("resultId"), str)
            or not result["resultId"] or result.get("audioUrl") != "audio.wav"):
        raise PipelineError("SAMPLE_INVALID", "저장된 샘플 결과 형식이 올바르지 않습니다.")
    validate_result(result.get("blueprint"), result, PAGE_COUNT)
    path = audio_path()
    if path is None:
        raise PipelineError("SAMPLE_UNAVAILABLE", "샘플 음성 파일을 찾을 수 없습니다.")
    try:
        with wave.open(str(path), "rb") as audio:
            duration = audio.getnframes() / audio.getframerate()
    except (OSError, EOFError, wave.Error) as exc:
        raise PipelineError("SAMPLE_INVALID", "샘플 음성 파일을 읽을 수 없습니다.") from exc
    if abs(duration - result["durationSec"]) > 0.05:
        raise PipelineError("SAMPLE_INVALID", "샘플 음성과 결과의 길이가 다릅니다.")
    result["audioUrl"] = f"/assets/{AUDIO_ID}"
    return {"id": CLIP_ID, "planId": PLAN_ID, "status": "completed",
            "error": None, "result": result}
