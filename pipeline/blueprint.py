"""설계도 생성 (make_blueprint). 형식은 docs/04, 호출 방법은 contracts/pipeline.md.

사용법:
    from pipeline.blueprint import make_blueprint
    r = make_blueprint(clip_plan, pages, page_count=57, model="claude-sonnet-5-5")
    r["blueprint"], r["usage"]

명령줄 (유료 호출 1~2번):
    .venv/Scripts/python -m pipeline.blueprint --pages-json out/pages.json --plan plan.json --model claude-sonnet-5-5 --out out/bp.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from pipeline.errors import PipelineError
from pipeline.validate import LIMITS, SUPPORTED_LAYOUTS, SUPPORTED_SLOTS, validate_blueprint

ROOT = Path(__file__).resolve().parents[1]
PROMPT_FILE = Path(__file__).with_name("prompts") / "blueprint_system.md"
EXAMPLE_FILE = ROOT / "samples" / "parts-test" / "blueprint.json"

# 100만 토큰당 달러 (입력, 출력). docs/06 기준. 캐시 읽기는 Claude만 따로 계산한다.
PRICES = {
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
    "gpt-6.1-terra": (1.00, 5.00),
    "gpt-6-luna": (0.10, 0.50),
}
CLAUDE_CACHE_READ = {"claude-sonnet-5-5": 0.20, "claude-haiku-5-5": 0.01}
MAX_TOKENS = 32000


def make_blueprint(clip_plan: dict, pages: list[dict], page_count: int, model: str = "claude-sonnet-5-5") -> dict:
    """클립 계획 하나로 설계도를 만든다. 검사에 실패하면 오류를 붙여 한 번 다시 만든다.

    pages: [{"number", "text", "description"(있으면)}] 이 클립에 필요한 페이지만.
    돌려주는 값: {"blueprint": dict, "usage": [호출별 사용량], "attempts": 시도 수}
    """
    if model not in PRICES:
        raise ValueError(f"모르는 모델: {model}")
    system = build_system_prompt()
    user = build_user_prompt(clip_plan, pages, page_count)
    usage: list[dict] = []
    last_errors: list[str] = []
    for attempt in (1, 2):
        prompt = user if attempt == 1 else user + _retry_note(raw, last_errors)
        raw, u = _call(model, system, prompt)
        usage.append(u)
        try:
            bp = _parse_json(raw)
            last_errors = validate_blueprint(bp, page_count)
        except ValueError as e:
            bp, last_errors = None, [f"JSON을 읽을 수 없음: {e}"]
        if not last_errors:
            return {"blueprint": bp, "usage": usage, "attempts": attempt}
    raise PipelineError("BLUEPRINT_INVALID", "설계도를 만들지 못했습니다. 다시 시도해 주세요.", retryable=True)


# ---------- 프롬프트 ----------

def build_system_prompt() -> str:
    limits = "\n".join([
        f"- texts: title {LIMITS['text']['title']}자, body {LIMITS['text']['body']}자, keyword {LIMITS['text']['keyword']}자, formula 한 줄",
        f"- diagrams: 노드 {LIMITS['diagram_nodes']}개(tree는 {LIMITS['tree_nodes']}개, 깊이 {LIMITS['tree_levels']}단), 선 {LIMITS['diagram_edges']}개, 노드 라벨 {LIMITS['node_label']}자",
        f"- grids: 한 줄 배열 {LIMITS['grid_row_cells']}칸, 여러 줄이면 {LIMITS['grid_2d'][0]}줄 × {LIMITS['grid_2d'][1]}칸, "
        f"{LIMITS['table_cell_trigger']}자를 넘는 칸이 있으면 표로 보고 {LIMITS['table'][0]}줄 × {LIMITS['table'][1]}칸, 칸 내용 {LIMITS['cell_chars']}자",
        f"- codes: {LIMITS['code_lines']}줄, 한 줄 {LIMITS['code_line_chars']}자",
        f"- slides: mark 라벨 {LIMITS['mark_label']}자, 동시에 보이는 mark {LIMITS['marks_visible']}개",
        f"- 장면: 문장 {LIMITS['scene_lines']}개, 문장 하나에 동작 {LIMITS['actions_per_line']}개",
    ])
    example = json.dumps(json.loads(EXAMPLE_FILE.read_text(encoding="utf-8")), ensure_ascii=False, separators=(",", ":"))
    return (PROMPT_FILE.read_text(encoding="utf-8")
            .replace("<<LAYOUTS>>", ", ".join(SUPPORTED_LAYOUTS))
            .replace("<<SLOTS>>", ", ".join(SUPPORTED_SLOTS))
            .replace("<<LIMITS>>", limits)
            .replace("<<EXAMPLE>>", example))


def build_user_prompt(clip_plan: dict, pages: list[dict], page_count: int) -> str:
    parts = [
        "# 클립 계획",
        json.dumps({k: clip_plan.get(k) for k in ("title", "kind", "brief", "sourcePages")}, ensure_ascii=False, indent=1),
        f"\n강의 전체 페이지 수: {page_count}. sourcePages와 slides.page는 아래 페이지 중에서만 쓴다.",
        "\n# 강의 페이지",
    ]
    for p in pages:
        parts.append(f"\n## {p['number']}쪽\n{p['text']}")
        if p.get("description"):
            parts.append(f"\n(페이지 그림 해설) {p['description']}")
    parts.append("\n위 계획으로 설계도 JSON을 써라.")
    return "\n".join(parts)


def _retry_note(raw: str, errors: list[str]) -> str:
    return ("\n\n# 다시 쓰기\n앞서 쓴 설계도가 형식 검사에서 아래 오류로 실패했다. 오류를 모두 고친 설계도 전체를 다시 써라.\n"
            + "\n".join(f"- {e}" for e in errors[:30])
            + "\n\n## 앞서 쓴 설계도\n" + raw[:20000])


def _parse_json(raw: str) -> dict:
    text = raw.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("JSON 객체가 없음")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError as e:
        raise ValueError(str(e)) from e


# ---------- 모델 호출 ----------

def _call(model: str, system: str, user: str) -> tuple[str, dict]:
    t0 = time.monotonic()
    raw, usage = (_call_claude if model.startswith("claude") else _call_openai)(model, system, user)
    usage["seconds"] = round(time.monotonic() - t0, 1)
    return raw, usage


def _call_claude(model: str, system: str, user: str) -> tuple[str, dict]:
    import anthropic

    client = anthropic.Anthropic()
    try:
        with client.beta.messages.stream(
            model=model,
            max_tokens=MAX_TOKENS,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.RateLimitError as e:
        raise PipelineError("PROVIDER_RATE_LIMIT", "AI 서비스 요청이 많습니다. 잠시 후 다시 시도해 주세요.", True) from e
    except anthropic.APITimeoutError as e:
        raise PipelineError("PROVIDER_TIMEOUT", "AI 서비스 응답이 늦습니다. 다시 시도해 주세요.", True) from e
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
        raise PipelineError("PROVIDER_ERROR", "AI 서비스 오류가 났습니다. 다시 시도해 주세요.", True) from e

    if msg.stop_reason == "refusal":
        raise PipelineError("PROVIDER_REFUSED", "AI가 이 내용으로 설계도를 만들지 않았습니다.", False)
    u = msg.usage
    cache_read = getattr(u, "cache_read_input_tokens", 0) or 0
    cache_write = getattr(u, "cache_creation_input_tokens", 0) or 0
    pin, pout = PRICES[model]
    cost = (u.input_tokens * pin + cache_write * pin * 1.25 + cache_read * CLAUDE_CACHE_READ[model]
            + u.output_tokens * pout) / 1e6
    text = "".join(b.text for b in msg.content if b.type == "text")
    return text, {"provider": "anthropic", "model": msg.model, "inputTokens": u.input_tokens + cache_read + cache_write,
                  "cacheReadTokens": cache_read, "outputTokens": u.output_tokens, "costUsd": round(cost, 4),
                  "stopReason": msg.stop_reason}


def _call_openai(model: str, system: str, user: str) -> tuple[str, dict]:
    import openai

    client = openai.OpenAI()
    try:
        resp = client.responses.create(
            model=model,
            instructions=system,
            input=user,
            max_output_tokens=MAX_TOKENS,
            text={"format": {"type": "json_object"}},
        )
    except openai.RateLimitError as e:
        raise PipelineError("PROVIDER_RATE_LIMIT", "AI 서비스 요청이 많습니다. 잠시 후 다시 시도해 주세요.", True) from e
    except openai.APITimeoutError as e:
        raise PipelineError("PROVIDER_TIMEOUT", "AI 서비스 응답이 늦습니다. 다시 시도해 주세요.", True) from e
    except (openai.APIStatusError, openai.APIConnectionError) as e:
        raise PipelineError("PROVIDER_ERROR", "AI 서비스 오류가 났습니다. 다시 시도해 주세요.", True) from e
    u = resp.usage
    pin, pout = PRICES[model]
    cost = (u.input_tokens * pin + u.output_tokens * pout) / 1e6
    return resp.output_text, {"provider": "openai", "model": resp.model, "inputTokens": u.input_tokens,
                              "outputTokens": u.output_tokens, "costUsd": round(cost, 4),
                              "stopReason": resp.status}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="설계도 생성 (유료 호출)")
    ap.add_argument("--pages-json", type=Path, required=True, help="extract_pdf 결과 pages.json")
    ap.add_argument("--plan", type=Path, required=True, help="클립 계획 JSON")
    ap.add_argument("--model", default="claude-sonnet-5-5", choices=sorted(PRICES))
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)

    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    extracted = json.loads(args.pages_json.read_text(encoding="utf-8"))
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    pages = [p for p in extracted["pages"] if p["number"] in plan["sourcePages"]]
    try:
        r = make_blueprint(plan, pages, extracted["pageCount"], args.model)
    except PipelineError as e:
        print(f"실패: {e}")
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(r["blueprint"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.out.with_suffix(".usage.json").write_text(json.dumps(r["usage"], ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(u["costUsd"] for u in r["usage"])
    print(f"통과 (시도 {r['attempts']}번), 비용 ${total:.4f}, {r['usage']} → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
