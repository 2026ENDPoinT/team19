"""음성 말투 지시 비교 실험 (유료, 문장 수 × 지시 수만큼 TTS 호출).

같은 문장을 말투 지시만 바꿔 만들고 wav로 저장한다. 사람이 들어서 비교한다.
문장은 코드 숫자 변환(korean_numbers)을 거친 뒤 보낸다. 실제 make_audio와 같다.

    py sandbox/ai/tts_style_test.py 출력폴더
"""
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

from pipeline import costlog  # noqa: E402
from pipeline.audio import DEFAULT_MODEL, DEFAULT_VOICE, RATE, USD_PER_MINUTE, VOICE_STYLE, _client, _tts  # noqa: E402
from pipeline.korean_numbers import spoken_text  # noqa: E402

SENTENCES = [
    "실제 비용이 드는 줄은 5번 합병뿐이고, 빅오 n이에요.",
    "그러면 B에서 다음 선수 2가 나와요.",
    "14가 이겨서 C에 써요.",
    "위 줄이 A, 아랫줄이 B예요. 둘 다 정렬돼 있어요.",
    "마지막으로 의사코드에서 비용이 드는 줄을 찾아봐요.",
]

OLD_NUMBERS = next(line for line in VOICE_STYLE.splitlines() if line.startswith("Numbers:"))
STYLES = {
    "a-current": VOICE_STYLE,
    "b-as-written": VOICE_STYLE.replace(
        OLD_NUMBERS,
        "Numbers: Numbers are already written out in Hangul. Read every word exactly as written. "
        "Never change a number word into a different form or a different number."),
    "c-no-numbers": "\n".join(l for l in VOICE_STYLE.splitlines() if not l.startswith("Numbers:")),
}


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    load_dotenv(ROOT / ".env")
    client = _client()
    seconds = 0.0
    for name, style in STYLES.items():
        for i, text in enumerate(SENTENCES, 1):
            speech = spoken_text(text)
            import pipeline.audio as audio
            audio.VOICE_STYLE = style          # _tts가 읽는 지시를 바꾼다
            data = _tts(client, DEFAULT_MODEL, DEFAULT_VOICE, speech)
            seconds += len(data) / 2 / RATE
            path = out / f"{i}-{name}.wav"
            with wave.open(str(path), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(RATE)
                w.writeframes(data)
            print(path.name, "|", speech)
    cost = round(seconds / 60 * USD_PER_MINUTE, 4)
    costlog.append("audio", out.as_posix(), [{"provider": "openai", "model": DEFAULT_MODEL, "voice": DEFAULT_VOICE,
                                              "newAudioSec": round(seconds, 1), "costUsd": cost, "costIsEstimate": True}],
                   note="말투 지시 비교 실험")
    print(f"{seconds:.1f}초, 약 ${cost}")


if __name__ == "__main__":
    main()
