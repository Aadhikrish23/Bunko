"""The per-user embedding index (T-080): one row per highlight/quote, note, and
review. Indexing is incremental — only content whose hash changed is
re-embedded, and rows whose source is gone are dropped."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from .db import connection, vector_literal
from .embeddings import Embedder

# Embedding models truncate long input anyway; this keeps one very long
# note from dominating a batch.
MAX_CONTENT_CHARS = 4_000
BATCH_SIZE = 64


@dataclass(frozen=True)
class Source:
    source_type: str  # ANNOTATION | NOTE | REVIEW
    source_id: str
    work_id: str
    content: str

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.content.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class IndexPlan:
    upsert: list[Source]
    delete: list[tuple[str, str]]  # (source_type, source_id)


def plan_index(sources: list[Source], existing: dict[tuple[str, str], str]) -> IndexPlan:
    """What to (re-)embed and what to drop, given the current content and the
    hashes already indexed for it."""
    current = {(s.source_type, s.source_id): s for s in sources if s.content.strip()}
    upsert = [s for key, s in current.items() if existing.get(key) != s.content_hash]
    delete = [key for key in existing if key not in current]
    return IndexPlan(upsert=upsert, delete=delete)


SOURCES_SQL = """
SELECT 'ANNOTATION' AS source_type, a.id AS source_id, e."workId" AS work_id,
       a.text || coalesce(E'\\n(My note: ' || a.note || ')', '') AS content
FROM "Annotation" a
JOIN "Copy" c ON c.id = a."copyId"
JOIN "Edition" e ON e.id = c."editionId"
WHERE a."userId" = %(user_id)s
UNION ALL
SELECT 'NOTE', n.id, n."workId", n.body FROM "Note" n WHERE n."userId" = %(user_id)s
UNION ALL
SELECT 'REVIEW', r.id, r."workId", r.body FROM "Review" r
WHERE r."userId" = %(user_id)s AND r.body IS NOT NULL
"""


def index_user(user_id: str, embedder: Embedder) -> dict[str, int]:
    with connection() as conn:
        sources = [
            Source(row["source_type"], row["source_id"], row["work_id"], row["content"][:MAX_CONTENT_CHARS])
            for row in conn.execute(SOURCES_SQL, {"user_id": user_id})
        ]
        existing = {
            (row["sourceType"], row["sourceId"]): row["contentHash"]
            for row in conn.execute(
                'SELECT "sourceType", "sourceId", "contentHash" FROM "AiEmbedding" WHERE "userId" = %s', (user_id,)
            )
        }
        plan = plan_index(sources, existing)

        for start in range(0, len(plan.upsert), BATCH_SIZE):
            batch = plan.upsert[start : start + BATCH_SIZE]
            vectors = embedder.embed([s.content for s in batch])
            for source, vector in zip(batch, vectors):
                conn.execute(
                    """
                    INSERT INTO "AiEmbedding"
                      (id, "userId", "sourceType", "sourceId", "workId", content, "contentHash", embedding, "updatedAt")
                    VALUES (gen_random_uuid()::text, %s, %s::"AiSourceType", %s, %s, %s, %s, %s::vector, now())
                    ON CONFLICT ("sourceType", "sourceId") DO UPDATE SET
                      "workId" = EXCLUDED."workId", content = EXCLUDED.content,
                      "contentHash" = EXCLUDED."contentHash", embedding = EXCLUDED.embedding, "updatedAt" = now()
                    WHERE "AiEmbedding"."userId" = EXCLUDED."userId"
                    """,
                    (
                        user_id,
                        source.source_type,
                        source.source_id,
                        source.work_id,
                        source.content,
                        source.content_hash,
                        vector_literal(vector),
                    ),
                )
            conn.commit()

        for source_type, source_id in plan.delete:
            conn.execute(
                'DELETE FROM "AiEmbedding" WHERE "userId" = %s AND "sourceType" = %s::"AiSourceType" AND "sourceId" = %s',
                (user_id, source_type, source_id),
            )
        conn.commit()
    return {"indexed": len(plan.upsert), "removed": len(plan.delete)}
