"""크레딧 소진 판별 테스트. SDK 오류 객체를 직접 만들어 쓴다(유료 호출 없음)."""

import unittest
from unittest import mock

import anthropic
import httpx
import openai

from pipeline import audio
from pipeline.errors import PipelineError, raise_if_no_credit


def _resp(status):
    return httpx.Response(status, request=httpx.Request("POST", "https://example.invalid"))


def _tts_error(err):
    client = mock.MagicMock()
    client.audio.speech.create.side_effect = err
    try:
        audio._tts(client, "m", "v", "문장")
    except PipelineError as e:
        return e
    raise AssertionError("PipelineError가 나와야 한다")


class NoCreditTests(unittest.TestCase):
    def test_openai_quota_is_no_credit(self):
        msg = "Error code: 429 - {'error': {'message': 'You exceeded your current quota', 'type': 'insufficient_quota'}}"
        e = _tts_error(openai.RateLimitError(msg, response=_resp(429), body=None))
        self.assertEqual((e.code, e.retryable), ("PROVIDER_NO_CREDIT", False))

    def test_plain_rate_limit_stays_retryable(self):
        e = _tts_error(openai.RateLimitError("Error code: 429 - Rate limit reached", response=_resp(429), body=None))
        self.assertEqual((e.code, e.retryable), ("PROVIDER_RATE_LIMIT", True))

    def test_anthropic_low_balance_is_no_credit(self):
        msg = "Error code: 400 - {'error': {'type': 'invalid_request_error', 'message': 'Your credit balance is too low'}}"
        with self.assertRaises(PipelineError) as cm:
            raise_if_no_credit(anthropic.BadRequestError(msg, response=_resp(400), body=None))
        self.assertEqual(cm.exception.code, "PROVIDER_NO_CREDIT")


if __name__ == "__main__":
    unittest.main()
