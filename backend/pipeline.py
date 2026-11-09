"""AI 5-function adapter. Sample mode is an integration fixture, not an AI model."""
from __future__ import annotations

import importlib
import math
import os
from pathlib import Path
import wave

from .pdf_text_fallback import extract_pdf_text_only


class PipelineError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code, self.message, self.retryable = code, message, retryable


class Pipeline:
    """Bridge to AI-owned functions, configurable with AI_PIPELINE_MODULE."""
    def __init__(self):
        self.sample = os.getenv("AI_MODE", "sample").lower() == "sample"
        if not self.sample:
            module_name = os.getenv("AI_PIPELINE_MODULE", "ai.pipeline")
            try:
                self.module = importlib.import_module(module_name)
            except ImportError as exc:
                raise RuntimeError(f"AI 모듈을 불러오지 못했습니다: {module_name}") from exc
            for name in ("extract_pdf", "describe_pages", "plan_outline", "make_blueprint", "make_audio"):
                if not callable(getattr(self.module, name, None)):
                    raise RuntimeError(f"AI 함수 누락: {module_name}.{name}")

    def extract_pdf(self, pdf_path: Path, output_dir: Path) -> dict:
        if not self.sample:
            return self.module.extract_pdf(str(pdf_path), str(output_dir))
        output_dir.mkdir(parents=True, exist_ok=True)
        try:
            return extract_pdf_text_only(pdf_path, output_dir)
        except Exception as exc:
            raise PipelineError("INVALID_PDF", "PDF를 읽지 못했습니다.") from exc

    def describe_pages(self, pages: list[dict]) -> dict:
        if not self.sample:
            return self.module.describe_pages(pages)
        return {"pages": [{"number": p["number"], "description": "샘플 모드: 이미지 해설 미생성"} for p in pages], "usage": []}

    def plan_outline(self, mode: str, pages: list[dict], descriptions: list[dict]) -> dict:
        if not self.sample:
            return self.module.plan_outline(mode, pages, descriptions)
        # Keep demo bounded. Each clip genuinely derives its visible text from the uploaded PDF.
        candidates = []
        for page in pages:
            text = " ".join(page.get("text", "").split())
            if text:
                candidates.append({"order": len(candidates), "title": text[:35], "kind": "concept", "sourcePages": [page["number"]], "brief": text[:500], "prerequisites": []})
            if len(candidates) >= 3:
                break
        if not candidates:
            raise PipelineError("PDF_NO_TEXT", "텍스트 없는 PDF는 현재 샘플 모드에서 생성할 수 없습니다.")
        return {"sections": [], "clipPlans": candidates, "usage": []}

    def make_blueprint(self, clip_plan: dict, pages: list[dict], page_count: int) -> dict:
        if not self.sample:
            return self.module.make_blueprint(clip_plan, pages, page_count)
        title = str(clip_plan.get("title") or "학습 클립")[:20]
        brief = str(clip_plan.get("brief") or title)
        # Actual PDF excerpts, not AI summaries. Label clearly in the demo UI.
        chunks = [brief[i:i + 55] for i in range(0, min(len(brief), 165), 55)] or [title]
        return {"blueprint": {"version": 0, "title": title, "theme": "dark", "scenes": [
            {"id": "s1", "clear": True, "lines": chunks, "texts": [
                {"id": "t1", "slot": "top", "style": "title", "content": title, "hidden": False},
                {"id": "t2", "slot": "middle", "style": "body", "content": chunks[0], "hidden": False}
            ], "slides": [], "diagrams": [], "grids": [], "codes": [], "actions": [
                {"line": i, "do": "setText", "target": "t2", "args": [line]} for i, line in enumerate(chunks)
            ], "sourcePages": clip_plan.get("sourcePages", [1])}
        ]}, "usage": []}

    def make_audio(self, blueprint: dict, output_dir: Path) -> dict:
        if not self.sample:
            return self.module.make_audio(blueprint, str(output_dir))
        output_dir.mkdir(parents=True, exist_ok=True)
        captions, t = [], 0.0
        for scene in blueprint["scenes"]:
            for i, line in enumerate(scene["lines"]):
                duration = max(2.0, min(6.0, len(line) / 7))
                captions.append({"sceneId": scene["id"], "lineIndex": i, "text": line, "startSec": round(t, 2), "endSec": round(t + duration, 2)})
                t += duration + 0.3
        duration = max(1.0, t - 0.3)
        path = output_dir / "sample-silence.wav"
        rate = 8000
        with wave.open(str(path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            # Silence deliberately: never mistake this for generated narration.
            wav.writeframes(b"\x00\x00" * int(duration * rate))
        return {"audioPath": str(path), "durationSec": round(duration, 2), "captions": captions, "usage": []}


def check_blueprint(blueprint: dict, page_count: int) -> None:
    # Absolute import: AI's pipeline/ package, not this backend.pipeline adapter.
    # The validator has no PyMuPDF dependency; do not import pipeline.extract here.
    from pipeline.validate import validate_blueprint

    if validate_blueprint(blueprint, page_count):
        raise PipelineError("BLUEPRINT_INVALID", "설계도 형식 검사에 실패했습니다.", True)


def validate_result(blueprint: dict, audio: dict, page_count: int) -> None:
    """AI-owned blueprint validation plus BE checks for matching caption timing."""
    check_blueprint(blueprint, page_count)
    expected = {(scene["id"], i): line
                for scene in blueprint["scenes"]
                for i, line in enumerate(scene["lines"])}
    duration = audio.get("durationSec")
    if type(duration) not in (float, int) or not math.isfinite(duration) or duration <= 0:
        raise PipelineError("TTS_FAILED", "음성 길이가 올바르지 않습니다.", True)
    captions, previous = audio.get("captions"), -1.0
    if not isinstance(captions, list) or len(captions) != len(expected):
        raise PipelineError("TTS_FAILED", "자막 문장 수가 설계도와 다릅니다.", True)
    observed = set()
    ordered_keys = list(expected)
    for index, c in enumerate(captions):
        if not isinstance(c, dict):
            raise PipelineError("TTS_FAILED", "자막 형식이 올바르지 않습니다.", True)
        key = (c.get("sceneId"), c.get("lineIndex"))
        start, end = c.get("startSec"), c.get("endSec")
        if (key != ordered_keys[index] or type(c.get("lineIndex")) is not int or c.get("text") != expected[key] or
            not all(type(n) in (float, int) and math.isfinite(n) for n in (start, end)) or
            start < 0 or start < previous or end <= start or end > duration + 0.01):
            raise PipelineError("TTS_FAILED", "음성과 자막의 시간 정보가 일치하지 않습니다.", True)
        observed.add(key)
        previous = end
    if observed != set(expected):
        raise PipelineError("TTS_FAILED", "일부 자막이 누락되었습니다.", True)
