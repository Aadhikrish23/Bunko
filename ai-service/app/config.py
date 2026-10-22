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
    anthropic_api_key: str | None
    claude_model: str
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
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY") or None,
        claude_model=os.environ.get("CLAUDE_MODEL", "claude-opus-5-5"),
        embedding_model=os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5"),
    )
