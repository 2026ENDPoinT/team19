"""평가 세트 실행 (P-AI-03). 분할 계획의 클립 하나로 설계도(와 음성)를 만들어 samples/eval/에 둔다. 유료 호출.

    .venv/Scripts/python sandbox/ai/eval_run.py algo-dc review c7 --models gpt-6.1-terra claude-haiku-5-5 [--audio gpt-6.1-terra]

입력: materials/extract/<강의>/pages.json, descriptions.json (git 제외), sandbox/ai/mode-eval/<강의>/outline-<모드>.json
출력: samples/eval/<강의>-<클립id>/ 에 plan.json, pages.json(이 클립 페이지만), pages/*.png, blueprint-<모델>.json, (audio)
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from pipeline import costlog  # noqa: E402
from pipeline.blueprint import make_blueprint  # noqa: E402
from pipeline.errors import PipelineError  # noqa: E402
from pipeline.validate import validate_blueprint  # noqa: E402

SHORT = {"gpt-6.1-sol": "sol", "gpt-6.1-terra": "terra", "claude-haiku-5-5": "haiku", "claude-sonnet-5-5": "sonnet", "gpt-6-luna": "luna"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("lecture")
    ap.add_argument("mode")
    ap.add_argument("clip_id")
    ap.add_argument("--models", nargs="+", default=["gpt-6.1-terra"])
    ap.add_argument("--audio", nargs="*", default=[], help="이 모델들의 설계도로 음성까지 만든다")
    ap.add_argument("--prompt-lang", default="ko", choices=["ko", "en"], help="en이면 결과 이름 뒤에 -en이 붙는다")
    ap.add_argument("--reuse", action="store_true", help="설계도 파일이 이미 있으면 다시 만들지 않는다(음성만 추가할 때)")
    args = ap.parse_args()

    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    ext = ROOT / "materials" / "extract" / args.lecture
    extracted = json.loads((ext / "pages.json").read_text(encoding="utf-8"))
    desc = {d["number"]: d["description"] for d in json.loads((ext / "descriptions.json").read_text(encoding="utf-8"))["pages"]}
    outline = json.loads((ROOT / "sandbox/ai/mode-eval" / args.lecture / f"outline-{args.mode}.json").read_text(encoding="utf-8"))
    plan = next(p for p in outline["clipPlans"] if p["id"] == args.clip_id)

    out = ROOT / "samples" / "eval" / f"{args.lecture}-{args.mode}-{args.clip_id}"
    (out / "pages").mkdir(parents=True, exist_ok=True)
    pages = []
    for p in extracted["pages"]:
        if p["number"] in plan["sourcePages"]:
            name = f"page-{p['number']:03d}.png"
            shutil.copyfile(p["imagePath"], out / "pages" / name)
            pages.append({"number": p["number"], "text": p["text"], "description": desc.get(p["number"], ""),
                          "imagePath": f"pages/{name}", "empty": p["empty"]})
    (out / "plan.json").write_text(json.dumps({**plan, "mode": args.mode}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (out / "pages.json").write_text(json.dumps({"pageCount": extracted["pageCount"], "pages": pages}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    for model in args.models:
        tag = SHORT.get(model, model) + ("-en" if args.prompt_lang == "en" else "")
        path = out / f"blueprint-{tag}.json"
        if args.reuse and path.exists():
            r = {"blueprint": json.loads(path.read_text(encoding="utf-8")), "usage": [], "attempts": 0}
        else:
            try:
                r = make_blueprint(plan, pages, extracted["pageCount"], model=model, prompt_lang=args.prompt_lang)
            except PipelineError as e:
                print(f"{tag}: 실패 {e}", flush=True)
                continue
        bp = r["blueprint"]
        path.write_text(json.dumps(bp, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if r["usage"]:
            costlog.append("blueprint", path.relative_to(ROOT).as_posix(), r["usage"], note=f"eval, prompt {args.prompt_lang}, attempts {r['attempts']}")
        lines = [l for s in bp["scenes"] for l in s["lines"]]
        speech = sum(1 for s in bp["scenes"] for x in s.get("speech", []) if x.strip())
        cost = sum(u["costUsd"] for u in r["usage"])
        print(f"{tag}: 통과(시도 {r['attempts']}) 장면 {len(bp['scenes'])} 문장 {len(lines)} speech {speech} "
              f"글자 {sum(len(l) for l in lines)} ${cost:.4f} {sum(u.get('seconds', 0) for u in r['usage']):.0f}초 검사 {validate_blueprint(bp, extracted['pageCount']) or 'OK'}", flush=True)
        if model in args.audio:
            from pipeline.audio import make_audio
            a = make_audio(bp, out / f"audio-{tag}")
            res = {"resultId": f"eval-{args.lecture}-{args.clip_id}-{tag}", "durationSec": a["durationSec"],
                   "audioUrl": f"audio-{tag}/audio.mp3", "blueprint": bp, "captions": a["captions"]}
            (out / f"result-{tag}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            costlog.append("audio", (out / f"audio-{tag}").relative_to(ROOT).as_posix(), a["usage"], note="eval")
            shutil.rmtree(out / f"audio-{tag}" / "lines", ignore_errors=True)
            print(f"  음성 {a['durationSec']}초", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
