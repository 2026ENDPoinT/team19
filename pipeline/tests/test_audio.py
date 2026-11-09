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


def fake_tts(client, model, voice, text):
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

    def test_check_captions_mismatch(self):
        errs = audio.check_captions(BP, [{"sceneId": "s1", "lineIndex": 0, "startSec": 0, "endSec": 1}], 1)
        self.assertTrue(errs)


if __name__ == "__main__":
    unittest.main()
