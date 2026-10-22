"""Claude API access for generated insights (T-082-T-085).

Only the minimum excerpts each feature needs are sent, and only for users
who opted into generated insights — enforced by the Express API before any
request reaches this service (docs/AI_DATA_POLICY.md)."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from typing import Any

import anthropic

from .config import get_settings

logger = logging.getLogger(__name__)

# Server-side fallback routes a declined request to Anthropic's
# recommended substitute model by refusal category, instead of failing.
FALLBACK_BETA = "server-side-fallback-2026-07-01"

# Streaming read timeout for long text output: a gap this long between
# events means the connection has stalled.
TEXT_READ_TIMEOUT = 120.0


class LlmUnavailable(Exception):
    """No API key configured — generated features are off on this server."""


class LlmDeclined(Exception):
    """The model (and its fallback) declined the request."""


class LlmFailed(Exception):
    """The provider errored, timed out, or returned something unusable."""


class Llm:
    def __init__(self, client: anthropic.Anthropic | None, model: str) -> None:
        self._client = client
        self.model = model

    @property
    def available(self) -> bool:
        return self._client is not None

    def generate_json(self, *, system: str, prompt: str, schema: dict[str, Any], max_tokens: int = 16_000) -> dict[str, Any]:
        client = self._require_client()
        with _provider_errors():
            response = client.beta.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                betas=[FALLBACK_BETA],
                system=system,
                messages=[{"role": "user", "content": prompt}],
                # Claude Opus 5.5's thinking is always on; effort is the dial.
                # Structured outputs guarantee the reply parses as `schema`.
                output_config={"effort": "medium", "format": {"type": "json_schema", "schema": schema}},
                fallbacks="default",
            )
        text = _final_text(response)
        try:
            return json.loads(text)
        except json.JSONDecodeError as err:
            raise LlmFailed("The response was not valid JSON") from err

    def generate_text(self, *, system: str, prompt: str, max_tokens: int = 32_000) -> str:
        """Long plain-text output (chapter translation, T-089). Streamed, so a
        long reply isn't cut off by a request timeout; the per-read timeout
        still bounds a stalled connection."""
        client = self._require_client()
        with _provider_errors():
            with client.with_options(timeout=TEXT_READ_TIMEOUT).beta.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                betas=[FALLBACK_BETA],
                system=system,
                messages=[{"role": "user", "content": prompt}],
                output_config={"effort": "medium"},
                fallbacks="default",
            ) as stream:
                response = stream.get_final_message()
        return _final_text(response)

    def _require_client(self) -> anthropic.Anthropic:
        if self._client is None:
            raise LlmUnavailable()
        return self._client


@contextmanager
def _provider_errors() -> Iterator[None]:
    try:
        yield
    except anthropic.RateLimitError as err:
        raise LlmFailed("The AI provider is busy right now") from err
    except anthropic.APIStatusError as err:
        logger.warning("Claude API error %s (request %s)", err.status_code, getattr(err, "request_id", None))
        raise LlmFailed("The AI provider returned an error") from err
    except anthropic.APIConnectionError as err:  # includes timeouts
        raise LlmFailed("The AI provider could not be reached") from err


def _final_text(response: Any) -> str:
    if response.stop_reason == "refusal":
        raise LlmDeclined()
    if response.stop_reason == "max_tokens":
        raise LlmFailed("The response was cut off")
    text = "".join(block.text for block in response.content if block.type == "text")
    if not text:
        raise LlmFailed("The response had no content")
    return text


@lru_cache
def get_llm() -> Llm:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return Llm(None, settings.claude_model)
    # Bounded so a slow call can't outlast the Express API's own 120s wait:
    # 50s x (1 try + 1 retry) = 100s at most.
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=50.0, max_retries=1)
    return Llm(client, settings.claude_model)
