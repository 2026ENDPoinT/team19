"""AI 파이프라인 (담당: AI). 호출 방법은 contracts/pipeline.md.

BE는 `AI_PIPELINE_MODULE=pipeline`으로 이 패키지의 함수 5개를 부른다.
무거운 라이브러리(PyMuPDF, SDK)는 함수를 부를 때 불러온다. `pipeline.validate`만 쓰는 곳은 영향이 없다.
API 키는 환경변수에서 읽는다. 저장소 맨 위 `.env`가 있으면 이미 있는 값은 덮어쓰지 않고 읽는다.
"""

from __future__ import annotations

from pathlib import Path

_env_loaded = False


def _load_env() -> None:
    global _env_loaded
    if _env_loaded:
        return
    _env_loaded = True
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


def extract_pdf(pdf_path, out_dir) -> dict:
    from pipeline.extract import extract_pdf as f
    return f(pdf_path, out_dir)


def describe_pages(pages: list[dict]) -> dict:
    _load_env()
    from pipeline.describe import describe_pages as f
    return f(pages)


def plan_outline(mode: str, pages: list[dict], descriptions: list[dict] | None = None) -> dict:
    _load_env()
    from pipeline.outline import plan_outline as f
    return f(mode, pages, descriptions)


def make_blueprint(clip_plan: dict, pages: list[dict], page_count: int) -> dict:
    _load_env()
    from pipeline.blueprint import make_blueprint as f
    return f(clip_plan, pages, page_count)


def make_audio(blueprint: dict, out_dir) -> dict:
    _load_env()
    from pipeline.audio import make_audio as f
    return f(blueprint, out_dir)
