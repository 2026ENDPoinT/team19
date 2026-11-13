"""분할 계획 (plan_outline). 강의 전체를 모드에 맞는 클립 계획 목록으로 나눈다(docs/05, D-29, D-41).

사용법:
    from pipeline.outline import plan_outline
    r = plan_outline("intro", pages, descriptions)
    r["sections"], r["clipPlans"], r["usage"]

명령줄 (유료 호출 1~2번):
    .venv/Scripts/python -m pipeline.outline out/lec/pages.json --descriptions out/lec/descriptions.json --mode intro --out out/lec/outline-intro.json
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

from pipeline import costlog, llm
from pipeline.errors import PipelineError

ROOT = Path(__file__).resolve().parents[1]
PROMPT_FILE = Path(__file__).with_name("prompts") / "outline_system.md"
DEFAULT_MODEL = "gpt-6.1-sol"    # 환경변수 AI_OUTLINE_MODEL로 바꾼다. 모델 비교는 Q-AI-07
MODES = ("intro", "review", "exam")
# 모드별 클립 수 상한(D-29: 상한만 두고 숫자는 실험 후). 초기값이다.
# 자료 분량에 비례한다: 내용 페이지 PAGES_PER_CLIP쪽당 1개를 [최소, 최대] 안으로 자른다.
PAGES_PER_CLIP = {"intro": 10, "review": 5, "exam": 3}
CAP_RANGE = {"intro": (2, 5), "review": (3, 12), "exam": (4, 20)}   # 입문은 목차 수준이라 적게 (P-AI-10)
EXAM_COVERAGE = 0.9                # 심화는 내용 페이지의 90% 이상을 근거로 쓴다 (P-AI-10)
CAPS = {m: hi for m, (_, hi) in CAP_RANGE.items()}   # 절대 상한
NON_CONTENT_TAGS = ("[표지]", "[목차]", "[행정 안내]", "[빈 페이지]")
CLIP_KINDS = ("concept", "process", "example", "compare")
TITLE_MAX = 30                     # 영어 용어를 괄호로 붙이면 길어진다
PAGE_TEXT_MAX = 1200               # 페이지 하나에서 보내는 글자 수 상한


def plan_outline(mode: str, pages: list[dict], descriptions: list[dict] | None = None,
                 model: str | None = None) -> dict:
    """pages: [{"number", "text", "description"(있으면)}]. descriptions: [{"number", "description"}] (있으면 우선).

    돌려주는 값: {"sections": [{"title", "planIds"}],
                  "clipPlans": [{"id", "order", "title", "kind", "sourcePages", "prerequisites", "brief"}],
                  "usage": [...]}
    검사에 실패하면 오류를 붙여 한 번 다시 만든다. 또 실패하면 PipelineError(OUTLINE_INVALID).
    """
    if mode not in MODES:
        raise PipelineError("INVALID_MODE", "알 수 없는 모드입니다.", False)
    model = model or os.getenv("AI_OUTLINE_MODEL", DEFAULT_MODEL)
    desc = {int(d["number"]): d.get("description") or "" for d in (descriptions or [])}
    page_numbers = {int(p["number"]) for p in pages}
    if not any((p.get("text") or "").strip() or desc.get(int(p["number"])) or p.get("description") for p in pages):
        raise PipelineError("PDF_NO_TEXT", "자료에서 글자와 그림 내용을 읽지 못했습니다.", False)

    content = content_page_numbers(pages, desc)
    cap = clip_cap(mode, len(content))
    system = build_system_prompt(mode)
    user = build_user_prompt(mode, pages, desc, cap)
    usage: list[dict] = []
    errors: list[str] = []
    data: dict = {}
    for attempt in (1, 2):
        prompt = user if attempt == 1 else user + _retry_note(data, errors)
        data, u = llm.call_json(model, system, prompt)
        usage.append(u)
        errors = validate_outline(data, mode, page_numbers, cap, content)
        if not errors:
            return {**normalize(data, mode), "usage": usage}
    raise PipelineError("OUTLINE_INVALID", "클립 목록을 만들지 못했습니다. 다시 시도해 주세요.", True)


def clip_cap(mode: str, content_pages: int) -> int:
    lo, hi = CAP_RANGE[mode]
    return max(lo, min(hi, math.ceil(content_pages / PAGES_PER_CLIP[mode])))


def count_content_pages(pages: list[dict], desc: dict[int, str]) -> int:
    return len(content_page_numbers(pages, desc))


def content_page_numbers(pages: list[dict], desc: dict[int, str]) -> set[int]:
    """표지·목차·행정 안내·빈 페이지를 뺀 페이지 번호. 해설이 없으면 글자가 있는 페이지."""
    found = set()
    for p in pages:
        d = desc.get(int(p["number"])) or p.get("description") or ""
        if p.get("empty") or d.startswith(NON_CONTENT_TAGS):
            continue
        if (p.get("text") or "").strip() or d:
            found.add(int(p["number"]))
    return found


def build_system_prompt(mode: str) -> str:
    text = PROMPT_FILE.read_text(encoding="utf-8").replace("<<MODE>>", mode)
    for m in MODES:
        text = text.replace(f"<<PPC_{m}>>", str(PAGES_PER_CLIP[m])).replace(f"<<MAX_{m}>>", str(CAP_RANGE[m][1]))
    return text


def build_user_prompt(mode: str, pages: list[dict], desc: dict[int, str], cap: int | None = None) -> str:
    cap = cap or clip_cap(mode, count_content_pages(pages, desc))
    parts = [f"모드: {mode}. 이번 자료의 클립은 **최대 {cap}개**다. 상한을 채울 필요는 없다.",
             f"강의 전체 페이지 수: {len(pages)}", "\n# 강의 페이지"]
    for p in pages:
        n = int(p["number"])
        text = " ".join((p.get("text") or "").split())[:PAGE_TEXT_MAX]
        d = desc.get(n) or p.get("description") or ""
        parts.append(f"\n## {n}쪽\n{text or '(추출 글자 없음)'}")
        if d:
            parts.append(f"(페이지 해설) {d}")
    parts.append("\n위 강의를 분할 계획 JSON으로 나눠라.")
    return "\n".join(parts)


def validate_outline(data: dict, mode: str, page_numbers: set[int], cap: int | None = None,
                     content: set[int] | None = None) -> list[str]:
    """오류 문장 목록. 비어 있으면 통과. cap을 안 주면 모드의 절대 상한. content를 주면 심화의 페이지 반영률도 본다."""
    cap = cap or CAPS[mode]
    if not isinstance(data, dict):
        return ["JSON 객체가 아니다"]
    plans = data.get("clipPlans")
    if not isinstance(plans, list) or not plans:
        return ["clipPlans가 비어 있다"]
    errs = []
    if len(plans) > cap:
        errs.append(f"클립이 {len(plans)}개다. 이번 자료는 최대 {cap}개")
    seen: set[str] = set()
    for i, p in enumerate(plans):
        where = f"clipPlans[{i}]"
        if not isinstance(p, dict):
            errs.append(f"{where}: 객체가 아니다")
            continue
        pid = p.get("id")
        if not isinstance(pid, str) or not pid:
            errs.append(f"{where}: id가 없다")
        elif pid in seen:
            errs.append(f"{where}: id {pid} 중복")
        title = p.get("title")
        if not isinstance(title, str) or not title.strip():
            errs.append(f"{where}: title이 없다")
        elif len(_titled(p)) > TITLE_MAX:
            errs.append(f"{where}: 최종 title이 {len(_titled(p))}자다. 최대 {TITLE_MAX}자 (예시 접두사 포함)")
        if p.get("kind") not in CLIP_KINDS:
            errs.append(f"{where}: kind는 {', '.join(CLIP_KINDS)} 중 하나")
        src = p.get("sourcePages")
        if not isinstance(src, list) or not src:
            errs.append(f"{where}: sourcePages가 비어 있다")
        else:
            bad = [n for n in src if type(n) is not int or n not in page_numbers]
            if bad:
                errs.append(f"{where}: 없는 페이지 {bad}")
        pre = p.get("prerequisites", [])
        if not isinstance(pre, list) or any(x not in seen for x in pre):
            errs.append(f"{where}: prerequisites에는 앞에 나온 클립 id만 쓴다")
        brief = p.get("brief")
        if not isinstance(brief, str) or len(brief.strip()) < 30:
            errs.append(f"{where}: brief가 너무 짧다")
        if isinstance(pid, str):
            seen.add(pid)
    sections = data.get("sections", [])
    if not isinstance(sections, list):
        errs.append("sections는 목록이다")
    else:
        for j, s in enumerate(sections):
            if not isinstance(s, dict) or not isinstance(s.get("title"), str) or not isinstance(s.get("planIds"), list):
                errs.append(f"sections[{j}]: title과 planIds가 필요하다")
            elif any(x not in seen for x in s["planIds"]):
                errs.append(f"sections[{j}]: 없는 클립 id")
    if mode == "exam" and content:
        used = {n for p in plans if isinstance(p, dict) and isinstance(p.get("sourcePages"), list) for n in p["sourcePages"]}
        missing = sorted(content - used)
        if len(content) - len(missing) < EXAM_COVERAGE * len(content):
            errs.append(f"심화는 내용 페이지의 {EXAM_COVERAGE:.0%} 이상을 다뤄야 한다. 어느 클립에도 없는 내용 페이지: {missing}")
    return errs


def _titled(p: dict) -> str:
    """예시 클립은 제목이 "예시: "로 시작한다(팀장 11/14). 모델이 빠뜨리면 붙인다."""
    title = p["title"].strip()
    return f"예시: {title}" if p.get("kind") == "example" and not title.startswith("예시: ") else title


def normalize(data: dict, mode: str) -> dict:
    """검사를 통과한 결과에서 계약에 있는 칸만 남기고 order와 mode를 붙인다. mode는 설계도 단계가 말투를 고르는 데 쓴다."""
    plans = [{"id": p["id"], "order": i, "mode": mode, "title": _titled(p), "kind": p["kind"],
              "sourcePages": list(p["sourcePages"]), "prerequisites": list(p.get("prerequisites", [])),
              "brief": p["brief"].strip()} for i, p in enumerate(data["clipPlans"])]
    sections = [{"title": s["title"], "planIds": list(s["planIds"])} for s in data.get("sections", [])]
    return {"sections": sections, "clipPlans": plans}


def _retry_note(data: dict, errors: list[str]) -> str:
    return ("\n\n# 다시 쓰기\n앞서 쓴 분할 계획이 검사에서 아래 오류로 실패했다. 오류를 모두 고친 계획 전체를 다시 써라.\n"
            + "\n".join(f"- {e}" for e in errors[:30])
            + "\n\n## 앞서 쓴 계획\n" + json.dumps(data, ensure_ascii=False)[:20000])


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="분할 계획 (유료 호출)")
    ap.add_argument("pages_json", type=Path, help="extract_pdf 결과 pages.json")
    ap.add_argument("--descriptions", type=Path, help="describe 결과 JSON (있으면)")
    ap.add_argument("--mode", required=True, choices=MODES)
    ap.add_argument("--model", default=None)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)

    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    pages = json.loads(args.pages_json.read_text(encoding="utf-8"))["pages"]
    descriptions = json.loads(args.descriptions.read_text(encoding="utf-8"))["pages"] if args.descriptions else None
    try:
        r = plan_outline(args.mode, pages, descriptions, args.model)
    except PipelineError as e:
        print(f"실패: {e}")
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(r, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    costlog.append("outline", args.out.as_posix(), r["usage"], note=f"mode {args.mode}")
    total = sum(u["costUsd"] for u in r["usage"])
    print(f"통과 (시도 {len(r['usage'])}번), 클립 {len(r['clipPlans'])}개, 비용 ${total:.4f} → {args.out}")
    for p in r["clipPlans"]:
        print(f"  {p['order']}. [{p['kind']}] {p['title']} {p['sourcePages']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
