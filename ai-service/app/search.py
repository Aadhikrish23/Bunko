"""Semantic search over one user's own index (T-081)."""

from __future__ import annotations

from typing import TypedDict

from .db import connection, vector_literal
from .embeddings import Embedder


class Excerpt(TypedDict):
    sourceType: str
    sourceId: str
    workId: str
    title: str
    excerpt: str
    score: float


SEARCH_SQL = """
SELECT em."sourceType" AS "sourceType", em."sourceId" AS "sourceId", em."workId" AS "workId",
       w.title, em.content AS excerpt, 1 - (em.embedding <=> %(query)s::vector) AS score
FROM "AiEmbedding" em
JOIN "Work" w ON w.id = em."workId"
WHERE em."userId" = %(user_id)s
ORDER BY em.embedding <=> %(query)s::vector
LIMIT %(limit)s
"""


def search(user_id: str, query: str, limit: int, embedder: Embedder) -> list[Excerpt]:
    vector = vector_literal(embedder.embed([query])[0])
    with connection() as conn:
        rows = conn.execute(SEARCH_SQL, {"user_id": user_id, "query": vector, "limit": limit}).fetchall()
    return [
        Excerpt(
            sourceType=row["sourceType"],
            sourceId=row["sourceId"],
            workId=row["workId"],
            title=row["title"],
            excerpt=row["excerpt"],
            score=round(float(row["score"]), 4),
        )
        for row in rows
    ]
