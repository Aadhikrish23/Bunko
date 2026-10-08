import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export interface SearchResultDto {
  type: 'ANNOTATION' | 'NOTE';
  id: string;
  workId: string;
  editionId: string | null;
  excerpt: string;
  createdAt: Date;
}

interface AnnotationSearchRow {
  id: string;
  text: string;
  note: string | null;
  createdAt: Date;
  editionId: string;
  workId: string;
}

interface NoteSearchRow {
  id: string;
  body: string;
  createdAt: Date;
  workId: string;
  copyEditionId: string | null;
}

// Postgres full-text search (SRS §13, scoped per T-045 — relevance
// ranking is explicitly not required, just correctness and per-user
// isolation; semantic/pgvector search is Phase 10, not this). Computed
// on-the-fly via to_tsvector rather than a stored generated column +
// GIN index — fine at MVP data volumes, revisit if search gets slow.
const RESULT_LIMIT = 50;

export async function searchAnnotationsAndNotes(userId: string, q: string): Promise<SearchResultDto[]> {
  const [annotationRows, noteRows] = await Promise.all([
    prisma.$queryRaw<AnnotationSearchRow[]>(Prisma.sql`
      SELECT a.id, a.text, a.note, a."createdAt", c."editionId" AS "editionId", e."workId" AS "workId"
      FROM "Annotation" a
      JOIN "Copy" c ON c.id = a."copyId"
      JOIN "Edition" e ON e.id = c."editionId"
      WHERE a."userId" = ${userId}
        AND to_tsvector('english', a.text || ' ' || coalesce(a.note, '')) @@ plainto_tsquery('english', ${q})
      ORDER BY a."createdAt" DESC
      LIMIT ${RESULT_LIMIT}
    `),
    prisma.$queryRaw<NoteSearchRow[]>(Prisma.sql`
      SELECT n.id, n.body, n."createdAt", n."workId" AS "workId", c."editionId" AS "copyEditionId"
      FROM "Note" n
      LEFT JOIN "Copy" c ON c.id = n."copyId"
      WHERE n."userId" = ${userId}
        AND to_tsvector('english', n.body) @@ plainto_tsquery('english', ${q})
      ORDER BY n."createdAt" DESC
      LIMIT ${RESULT_LIMIT}
    `),
  ]);

  const results: SearchResultDto[] = [
    ...annotationRows.map((row) => ({
      type: 'ANNOTATION' as const,
      id: row.id,
      workId: row.workId,
      editionId: row.editionId,
      excerpt: row.note ? `${row.text} — ${row.note}` : row.text,
      createdAt: row.createdAt,
    })),
    ...noteRows.map((row) => ({
      type: 'NOTE' as const,
      id: row.id,
      workId: row.workId,
      editionId: row.copyEditionId,
      excerpt: row.body,
      createdAt: row.createdAt,
    })),
  ];

  results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return results.slice(0, RESULT_LIMIT);
}
