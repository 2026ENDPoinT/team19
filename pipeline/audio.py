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
import sys
import wave
from pathlib import Path

from pipeline import costlog
from pipeline.errors import PipelineError
from pipeline.korean_numbers import spoken_text

ROOT = Path(__file__).resolve().parents[1]
RATE = 24000                 # OpenAI TTS pcm 출력: 24kHz, 16비트, 모노
LINE_GAP, SCENE_GAP = 0.3, 0.6
DEFAULT_MODEL = "gpt-4o-mini-tts"
DEFAULT_VOICE = "cedar"      # 팀장이 직접 비교해 고름 (2026-11-09). 다음 후보: marin
# 영어 지시가 한국어 지시보다 잘 맞았다(팀장 비교). 숫자 읽기 예시만 한국어로 둔다.
# 숫자는 이제 korean_numbers가 한글로 바꿔 보내서 Numbers 줄은 거의 쓰이지 않는다.
# 이 글을 바꾸면 모든 문장 음성 캐시가 무효가 되므로 그대로 둔다.
VOICE_STYLE = """Accent: Native standard Korean (Seoul dialect). No foreign accent; sound like a Korean university lecturer.
Tone: A friendly lecturer explaining one-on-one. Warm, bright, and calm. Not exaggerated or salesy.
Pacing: Slightly slower than normal conversation. Pause briefly at commas and at the end of each sentence.
Intonation: Let polite endings like "~예요" and "~해요" fall naturally. Do not raise the pitch at the end unless it is a question.
Numbers: Read Arabic numerals the way a Korean speaker naturally would. Examples: "6 대 1" → "육 대 일", "10단계" → "십 단계", "9번" → "아홉 번".
English terms: Pronounce English words such as "merge" and "sort" the way a Korean lecturer would say them in class.
Emphasis: Put slight stress on key numbers and on the conclusion of each explanation."""
USD_PER_MINUTE = 0.015       # docs/06 추정 (gpt-4o-mini-tts)


def make_audio(blueprint: dict, out_dir, model: str = DEFAULT_MODEL, voice: str = DEFAULT_VOICE,
               fmt: str = "mp3") -> dict:
    """검증된 설계도의 문장마다 음성을 만들고 audio.mp3(또는 audio.wav) 하나로 잇는다.

    문장 음성은 out_dir/lines/에 저장하고, 같은 문장·목소리면 다시 부르지 않고 재사용한다.
    돌려주는 값: {"audioPath", "durationSec", "captions", "usage"}
    """
    out = Path(out_dir)
    (out / "lines").mkdir(parents=True, exist_ok=True)
    client = None
    pcm = bytearray()
    captions, new_seconds, reused = [], 0.0, 0

    for si, scene in enumerate(blueprint["scenes"]):
        for li, text in enumerate(scene["lines"]):
            if pcm:
                pcm += _silence(SCENE_GAP if li == 0 else LINE_GAP)
            # 자막은 숫자 그대로, 음성에는 숫자를 한글 읽기로 바꿔 보낸다(korean_numbers.py).
            speech = spoken_text(text)
            key = hashlib.sha256(f"{model}|{voice}|{VOICE_STYLE}|{speech}".encode()).hexdigest()[:16]
            cached = out / "lines" / f"{key}.pcm"
            if cached.is_file():
                data = cached.read_bytes()
                reused += 1
            else:
                if client is None:
                    client = _client()
                data = _tts(client, model, voice, speech)
                cached.write_bytes(data)
                new_seconds += len(data) / 2 / RATE
            start = len(pcm) / 2 / RATE
            pcm += data
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


def _client():
    import openai
    return openai.OpenAI()


def _tts(client, model: str, voice: str, text: str) -> bytes:
    import openai
    try:
        resp = client.audio.speech.create(model=model, voice=voice, input=text,
                                          instructions=VOICE_STYLE, response_format="pcm")
        return resp.read()
    except openai.RateLimitError as e:
        raise PipelineError("PROVIDER_RATE_LIMIT", "음성 서비스 요청이 많습니다. 잠시 후 다시 시도해 주세요.", True) from e
    except openai.APITimeoutError as e:
        raise PipelineError("PROVIDER_TIMEOUT", "음성 서비스 응답이 늦습니다. 다시 시도해 주세요.", True) from e
    except (openai.APIStatusError, openai.APIConnectionError) as e:
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
