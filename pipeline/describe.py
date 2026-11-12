"""페이지 해설 (describe_pages). 페이지 그림을 보고 글자 추출로 알 수 없는 내용을 글로 적는다(Q-AI-07).

강의마다 한 번 한다. 뒤 단계(분할 계획, 설계도)는 글자 + 이 해설만 쓴다(D-12).
여러 페이지를 한 번에 보내 호출 수를 줄인다.

사용법:
    from pipeline.describe import describe_pages
    r = describe_pages(pages)          # pages: extract_pdf 결과의 pages
    r["pages"]  # [{"number", "description", "kind", "textBroken"}]

명령줄 (유료 호출, 페이지 BATCH개마다 1번):
    .venv/Scripts/python -m pipeline.describe out/lec/pages.json --pages 21-22 --out out/lec/descriptions.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from pipeline import costlog, llm
from pipeline.errors import PipelineError

ROOT = Path(__file__).resolve().parents[1]
PROMPT_FILE = Path(__file__).with_name("prompts") / "describe_system.md"
DEFAULT_MODEL = "gpt-6.1-terra"   # 환경변수 AI_DESCRIBE_MODEL로 바꾼다. 모델 비교는 Q-AI-07
BATCH = 6                          # 한 번에 보내는 페이지 수
PARALLEL = 4                       # 동시에 보내는 묶음 수 (요청 한도를 넘지 않게 작게)
TEXT_HINT = 300                    # 깨짐 판단용으로 함께 보내는 추출 글자 수
KINDS = ("content", "cover", "toc", "admin", "empty")


def describe_pages(pages: list[dict], model: str | None = None) -> dict:
    """pages: [{"number", "text", "imagePath", "empty"}].

    돌려주는 값: {"pages": [{"number", "description", "kind", "textBroken"}], "usage": [...]}
    빈 페이지와 그림 파일이 없는 페이지는 부르지 않고 kind "empty"로 채운다.
    """
    model = model or os.getenv("AI_DESCRIBE_MODEL", DEFAULT_MODEL)
    system = PROMPT_FILE.read_text(encoding="utf-8")
    out: dict[int, dict] = {}
    todo = []
    for p in pages:
        n = int(p["number"])
        if p.get("empty") or not p.get("imagePath") or not Path(p["imagePath"]).exists():
            out[n] = {"number": n, "description": "", "kind": "empty", "textBroken": False}
        else:
            todo.append(p)

    batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]

    def run(batch):
        return llm.call_json(model, system, _user_text(batch), [p["imagePath"] for p in batch], max_tokens=8000)

    # 묶음끼리는 서로 기다릴 필요가 없어 동시에 부른다. 57쪽 기준 약 2분 → 30초대(계약 시간 제한 3분).
    with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
        replies = list(pool.map(run, batches))

    usage: list[dict] = []
    for batch, (data, u) in zip(batches, replies):
        usage.append(u)
        got = {}
        for item in data.get("pages", []) if isinstance(data, dict) else []:
            try:
                got[int(item["number"])] = item
            except (KeyError, TypeError, ValueError):
                continue
        for p in batch:
            n = int(p["number"])
            item = got.get(n, {})
            kind = item.get("kind") if item.get("kind") in KINDS else "content"
            broken = bool(item.get("textBroken"))
            out[n] = {"number": n, "description": _with_tags(str(item.get("description") or "")[:600], kind, broken),
                      "kind": kind, "textBroken": broken}

    result = [out[int(p["number"])] for p in pages]
    if result and all(not r["description"] for r in result) and all(not (p.get("text") or "").strip() for p in pages):
        raise PipelineError("PDF_NO_TEXT", "자료에서 글자와 그림 내용을 읽지 못했습니다.", False)
    return {"pages": result, "usage": usage}


TAGS = {"cover": "[표지]", "toc": "[목차]", "admin": "[행정 안내]", "empty": "[빈 페이지]"}


def _with_tags(desc: str, kind: str, broken: bool) -> str:
    """BE는 description 글만 저장하므로 종류와 깨짐 여부를 글 앞에 붙여 분할 단계로 넘긴다."""
    tags = [TAGS[kind]] if kind in TAGS else []
    if broken:
        tags.append("[추출 글자 깨짐: 아래 해설의 글자를 쓴다]")
    return " ".join(tags + [desc]).strip()


def _user_text(batch: list[dict]) -> str:
    parts = ["그림은 아래 페이지 순서대로 붙어 있다.\n"]
    for p in batch:
        text = " ".join((p.get("text") or "").split())[:TEXT_HINT]
        parts.append(f"## {p['number']}쪽\n추출된 글자: {text or '(없음)'}\n")
    parts.append("페이지마다 해설을 JSON으로 써라.")
    return "\n".join(parts)


def _page_range(spec: str) -> set[int]:
    nums: set[int] = set()
    for part in spec.split(","):
        a, _, b = part.partition("-")
        nums.update(range(int(a), int(b or a) + 1))
    return nums


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="페이지 해설 (유료 호출)")
    ap.add_argument("pages_json", type=Path, help="extract_pdf 결과 pages.json")
    ap.add_argument("--pages", help="예: 1-10,21 (생략하면 전체)")
    ap.add_argument("--model", default=None)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)

    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    extracted = json.loads(args.pages_json.read_text(encoding="utf-8"))
    pages = extracted["pages"]
    if args.pages:
        keep = _page_range(args.pages)
        pages = [p for p in pages if p["number"] in keep]
    try:
        r = describe_pages(pages, args.model)
    except PipelineError as e:
        print(f"실패: {e}")
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(r, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    costlog.append("describe", args.out.as_posix(), r["usage"], note=f"{len(pages)} pages")
    total = sum(u["costUsd"] for u in r["usage"])
    print(f"완료: {len(pages)}쪽, 호출 {len(r['usage'])}번, 비용 ${total:.4f} → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
