"""설계도 생성 (make_blueprint). 형식은 docs/04, 호출 방법은 contracts/pipeline.md.

사용법:
    from pipeline.blueprint import make_blueprint
    r = make_blueprint(clip_plan, pages, page_count=57)  # model 생략: AI_BLUEPRINT_MODEL 또는 Terra
    r["blueprint"], r["usage"]

명령줄 (유료 호출 1~2번):
    .venv/Scripts/python -m pipeline.blueprint --pages-json out/pages.json --plan plan.json --model claude-sonnet-5-5 --out out/bp.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

from pipeline import costlog
from pipeline.errors import PipelineError, raise_if_no_credit
from pipeline.validate import LIMITS, SUPPORTED_FORMULA_TERMS, SUPPORTED_LAYOUTS, SUPPORTED_NEAR, SUPPORTED_SLOTS, screen_text_errors, validate_blueprint

ROOT = Path(__file__).resolve().parents[1]
# 수식 항 강조 규칙(D-46). 검사기의 SUPPORTED_FORMULA_TERMS가 True일 때만 프롬프트에 넣는다.
# 글을 부품·노드·칸 옆에 붙이는 규칙(D-60). 검사기의 SUPPORTED_NEAR가 True일 때만 넣는다.
NEAR_RULE = {
    "ko": ("\n- **이름표·값·상태는 주인 옆에 붙인다(near).** body, keyword, formula 글에 slot 대신 "
           "`\"near\": {\"target\": 주인 id, \"side\": \"above\"/\"below\"/\"left\"/\"right\"}`를 쓰면 그 부품·노드 옆에 붙는다. "
           "격자의 한 칸 밑에 붙이려면 `\"cell\": \"3\"`을 더한다(예: 성공 칸 밑의 `P(X=1)=p`, 배열 옆의 \"피봇 8\"). "
           "붙은 글은 자리를 차지하지 않고, 주인이 화면에 있는 동안만 보일 수 있다(주인을 hide하기 전에 글도 hide). "
           "주인 하나에 붙은 글은 2개 이하, 짧게(15자 안팎). "
           "글을 다른 주인 옆으로 옮길 때는 `attach`(args [주인 id, 방향] 또는 [주인 id, 방향, 칸])를 쓴다. 글이 움직여 붙으므로, "
           "아래 자리에 띄운 식을 설명이 끝난 뒤 그 값의 주인 칸 밑으로 옮기는 식으로 쓴다(예: `P(X=1)=p`를 성공 칸 밑으로). "
           "place로 자리에 돌려보내면 다시 자리 글이 된다."),
    "en": ("\n- **Attach labels, values, and states next to their owner (near).** For a body, keyword, or formula text, write "
           "`\"near\": {\"target\": owner id, \"side\": \"above\"/\"below\"/\"left\"/\"right\"}` instead of slot to attach it beside that "
           "component or node. To attach under one grid cell, add `\"cell\": \"3\"` (e.g. `P(X=1)=p` under the success cell, "
           "\"피봇 8\" beside the array). An attached text takes no slot and may be visible only while its owner is on screen "
           "(hide the text before hiding the owner). At most 2 texts per owner, short (about 15 chars). "
           "To move a text to another owner, use `attach` (args [owner id, side] or [owner id, side, cell]); the text moves "
           "on screen, e.g. a formula shown in the bottom slot moves under the cell it belongs to once explained "
           "(`P(X=1)=p` under the success cell). place sends it back to a slot."),
}
TERMS_RULE = {
    "ko": ("\n- 수식의 한 부분을 설명할 때는 content 안에서 그 부분을 `\\term{항id}{LaTeX}`로 감싸고, 설명하는 문장에서 "
           "`highlight`의 args에 항id를 넣는다(예: target 수식id, args [\"r\"]). 설명이 끝나면 같은 args로 unhighlight한다. "
           "비교하는 항들은 한 highlight에 같이 넣는다. args 없는 highlight는 수식 전체 강조다. 항id는 영문 소문자·숫자·_이고 "
           "한 수식 안에서 겹치지 않는다. 같은 기호가 여러 번 나오면 설명할 자리만 감싼다. setText로 식을 바꾸면 새 내용에도 "
           "필요한 \\term을 다시 쓴다. \\term은 formula의 content와 setText에만 쓰고 lines와 speech에는 쓰지 않는다."),
    "en": ("\n- To explain one part of a formula, wrap that part inside content as `\\term{termId}{LaTeX}` and, in the sentence "
           "that explains it, put the term id in `highlight` args (e.g. target formula id, args [\"r\"]). Unhighlight with the same "
           "args when done. Put terms being compared in one highlight. highlight without args highlights the whole formula. "
           "Term ids are lowercase letters, digits, and _, unique within one formula. If a symbol appears several times, wrap only "
           "the occurrence you explain. After setText, write the needed \\term again in the new content. Use \\term only in "
           "formula content and setText, never in lines or speech."),
}
PROMPT_FILE = Path(__file__).with_name("prompts") / "blueprint_system.md"
# parts-test를 바탕으로 시점 규칙에 맞게 고친 프롬프트 전용 예시. parts-test는 FE 테스트가 쓰므로 따로 둔다.
EXAMPLE_FILE = Path(__file__).with_name("prompts") / "blueprint_example.json"

# 100만 토큰당 달러 (입력, 출력). docs/06 기준. 캐시 읽기는 Claude만 따로 계산한다.
PRICES = {
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
    "gpt-6.1-sol": (2.00, 10.00),
    "gpt-6.1-terra": (1.00, 5.00),
    "gpt-6-luna": (0.10, 0.50),
}
CLAUDE_CACHE_READ = {"claude-sonnet-5-5": 0.20, "claude-haiku-5-5": 0.01}
MAX_TOKENS = 32000
# Haiku는 high에서 생각에 출력 상한을 다 써 잘린다(11/12 실험). 모델 기본값인 medium으로 둔다.
CLAUDE_EFFORT = {"claude-haiku-5-5": "medium"}
# 기본 설계도 모델. 팀장 방향(Q-AI-07): 품질 차이가 크지 않으면 Terra. 환경변수 AI_BLUEPRINT_MODEL로 바꾼다.
DEFAULT_MODEL = "gpt-6.1-sol"
MODE_NAMES = {"intro": "입문", "review": "기본", "exam": "심화"}   # P-AI-10. 모드가 없는 옛 계획은 기본처럼 쓴다


def make_blueprint(clip_plan: dict, pages: list[dict], page_count: int, model: str | None = None,
                   prompt_lang: str = "en") -> dict:
    """클립 계획 하나로 설계도를 만든다. 검사에 실패하면 오류를 붙여 한 번 다시 만든다.

    pages: [{"number", "text", "description"(있으면)}] 이 클립에 필요한 페이지만.
    prompt_lang: 시스템 프롬프트 언어 "ko" 또는 "en" (내레이션은 둘 다 한국어). 기본은 en(D-58: 입력 토큰이 약 10% 적다).
    돌려주는 값: {"blueprint": dict, "usage": [호출별 사용량], "attempts": 시도 수}
    """
    model = model or os.getenv("AI_BLUEPRINT_MODEL", DEFAULT_MODEL)
    if model not in PRICES:
        raise ValueError(f"모르는 모델: {model}")
    system = build_system_prompt(prompt_lang)
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
            # 문체(화면 글이 문장형)는 한 번만 다시 시킨다. 형식이 맞으면 두 번째 결과는 그대로 쓴다.
            if not last_errors and attempt == 1:
                last_errors = screen_text_errors(bp)
        except ValueError as e:
            bp, last_errors = None, [f"JSON을 읽을 수 없음: {e}"]
        if not last_errors:
            return {"blueprint": bp, "usage": usage, "attempts": attempt}
    raise PipelineError("BLUEPRINT_INVALID", "설계도를 만들지 못했습니다. 다시 시도해 주세요.", retryable=True)


# ---------- 프롬프트 ----------

def build_system_prompt(lang: str = "ko") -> str:
    if lang == "en":
        return _fill(PROMPT_FILE.with_name("blueprint_system_en.md"), "\n".join([
            f"- texts: title {LIMITS['text']['title']} chars, body {LIMITS['text']['body']} chars, keyword {LIMITS['text']['keyword']} chars, formula one line",
            f"- diagrams: {LIMITS['diagram_nodes']} nodes ({LIMITS['tree_nodes']} for tree, depth {LIMITS['tree_levels']} levels), {LIMITS['diagram_edges']} edges, node label {LIMITS['node_label']} chars",
            f"- grids: one-row array {LIMITS['grid_row_cells']} cells; multi-row {LIMITS['grid_2d'][0]} rows × {LIMITS['grid_2d'][1]} columns; "
            f"if any cell is longer than {LIMITS['table_cell_trigger']} chars it counts as a table: {LIMITS['table'][0]} rows × {LIMITS['table'][1]} columns; cell content {LIMITS['cell_chars']} chars",
            f"- codes: {LIMITS['code_lines']} lines, {LIMITS['code_line_chars']} chars per line",
            f"- slides: mark label {LIMITS['mark_label']} chars, at most {LIMITS['marks_visible']} marks visible at once",
            f"- scene: {LIMITS['scene_lines']} sentences, {LIMITS['actions_per_line']} actions per sentence",
        ]), "en")
    limits = "\n".join([
        f"- texts: title {LIMITS['text']['title']}자, body {LIMITS['text']['body']}자, keyword {LIMITS['text']['keyword']}자, formula 한 줄",
        f"- diagrams: 노드 {LIMITS['diagram_nodes']}개(tree는 {LIMITS['tree_nodes']}개, 깊이 {LIMITS['tree_levels']}단), 선 {LIMITS['diagram_edges']}개, 노드 라벨 {LIMITS['node_label']}자",
        f"- grids: 한 줄 배열 {LIMITS['grid_row_cells']}칸, 여러 줄이면 {LIMITS['grid_2d'][0]}줄 × {LIMITS['grid_2d'][1]}칸, "
        f"{LIMITS['table_cell_trigger']}자를 넘는 칸이 있으면 표로 보고 {LIMITS['table'][0]}줄 × {LIMITS['table'][1]}칸, 칸 내용 {LIMITS['cell_chars']}자",
        f"- codes: {LIMITS['code_lines']}줄, 한 줄 {LIMITS['code_line_chars']}자",
        f"- slides: mark 라벨 {LIMITS['mark_label']}자, 동시에 보이는 mark {LIMITS['marks_visible']}개",
        f"- 장면: 문장 {LIMITS['scene_lines']}개, 문장 하나에 동작 {LIMITS['actions_per_line']}개",
    ])
    return _fill(PROMPT_FILE, limits)


def _fill(prompt_file: Path, limits: str, lang: str = "ko") -> str:
    example = json.dumps(json.loads(EXAMPLE_FILE.read_text(encoding="utf-8")), ensure_ascii=False, separators=(",", ":"))
    return (prompt_file.read_text(encoding="utf-8")
            .replace("<<TERMS>>", TERMS_RULE[lang] if SUPPORTED_FORMULA_TERMS else "")
            .replace("<<NEAR>>", NEAR_RULE[lang] if SUPPORTED_NEAR else "")
            .replace("<<LAYOUTS>>", ", ".join(SUPPORTED_LAYOUTS))
            .replace("<<SLOTS>>", ", ".join(SUPPORTED_SLOTS))
            .replace("<<LIMITS>>", limits)
            .replace("<<EXAMPLE>>", example))


def build_user_prompt(clip_plan: dict, pages: list[dict], page_count: int) -> str:
    parts = [
        "# 클립 계획",
        json.dumps({k: clip_plan.get(k) for k in ("title", "kind", "brief", "sourcePages")}, ensure_ascii=False, indent=1),
        *([f"\n모드: {clip_plan['mode']}({MODE_NAMES[clip_plan['mode']]}). 시스템 지시의 모드별 규칙을 따른다."] if clip_plan.get("mode") in MODE_NAMES else []),
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
            output_config={"effort": CLAUDE_EFFORT.get(model, "high")},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.RateLimitError as e:
        raise_if_no_credit(e)
        raise PipelineError("PROVIDER_RATE_LIMIT", "AI 서비스 요청이 많습니다. 잠시 후 다시 시도해 주세요.", True) from e
    except anthropic.APITimeoutError as e:
        raise PipelineError("PROVIDER_TIMEOUT", "AI 서비스 응답이 늦습니다. 다시 시도해 주세요.", True) from e
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
        raise_if_no_credit(e)
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
        raise_if_no_credit(e)
        raise PipelineError("PROVIDER_RATE_LIMIT", "AI 서비스 요청이 많습니다. 잠시 후 다시 시도해 주세요.", True) from e
    except openai.APITimeoutError as e:
        raise PipelineError("PROVIDER_TIMEOUT", "AI 서비스 응답이 늦습니다. 다시 시도해 주세요.", True) from e
    except (openai.APIStatusError, openai.APIConnectionError) as e:
        raise_if_no_credit(e)
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
    ap.add_argument("--model", default=None, choices=sorted(PRICES), help=f"생략하면 AI_BLUEPRINT_MODEL 또는 {DEFAULT_MODEL}")
    ap.add_argument("--prompt-lang", default="en", choices=["ko", "en"], help="시스템 프롬프트 언어")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)

    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    extracted = json.loads(args.pages_json.read_text(encoding="utf-8"))
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    pages = [p for p in extracted["pages"] if p["number"] in plan["sourcePages"]]
    try:
        r = make_blueprint(plan, pages, extracted["pageCount"], args.model, args.prompt_lang)
    except PipelineError as e:
        print(f"실패: {e}")
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(r["blueprint"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.out.with_suffix(".usage.json").write_text(json.dumps(r["usage"], ensure_ascii=False, indent=1), encoding="utf-8")
    costlog.append("blueprint", args.out.as_posix(), r["usage"], note=f"prompt {args.prompt_lang}, attempts {r['attempts']}")
    total = sum(u["costUsd"] for u in r["usage"])
    print(f"통과 (시도 {r['attempts']}번), 비용 ${total:.4f}, {r['usage']} → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
