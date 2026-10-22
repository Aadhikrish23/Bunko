"""Postgres access. Every query here is scoped to one user id passed in by the
Express API, which has already authenticated that user (ARCHITECTURE.md §8)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import get_settings


@lru_cache
def get_pool() -> ConnectionPool:
    return ConnectionPool(get_settings().database_url, min_size=1, max_size=5, open=True)


@contextmanager
def connection() -> Iterator[Connection]:
    with get_pool().connection() as conn:
        conn.row_factory = dict_row
        yield conn


def vector_literal(values: list[float]) -> str:
    """pgvector's text input format: '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{value:.7g}" for value in values) + "]"
