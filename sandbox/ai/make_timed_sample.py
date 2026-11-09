"""손으로 쓴 설계도에 가짜 문장별 시간과 신호음 음성을 붙여 ClipResult 샘플을 만든다.

실제 TTS가 아니다. FE가 음성 동기화, 탐색, 반복을 시험하는 용도다.
- 문장 길이: 글자 수 x 0.15초 (최소 1.5초)
- 쉼: 문장 사이 0.3초, 장면 사이 0.6초 (docs/04 시간 규칙)
- 음성: 문장 시작마다 짧은 신호음. 장면의 첫 문장은 높은 음

사용법: py sandbox/ai/make_timed_sample.py samples/parts-test
"""

import json
import math
import struct
import sys
import wave
from pathlib import Path

RATE = 8000
LINE_GAP, SCENE_GAP = 0.3, 0.6


def build(folder: Path) -> None:
    bp = json.loads((folder / "blueprint.json").read_text(encoding="utf-8"))
    captions, t = [], 0.0
    for si, scene in enumerate(bp["scenes"]):
        if si > 0:
            t += SCENE_GAP - LINE_GAP
        for li, text in enumerate(scene["lines"]):
            if si > 0 or li > 0:
                t += LINE_GAP
            dur = max(1.5, len(text) * 0.15)
            captions.append({"sceneId": scene["id"], "lineIndex": li, "text": text,
                             "startSec": round(t, 2), "endSec": round(t + dur, 2)})
            t += dur
    duration = captions[-1]["endSec"]

    samples = [0] * int(duration * RATE + 1)
    for c in captions:
        freq = 880 if c["lineIndex"] == 0 else 440
        start = int(c["startSec"] * RATE)
        for i in range(int(0.15 * RATE)):
            if start + i < len(samples):
                samples[start + i] = int(6000 * math.sin(2 * math.pi * freq * i / RATE))
    with wave.open(str(folder / "audio.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", s) for s in samples))

    result = {"resultId": folder.name, "durationSec": duration, "audioUrl": "audio.wav",
              "blueprint": bp, "captions": captions}
    (folder / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{folder}: 문장 {len(captions)}개, {duration}초")
    report_coverage(bp)


def report_coverage(bp: dict) -> None:
    """11/11 필수 범위(D-34) 중 샘플에 빠진 것을 알려 준다."""
    used = {"action": set(), "part": set(), "layout": set(), "slot": set(), "style": set(), "grid": set()}
    for sc in bp["scenes"]:
        for a in sc["actions"]:
            used["action"].add(a["do"])
        for key in ("texts", "slides", "diagrams", "grids", "codes"):
            for c in sc[key]:
                used["part"].add(key)
                used["slot"].add(c["slot"])
                if key == "texts":
                    used["style"].add(c["style"])
                if key == "diagrams":
                    used["layout"].add(c["layout"])
                if key == "grids":
                    rows, long_cell = len(c["cells"]), any(len(x) > 3 for r in c["cells"] for x in r)
                    used["grid"].add("한 줄" if rows == 1 else ("표" if long_cell else "2차원"))
    need = {
        "action": {"show", "hide", "highlight", "unhighlight", "move", "swap", "setValue",
                   "setText", "focus", "mark", "unmark", "markLine"},
        "part": {"texts", "slides", "diagrams", "grids", "codes"},
        "layout": {"tree", "row"},
        "slot": {"top", "middle", "bottom"},
        "style": {"title", "body", "keyword", "formula"},
        "grid": {"한 줄", "2차원", "표"},
    }
    missing = {k: sorted(need[k] - used[k]) for k in need if need[k] - used[k]}
    print("범위 확인:", "모두 사용" if not missing else f"빠짐 {missing}")


if __name__ == "__main__":
    build(Path(sys.argv[1]))
