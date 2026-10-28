"""NVIDIA NIM access for generated insights (T-106, T-107).

Only the minimum excerpts each feature needs are sent, and only for users
who opted into generated insights — enforced by the Express API before any
request reaches this service (docs/AI_DATA_POLICY.md). Mirrors the request
shape already proven by the Express API's own NVIDIA client
(backend/src/modules/assistant/clients/NvidiaNimClient.ts): the
`chat_template_kwargs`/`reasoning_effort` fields that keep hybrid-reasoning
models from burning their token budget on invisible "thinking" before ever
emitting an answer."""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from typing import Any

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

# Bounded so a slow call can't outlast the Express API's own 120s wait.
JSON_READ_TIMEOUT = 50.0
# Chapter translation segments are longer and get more room.
TEXT_READ_TIMEOUT = 110.0

_JSON_INSTRUCTIONS = (
    "\n\nRespond with nothing but a single JSON object matching this JSON Schema exactly "
    "(every property required, no extra properties, no markdown code fence, no commentary "
    "before or after it):\n{schema}"
)
_JSON_RETRY_INSTRUCTION = (
    "That reply was not valid JSON matching the schema. Respond again with nothing but the "
    "JSON object -- no markdown fence, no commentary."
)


class LlmUnavailable(Exception):
    """No API key configured — generated features are off on this server."""


class LlmDeclined(Exception):
    """The model declined the request (content filter / refusal)."""


class LlmFailed(Exception):
    """The provider errored, timed out, or returned something unusable."""


class _TryNextModel(Exception):
    """Internal signal: this model failed in a way another model might not."""


class Llm:
    def __init__(self, client: httpx.Client | None, models: list[str]) -> None:
        self._client = client
        self._models = list(models)
        # The primary model's name, used for display (e.g. a translation's
        # stored `model` field) -- not necessarily which model answered.
        self.model = self._models[0] if self._models else ""

    @property
    def available(self) -> bool:
        return self._client is not None

    def generate_json(self, *, system: str, prompt: str, schema: dict[str, Any], max_tokens: int = 16_000) -> dict[str, Any]:
        client = self._require_client()
        full_system = system + _JSON_INSTRUCTIONS.format(schema=json.dumps(schema))
        messages = [{"role": "system", "content": full_system}, {"role": "user", "content": prompt}]
        text = self._complete(client, messages, max_tokens, JSON_READ_TIMEOUT)
        parsed = _try_parse_json(text)
        if parsed is not None:
            return parsed
        # One retry: the model's own prior (invalid) reply plus a correction,
        # same shape as the backend's planner retry for malformed JSON.
        messages += [{"role": "assistant", "content": text}, {"role": "user", "content": _JSON_RETRY_INSTRUCTION}]
        text = self._complete(client, messages, max_tokens, JSON_READ_TIMEOUT)
        parsed = _try_parse_json(text)
        if parsed is None:
            raise LlmFailed("The response was not valid JSON")
        return parsed

    def generate_text(self, *, system: str, prompt: str, max_tokens: int = 32_000) -> str:
        """Long plain-text output (chapter translation, T-107)."""
        client = self._require_client()
        messages = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
        return self._complete(client, messages, max_tokens, TEXT_READ_TIMEOUT)

    def _complete(self, client: httpx.Client, messages: list[dict[str, str]], max_tokens: int, timeout: float) -> str:
        # Each hosted model is independently available on NVIDIA's shared endpoint
        # (one can 404 "not found for account" while another answers fine), so a
        # per-model failure tries the next one -- same intent as the Express API's
        # own NvidiaNimClient, simplified for this service's much lower traffic
        # (no persistent unhealthy-model cooldown).
        last_error: Exception | None = None
        for model in self._models:
            try:
                return self._complete_one(client, model, messages, max_tokens, timeout)
            except _TryNextModel as err:
                last_error = err.__cause__ or err
                logger.debug("NVIDIA NIM model %s failed (%s); trying the next model.", model, err)
        if isinstance(last_error, (LlmFailed, LlmDeclined)):
            raise last_error
        raise LlmFailed("NVIDIA NIM request failed") from last_error

    def _complete_one(self, client: httpx.Client, model: str, messages: list[dict[str, str]], max_tokens: int, timeout: float) -> str:
        try:
            response = client.post(
                "/chat/completions",
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": 0,
                    "max_tokens": max_tokens,
                    "stream": False,
                    # See NvidiaNimClient.ts: stops Nemotron/gpt-oss hybrid-reasoning
                    # models from spending the whole budget "thinking" before replying.
                    "chat_template_kwargs": {"thinking": False},
                    "reasoning_effort": "medium",
                },
                timeout=timeout,
            )
        except httpx.TimeoutException as err:
            raise _TryNextModel() from LlmFailed("The AI provider could not be reached in time")
        except httpx.TransportError as err:
            raise _TryNextModel() from LlmFailed("The AI provider could not be reached")

        if response.status_code in (401, 403, 429):
            # A bad key or rate limit applies to every model on this account --
            # don't hammer the others with the same doomed request.
            message = "The AI provider rejected this server's API key" if response.status_code != 429 else "The AI provider is busy right now"
            raise LlmFailed(message)
        if response.status_code >= 400:
            logger.warning("NVIDIA NIM error %s for %s: %s", response.status_code, model, response.text[:500])
            raise _TryNextModel() from LlmFailed("The AI provider returned an error")

        body = response.json()
        choice = (body.get("choices") or [{}])[0]
        finish_reason = choice.get("finish_reason")
        if finish_reason == "content_filter":
            raise LlmDeclined()
        if finish_reason == "length":
            raise LlmFailed("The response was cut off")
        text = ((choice.get("message") or {}).get("content") or "").strip()
        if not text:
            raise _TryNextModel() from LlmFailed("The response had no content")
        return text

    def _require_client(self) -> httpx.Client:
        if self._client is None:
            raise LlmUnavailable()
        return self._client


def _try_parse_json(text: str) -> dict[str, Any] | None:
    # Models sometimes wrap JSON in a markdown fence despite instructions not to.
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


@lru_cache
def get_llm() -> Llm:
    settings = get_settings()
    models = [settings.nvidia_model, *settings.nvidia_fallback_models]
    # Dedupe while preserving order, in case the primary is repeated in the fallback list.
    models = list(dict.fromkeys(models))
    if not settings.nvidia_api_key:
        return Llm(None, models)
    client = httpx.Client(
        base_url=settings.nvidia_base_url,
        headers={"Authorization": f"Bearer {settings.nvidia_api_key}", "Content-Type": "application/json"},
    )
    return Llm(client, models)
