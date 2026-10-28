"""Settings, read once from the environment (ARCHITECTURE.md §8)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    # The ai-service's own least-privilege role (scripts/create_ai_role.sql),
    # never the Express API's credentials.
    database_url: str
    # Shared secret the Express API sends as X-Internal-Token.
    internal_token: str
    # Optional: without it, semantic search still works and generated
    # features report themselves unavailable.
    nvidia_api_key: str | None
    nvidia_model: str
    nvidia_fallback_models: tuple[str, ...]
    nvidia_base_url: str
    embedding_model: str


@lru_cache
def get_settings() -> Settings:
    token = os.environ.get("AI_SERVICE_TOKEN", "")
    if len(token) < 16:
        raise RuntimeError("AI_SERVICE_TOKEN must be set (16+ characters) and match the API's value")
    database_url = os.environ.get("AI_DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("AI_DATABASE_URL must be set")
    return Settings(
        database_url=database_url,
        internal_token=token,
        nvidia_api_key=os.environ.get("NVIDIA_API_KEY") or None,
        # `or default`, not `.get(key, default)` -- docker-compose.yml's
        # `${VAR:-}` passes these in as an empty string (not an absent key)
        # whenever the host doesn't set them, and .get()'s default only
        # kicks in for an absent key, so an empty string would otherwise
        # silently defeat every one of these defaults (observed live: an
        # unset NVIDIA_BASE_URL reached httpx.Client as "", raising
        # UnsupportedProtocol on every request).
        nvidia_model=os.environ.get("NVIDIA_MODEL") or "nvidia/nemotron-3-super-120b-a12b",
        # Tried in order after the primary model, same list the Express API's own
        # NVIDIA client falls back to (backend/src/modules/assistant/config/AIConfig.ts) --
        # a model can 404 ("not found for account") or sit unhealthy independently of
        # the others on NVIDIA's shared endpoint.
        nvidia_fallback_models=tuple(
            m.strip()
            for m in (os.environ.get("NVIDIA_FALLBACK_MODELS") or "openai/gpt-oss-20b").split(",")
            if m.strip()
        ),
        nvidia_base_url=os.environ.get("NVIDIA_BASE_URL") or "https://integrate.api.nvidia.com/v1",
        embedding_model=os.environ.get("EMBEDDING_MODEL") or "BAAI/bge-small-en-v1.5",
    )
