"""음성 생성 테스트. TTS는 가짜로 바꿔서 유료 호출을 하지 않는다."""

import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

from pipeline import audio

BP = {"scenes": [
    {"id": "s1", "lines": ["첫 문장", "둘째 문장"]},
    {"id": "s2", "lines": ["셋째 문장"]},
]}


def fake_tts(client, model, voice, text, style=None):
    return b"\x01\x00" * audio.RATE  # 1초짜리


class AudioTests(unittest.TestCase):
    def test_timing_gaps_and_reuse(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(audio, "_tts", side_effect=fake_tts) as tts, \
                mock.patch.object(audio, "_client", return_value=object()):
            r = audio.make_audio(BP, tmp, fmt="wav")
            c = r["captions"]
            self.assertEqual([(x["sceneId"], x["lineIndex"]) for x in c], [("s1", 0), ("s1", 1), ("s2", 0)])
            self.assertEqual((c[0]["startSec"], c[0]["endSec"]), (0.0, 1.0))
            self.assertEqual((c[1]["startSec"], c[1]["endSec"]), (1.3, 2.3))   # 문장 사이 0.3초
            self.assertEqual((c[2]["startSec"], c[2]["endSec"]), (2.9, 3.9))   # 장면 사이 0.6초
            self.assertEqual(r["durationSec"], 3.9)
            with wave.open(r["audioPath"]) as w:
                self.assertAlmostEqual(w.getnframes() / w.getframerate(), 3.9, places=2)
            self.assertEqual(tts.call_count, 3)

            r2 = audio.make_audio(BP, tmp)          # 두 번째는 저장된 문장 음성을 재사용, mp3로
            self.assertEqual(tts.call_count, 3)
            self.assertTrue(r2["audioPath"].endswith("audio.mp3"))
            self.assertGreater(Path(r2["audioPath"]).stat().st_size, 1000)
            self.assertEqual(r2["usage"][0]["reusedLines"], 3)
            self.assertEqual(r2["usage"][0]["costUsd"], 0)

    def test_parallel_keeps_order_and_dedupes(self):
        bp = {"scenes": [{"id": "s1", "lines": ["가", "가나다", "가"]}]}   # 길이가 다른 음성이 동시에 와도 순서대로 이어야 한다
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(audio, "_tts", side_effect=lambda c, m, v, t, s=None: b"\x01\x00" * (audio.RATE * len(t))) as tts, \
                mock.patch.object(audio, "_client", return_value=object()):
            c = audio.make_audio(bp, tmp, fmt="wav")["captions"]
            self.assertEqual([(x["startSec"], x["endSec"]) for x in c], [(0.0, 1.0), (1.3, 4.3), (4.6, 5.6)])
            self.assertEqual(tts.call_count, 2)                         # 같은 문장은 한 번만

    def test_level_trims_and_evens_loudness(self):
        quiet_tone = (b"\x00\x00" * (audio.RATE // 2)) + (b"\xe8\x03" * audio.RATE) + (b"\x00\x00" * (audio.RATE // 2))  # 1000, 앞뒤 0.5초 무음
        out = audio.level(quiet_tone)
        self.assertAlmostEqual(len(out) / 2 / audio.RATE, 1.1, places=2)          # 앞뒤 0.05초만 남김
        self.assertEqual(max(out[i] | out[i + 1] << 8 for i in range(0, len(out), 2) if out[i + 1] < 128), 1800)  # 크기 키움(상한 1.8배)

    def test_split_scene_uses_longest_pauses(self):
        tone, gap = b"\xe8\x03" * audio.RATE, lambda s: b"\x00\x00" * int(audio.RATE * s)
        pcm = tone + gap(0.2) + tone + gap(0.6) + tone + gap(0.6) + tone       # 첫 0.2초는 쉼표 쉼
        parts = audio.split_scene(pcm, ["가나다라마바", "사아자", "차카타"])
        self.assertEqual([round(len(p) / 2 / audio.RATE, 1) for p in parts], [2.2, 1.0, 1.0])
        self.assertIsNone(audio.split_scene(tone, ["가", "나"]))               # 쉼이 없으면 실패 → 문장별로

    def test_scene_unit_falls_back_per_line(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(audio, "_tts", side_effect=fake_tts) as tts, \
                mock.patch.object(audio, "_client", return_value=object()):
            r = audio.make_audio(BP, tmp, fmt="wav", unit="scene")              # 가짜 음성엔 쉼이 없어 자르기 실패
            self.assertEqual(len(r["captions"]), 3)
            self.assertEqual(tts.call_count, 1 + 3)                             # 장면 1번 + 문장 3번

    def test_check_captions_mismatch(self):
        errs = audio.check_captions(BP, [{"sceneId": "s1", "lineIndex": 0, "startSec": 0, "endSec": 1}], 1)
        self.assertTrue(errs)


if __name__ == "__main__":
    unittest.main()
