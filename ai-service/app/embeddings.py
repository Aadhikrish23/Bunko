"""Local text embeddings. Runs inside this service: semantic search never sends
anyone's notes to a third party (docs/AI_DATA_POLICY.md)."""

from __future__ import annotations

from functools import lru_cache
from typing import Protocol

from .config import get_settings

# Must match the vector(384) column in the AiEmbedding migration.
DIMENSIONS = 384


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class FastEmbedder:
    def __init__(self, model_name: str) -> None:
        # Imported lazily: loading the ONNX model is slow and only needed
        # once something is actually embedded.
        from fastembed import TextEmbedding

        self._model = TextEmbedding(model_name=model_name)

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [vector.tolist() for vector in self._model.embed(texts)]


@lru_cache
def get_embedder() -> Embedder:
    return FastEmbedder(get_settings().embedding_model)
