"""페이지 해설·분할 계획이 함께 쓰는 모델 호출. JSON 한 덩어리를 받아 dict로 돌려준다.

설계도(blueprint.py)는 아직 자체 호출 코드를 쓴다. 가격표는 blueprint.PRICES 하나만 둔다.
"""

from __future__ import annotations

import base64
import json
import re
import time
from pathlib import Path

from pipeline.blueprint import CLAUDE_CACHE_READ, PRICES
from pipeline.errors import PipelineError, raise_if_no_credit

TIMEOUT_SEC = 120     # 호출 한 번의 시간 제한. 순간 오류는 SDK가 2번까지 다시 시도한다(contracts/pipeline.md).


def call_json(model: str, system: str, text: str, images: list[str] | None = None,
              max_tokens: int = 16000) -> tuple[dict, dict]:
    """system + (그림들 + text)를 보내고 (JSON dict, usage)를 돌려준다. 그림은 PNG 경로."""
    if model not in PRICES:
        raise ValueError(f"모르는 모델: {model}")
    t0 = time.monotonic()
    fn = _claude if model.startswith("claude") else _openai
    raw, usage = fn(model, system, text, images or [], max_tokens)
    usage["seconds"] = round(time.monotonic() - t0, 1)
    try:
        return parse_json(raw), usage
    except ValueError as e:
        raise PipelineError("PROVIDER_ERROR", "AI 응답을 읽지 못했습니다. 다시 시도해 주세요.", True) from e


def parse_json(raw: str) -> dict:
    text = raw.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("JSON 객체가 없음")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError as e:
        raise ValueError(str(e)) from e


def _b64(path: str) -> str:
    return base64.b64encode(Path(path).read_bytes()).decode("ascii")


def _claude(model, system, text, images, max_tokens):
    import anthropic

    client = anthropic.Anthropic(timeout=TIMEOUT_SEC)
    content = [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": _b64(p)}} for p in images]
    content.append({"type": "text", "text": text})
    try:
        msg = client.messages.create(
            model=model, max_tokens=max_tokens,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.RateLimitError as e:
        raise_if_no_credit(e)
        raise PipelineError("PROVIDER_RATE_LIMIT", "AI 서비스 요청이 많습니다. 잠시 후 다시 시도해 주세요.", True) from e
    except anthropic.APITimeoutError as e:
        raise PipelineError("PROVIDER_TIMEOUT", "AI 서비스 응답이 늦습니다. 다시 시도해 주세요.", True) from e
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
        raise_if_no_credit(e)
        raise PipelineError("PROVIDER_ERROR", "AI 서비스 오류가 났습니다. 다시 시도해 주세요.", True) from e
    if msg.stop_reason == "refusal":
        raise PipelineError("PROVIDER_REFUSED", "AI가 이 자료의 처리를 거절했습니다.", False)
    u = msg.usage
    cache_read = getattr(u, "cache_read_input_tokens", 0) or 0
    cache_write = getattr(u, "cache_creation_input_tokens", 0) or 0
    pin, pout = PRICES[model]
    cost = (u.input_tokens * pin + cache_write * pin * 1.25 + cache_read * CLAUDE_CACHE_READ[model]
            + u.output_tokens * pout) / 1e6
    raw = "".join(b.text for b in msg.content if b.type == "text")
    return raw, {"provider": "anthropic", "model": msg.model, "inputTokens": u.input_tokens + cache_read + cache_write,
                 "cacheReadTokens": cache_read, "outputTokens": u.output_tokens, "costUsd": round(cost, 4),
                 "stopReason": msg.stop_reason}


def _openai(model, system, text, images, max_tokens):
    import openai

    client = openai.OpenAI(timeout=TIMEOUT_SEC)
    content = [{"type": "input_image", "image_url": f"data:image/png;base64,{_b64(p)}"} for p in images]
    content.append({"type": "input_text", "text": text})
    try:
        resp = client.responses.create(
            model=model, instructions=system,
            input=[{"role": "user", "content": content}],
            max_output_tokens=max_tokens,
            text={"format": {"type": "json_object"}},
        )
    except openai.RateLimitError as e:
        raise_if_no_credit(e)
        raise PipelineError("PROVIDER_RATE_LIMIT", "AI 서비스 요청이 많습니다. 잠시 후 다시 시도해 주세요.", True) from e
    except openai.APITimeoutError as e:
        raise PipelineError("PROVIDER_TIMEOUT", "AI 서비스 응답이 늦습니다. 다시 시도해 주세요.", True) from e
    except (openai.APIStatusError, openai.APIConnectionError) as e:
        raise_if_no_credit(e)
        raise PipelineError("PROVIDER_ERROR", "AI 서비스 오류가 났습니다. 다시 시도해 주세요.", True) from e
    u = resp.usage
    pin, pout = PRICES[model]
    cost = (u.input_tokens * pin + u.output_tokens * pout) / 1e6
    return resp.output_text, {"provider": "openai", "model": resp.model, "inputTokens": u.input_tokens,
                              "outputTokens": u.output_tokens, "costUsd": round(cost, 4),
                              "stopReason": resp.status}
