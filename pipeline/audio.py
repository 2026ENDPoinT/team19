"""음성 생성 (make_audio). 문장마다 TTS로 음성을 만들고 길이를 재서 파일 하나로 잇는다(D-13).

쉼과 장면 전환 규칙은 docs/04 시간 규칙. 결과 모양은 contracts/data-model.md의 ClipResult.

사용법:
    from pipeline.audio import make_audio
    r = make_audio(blueprint, "out/clip_01")
    r["audioPath"], r["durationSec"], r["captions"], r["usage"]

명령줄 (유료 호출, 문장 수만큼):
    .venv/Scripts/python -m pipeline.audio samples/clip-01/blueprint.json samples/clip-01
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import wave
from array import array
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from pipeline import costlog
from pipeline.errors import PipelineError, raise_if_no_credit
from pipeline.korean_numbers import spoken_text

ROOT = Path(__file__).resolve().parents[1]
RATE = 24000                 # OpenAI TTS pcm 출력: 24kHz, 16비트, 모노
LINE_GAP, SCENE_GAP = 0.3, 0.6
DEFAULT_MODEL = "gpt-4o-mini-tts"
DEFAULT_VOICE = "cedar"      # 팀장이 직접 비교해 고름 (2026-11-09). 다음 후보: marin
# 영어 지시가 한국어 지시보다 잘 맞았다(팀장 비교). 숫자 읽기 예시만 한국어로 둔다.
# 11/12 P-AI-04: 숫자 예시 줄을 "적힌 그대로 읽기"로 바꿨다. 설계도의 speech나 korean_numbers가 이미 한글로 바꿔 보낸다.
# 이 글을 바꾸면 모든 문장 음성 캐시가 무효가 된다(이전 samples는 다시 만들지 않는 한 영향 없음).
VOICE_STYLE = """Accent: Native standard Korean (Seoul dialect). No foreign accent; sound like a Korean university lecturer.
Tone: A friendly lecturer explaining one-on-one. Warm, bright, and calm. Not exaggerated or salesy.
Pacing: Slightly slower than normal conversation. Pause briefly at commas and at the end of each sentence.
Intonation: Let polite endings like "~예요" and "~해요" fall naturally. Do not raise the pitch at the end unless it is a question.
Script: Read the text exactly as written. Do not change any numbers or words.
English terms: Pronounce English words such as "merge" and "sort" the way a Korean lecturer would say them in class.
Emphasis: Put slight stress on key numbers and on the conclusion of each explanation.
Consistency: This is one sentence from a continuous lecture by the same speaker. Keep the same pitch, energy, volume, and pace as every other sentence; do not start fresh or sound like a new speaker."""
# 장면 단위 생성(기본, D-62)에서만 덧붙인다. 문장 사이를 확실히 쉬어야 무음으로 자를 수 있다.
SCENE_STYLE = "\nSentence breaks: The text has several sentences, one per line. Pause clearly, about half a second, after each sentence."
USD_PER_MINUTE = 0.015       # docs/06 추정 (gpt-4o-mini-tts)
TTS_PARALLEL = 4             # 동시에 보내는 문장 수. BE 작업 3개가 겹쳐도 12개
# 문장마다 소리 크기·앞뒤 무음을 맞춘다(D-38 톤 차이 완화, 11/14).
TARGET_RMS = 3300            # 약 -20 dBFS
GAIN_RANGE = (0.6, 1.8)
SILENCE_AMP = 600            # 10ms 구간의 최대 진폭이 이보다 작으면 무음으로 본다
FRAME = RATE // 100          # 10ms


def make_audio(blueprint: dict, out_dir, model: str = DEFAULT_MODEL, voice: str = DEFAULT_VOICE,
               fmt: str = "mp3", unit: str | None = None) -> dict:
    """검증된 설계도의 문장마다 음성을 만들고 audio.mp3(또는 audio.wav) 하나로 잇는다.

    문장 음성은 out_dir/lines/에 저장하고, 같은 문장·목소리면 다시 부르지 않고 재사용한다.
    기본은 장면을 한 번에 읽혀 문장 사이 무음으로 자른다(톤이 이어짐, D-62). unit="line"(또는 AI_TTS_UNIT=line)이면 문장마다 만든다.
    자르기에 실패한 장면은 문장마다 다시 만든다.
    돌려주는 값: {"audioPath", "durationSec", "captions", "usage"}
    """
    unit = unit or os.getenv("AI_TTS_UNIT", "scene")   # D-62: 장면 단위가 기본
    out = Path(out_dir)
    (out / "lines").mkdir(parents=True, exist_ok=True)
    client = None

    def cache(text: str, style: str) -> Path:
        key = hashlib.sha256(f"{model}|{voice}|{style}|{text}".encode()).hexdigest()[:16]
        return out / "lines" / f"{key}.pcm"

    def fetch_all(todo: dict[Path, tuple[str, str]]) -> float:
        """없는 캐시만 동시에 받는다. 새로 받은 음성 길이(초)를 돌려준다. 하나라도 실패하면 그 오류를 그대로 올린다."""
        nonlocal client
        todo = {p: v for p, v in todo.items() if not p.is_file()}
        if not todo:
            return 0.0
        client = client or _client()
        with ThreadPoolExecutor(max_workers=TTS_PARALLEL) as pool:
            list(pool.map(lambda p: p.write_bytes(_tts(client, model, voice, todo[p][0], todo[p][1])), todo))
        return sum(p.stat().st_size for p in todo) / 2 / RATE

    scenes = []  # [(scene, [(문장 번호, 자막, 음성 원고)])]
    for scene in blueprint["scenes"]:
        script = scene.get("speech") or []
        # 자막은 lines 그대로. 음성은 설계도의 speech(P-AI-04)를 쓰고, 없거나 ""이면 숫자를 한글 읽기로 바꿔 보낸다.
        scenes.append((scene, [(li, text, spoken_text(script[li] if li < len(script) and isinstance(script[li], str)
                                                       and script[li].strip() else text))
                               for li, text in enumerate(scene["lines"])]))

    pieces: dict[tuple[int, int], bytes] = {}
    new_seconds, fresh_lines = 0.0, 0
    if unit == "scene":
        joined = {si: cache("\n".join(s for _, _, s in lines), VOICE_STYLE + SCENE_STYLE)
                  for si, (_, lines) in enumerate(scenes) if len(lines) > 1}
        fresh_lines += sum(len(scenes[si][1]) for si, p in joined.items() if not p.is_file())
        new_seconds += fetch_all({p: ("\n".join(s for _, _, s in scenes[si][1]), VOICE_STYLE + SCENE_STYLE) for si, p in joined.items()})
        for si, p in joined.items():
            parts = split_scene(p.read_bytes(), [s for _, _, s in scenes[si][1]])
            for (li, _, _), part in zip(scenes[si][1], parts or []):
                pieces[(si, li)] = part
    line_todo = {}
    for si, (_, lines) in enumerate(scenes):
        for li, _, speech in lines:
            if (si, li) not in pieces:
                p = cache(speech, VOICE_STYLE)
                fresh_lines += not p.is_file() and p not in line_todo
                line_todo[p] = (speech, VOICE_STYLE)
                pieces[(si, li)] = p  # 받은 뒤 읽는다
    new_seconds += fetch_all(line_todo)
    reused = sum(len(lines) for _, lines in scenes) - fresh_lines

    pcm = bytearray()
    captions = []
    for si, (scene, lines) in enumerate(scenes):
        for li, text, _ in lines:
            if pcm:
                pcm += _silence(SCENE_GAP if li == 0 else LINE_GAP)
            data = pieces[(si, li)]
            start = len(pcm) / 2 / RATE
            pcm += level(data.read_bytes() if isinstance(data, Path) else data)
            captions.append({"sceneId": scene["id"], "lineIndex": li, "text": text,
                             "startSec": round(start, 2), "endSec": round(len(pcm) / 2 / RATE, 2)})

    path = _write_audio(out, bytes(pcm), fmt)
    duration = round(len(pcm) / 2 / RATE, 2)

    errors = check_captions(blueprint, captions, duration)
    if errors:
        raise PipelineError("TTS_FAILED", "음성과 자막 시간이 맞지 않습니다. 다시 시도해 주세요.", True)
    usage = [{"provider": "openai", "model": model, "voice": voice, "newAudioSec": round(new_seconds, 1),
              "reusedLines": reused, "costUsd": round(new_seconds / 60 * USD_PER_MINUTE, 4), "costIsEstimate": True}]
    return {"audioPath": str(path), "durationSec": duration, "captions": captions, "usage": usage}


def check_captions(blueprint: dict, captions: list[dict], duration: float) -> list[str]:
    """문장 수, 시간 순서, 마지막 끝 시간을 확인한다(contracts/pipeline.md)."""
    errors = []
    expected = [(s["id"], i) for s in blueprint["scenes"] for i in range(len(s["lines"]))]
    if [(c["sceneId"], c["lineIndex"]) for c in captions] != expected:
        errors.append("captions가 설계도의 문장과 일대일로 맞지 않음")
    prev_end = 0.0
    for c in captions:
        if not (prev_end <= c["startSec"] < c["endSec"]):
            errors.append(f"시간 순서 오류: {c['sceneId']} {c['lineIndex']}")
        prev_end = c["endSec"]
    if captions and captions[-1]["endSec"] > duration + 0.01:
        errors.append("마지막 문장 끝이 음성 길이보다 김")
    return errors


def _write_audio(out: Path, pcm: bytes, fmt: str) -> Path:
    """mp3는 64kbps(1분에 약 0.5MB). 인코더가 앞에 약 0.05초를 붙이지만 문장 단위 맞추기에는 영향이 없다."""
    if fmt == "mp3":
        import lameenc
        enc = lameenc.Encoder()
        enc.set_bit_rate(64)
        enc.set_in_sample_rate(RATE)
        enc.set_channels(1)
        enc.set_quality(2)
        path = out / "audio.mp3"
        path.write_bytes(enc.encode(pcm) + enc.flush())
        return path
    path = out / "audio.wav"
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm)
    return path


def _silence(seconds: float) -> bytes:
    return b"\x00\x00" * int(seconds * RATE)


def _frame_peaks(samples: array) -> list[int]:
    return [max(map(abs, samples[i:i + FRAME]), default=0) for i in range(0, len(samples), FRAME)]


def level(pcm: bytes) -> bytes:
    """문장 음성 하나의 앞뒤 무음을 0.05초로 다듬고 평균 소리 크기를 TARGET_RMS로 맞춘다.

    다듬으면 절반 넘게 사라지는 소리(거의 무음)는 다듬지 않는다. 확대는 GAIN_RANGE 안에서만, 넘치는 값은 자른다.
    """
    s = array("h")
    s.frombytes(pcm[: len(pcm) // 2 * 2])
    if not s:
        return pcm
    loud = [i for i, p in enumerate(_frame_peaks(s)) if p >= SILENCE_AMP]
    if loud:
        pad = FRAME * 5
        a, b = max(0, loud[0] * FRAME - pad), min(len(s), (loud[-1] + 1) * FRAME + pad)
        if b - a >= len(s) / 2:
            s = s[a:b]
    rms = math.sqrt(sum(x * x for x in s) / len(s)) or 1.0
    gain = min(max(TARGET_RMS / rms, GAIN_RANGE[0]), GAIN_RANGE[1])
    return array("h", (max(-32768, min(32767, round(x * gain))) for x in s)).tobytes()


def split_scene(pcm: bytes, speeches: list[str]) -> list[bytes] | None:
    """장면 하나를 한 번에 읽은 음성을 문장 수만큼 자른다. 가장 긴 무음 n-1곳을 경계로 쓴다.

    잘린 길이가 글자 수 비율과 크게 다르면(쉼표에서 잘린 것으로 보고) None. 그 장면은 문장마다 다시 만든다.
    """
    n = len(speeches)
    s = array("h")
    s.frombytes(pcm[: len(pcm) // 2 * 2])
    quiet = [p < SILENCE_AMP for p in _frame_peaks(s)]
    runs, i = [], 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            if i > 0 and j < len(quiet) and j - i >= 15:   # 앞뒤 끝 무음은 빼고, 0.15초 이상 쉰 곳만
                runs.append((i, j))
            i = j
        else:
            i += 1
    if len(runs) < n - 1:
        return None
    cuts = sorted(sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[: n - 1])
    bounds = [0] + [x for a, b in cuts for x in (a, b)] + [len(quiet)]
    parts = [s[bounds[k] * FRAME: bounds[k + 1] * FRAME].tobytes() for k in range(0, len(bounds), 2)]
    total_chars, total_len = sum(len(t) for t in speeches), sum(len(p) for p in parts)
    for p, t in zip(parts, speeches):
        share = len(p) / total_len / (len(t) / total_chars)
        if len(p) < 0.3 * RATE * 2 or not 0.4 <= share <= 2.5:
            return None
    return parts


def _client():
    import openai
    return openai.OpenAI()


def _tts(client, model: str, voice: str, text: str, style: str = VOICE_STYLE) -> bytes:
    import openai
    try:
        resp = client.audio.speech.create(model=model, voice=voice, input=text,
                                          instructions=style, response_format="pcm")
        return resp.read()
    except openai.RateLimitError as e:
        raise_if_no_credit(e)
        raise PipelineError("PROVIDER_RATE_LIMIT", "음성 서비스 요청이 많습니다. 잠시 후 다시 시도해 주세요.", True) from e
    except openai.APITimeoutError as e:
        raise PipelineError("PROVIDER_TIMEOUT", "음성 서비스 응답이 늦습니다. 다시 시도해 주세요.", True) from e
    except (openai.APIStatusError, openai.APIConnectionError) as e:
        raise_if_no_credit(e)
        raise PipelineError("TTS_FAILED", "음성을 만들지 못했습니다. 다시 시도해 주세요.", True) from e


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="음성 생성 (유료 호출)")
    ap.add_argument("blueprint", type=Path)
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    ap.add_argument("--result-id", help="result.json의 resultId (없으면 폴더 이름)")
    args = ap.parse_args(argv)

    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    bp = json.loads(args.blueprint.read_text(encoding="utf-8"))
    try:
        r = make_audio(bp, args.out_dir, voice=args.voice)
    except PipelineError as e:
        print(f"실패: {e}")
        return 1
    print(f"{r['durationSec']}초, 문장 {len(r['captions'])}개, {r['usage']} → {r['audioPath']}")
    if r["usage"][0]["newAudioSec"] > 0:   # 재사용만 했으면 처음 비용 기록을 덮어쓰지 않는다
        (args.out_dir / "audio.usage.json").write_text(json.dumps(r["usage"], ensure_ascii=False, indent=1), encoding="utf-8")
        costlog.append("audio", args.out_dir.as_posix(), r["usage"], note=f"durationSec {r['durationSec']}")
    result = {"resultId": args.result_id or args.out_dir.name, "durationSec": r["durationSec"], "audioUrl": Path(r["audioPath"]).name,
              "blueprint": bp, "captions": r["captions"]}
    (args.out_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
