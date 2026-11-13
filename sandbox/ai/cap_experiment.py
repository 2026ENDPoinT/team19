"""클립 수 상한 실험 (11/13). 프롬프트에서 클립 수 숫자를 감추고 분할해, AI가 스스로 고른 개수를 본다. 유료 호출.

    .venv/Scripts/python sandbox/ai/cap_experiment.py review algo-dc se-arch nlp-transformer rl-mdp py-basic

- 시스템 프롬프트의 "약 N쪽당 1개, 최대 M개"와 사용자 프롬프트의 "최대 N개"를 지운다. 모드별 방향(적게/중간/많이)은 남긴다.
- 검사는 하되 상한 검사는 빼고 한 번만 부른다(다시 쓰기에서 상한이 새지 않게).
- 결과: sandbox/ai/mode-eval/<강의>/outline-<모드>-nocap.json
"""

from __future__ import annotations

import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from pipeline import costlog, llm, outline  # noqa: E402

NO_CAP = 1000


def system_prompt(mode: str) -> str:
    text = outline.build_system_prompt(mode)
    return re.sub(r" \((내용 )?약 \d+쪽당 1개, 최대 \d+개\)", "", text)


def user_prompt(mode: str, pages: list[dict], desc: dict[int, str]) -> str:
    text = outline.build_user_prompt(mode, pages, desc, NO_CAP)
    first, rest = text.split("\n", 1)
    return f"모드: {mode}. 클립 수는 자료 내용에 맞게 네가 정한다.\n{rest}"


def run(mode: str, lecture: str) -> str:
    ext = ROOT / "materials" / "extract" / lecture
    pages = json.loads((ext / "pages.json").read_text(encoding="utf-8"))["pages"]
    desc = {int(d["number"]): d["description"] for d in json.loads((ext / "descriptions.json").read_text(encoding="utf-8"))["pages"]}
    cap = outline.clip_cap(mode, outline.count_content_pages(pages, desc))
    content = outline.count_content_pages(pages, desc)
    data, usage = llm.call_json(outline.DEFAULT_MODEL, system_prompt(mode), user_prompt(mode, pages, desc))
    errs = outline.validate_outline(data, mode, {int(p["number"]) for p in pages}, NO_CAP)
    out = ROOT / "sandbox/ai/mode-eval" / lecture / f"outline-{mode}-nocap.json"
    out.write_text(json.dumps({**data, "usage": [usage], "errors": errs}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    costlog.append("outline", out.relative_to(ROOT).as_posix(), [usage], note=f"cap experiment {mode}")
    plans = data.get("clipPlans") or []
    covered = {n for p in plans for n in p.get("sourcePages", [])}
    old = json.loads((out.parent / f"outline-{mode}.json").read_text(encoding="utf-8"))["clipPlans"]
    return (f"{lecture:16} 내용 {content:2}쪽 | 상한 {cap:2} (기존 {len(old):2}개) | 숨김 {len(plans):2}개, "
            f"덮은 쪽 {len(covered)}, 오류 {len(errs)}, ${usage['costUsd']:.4f}")


def main() -> int:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    mode, lectures = sys.argv[1], sys.argv[2:]
    with ThreadPoolExecutor(len(lectures)) as ex:
        for line in ex.map(lambda lec: run(mode, lec), lectures):
            print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
