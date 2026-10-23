import { prisma } from '../../config/prisma';
import { toAnnotationDto, type AnnotationDto } from '../annotations/annotations.service';
import { toNoteDto, type NoteDto } from '../notes/notes.service';
import type { SessionDto } from '../reading-sessions/reading-sessions.service';
import type { ListJournalQuery } from './journal.schema';

export interface JournalEntryDto extends SessionDto {
  /** Which book the session was with, so an entry can say so and link to it. */
  book: { workId: string; title: string; coverImageUrl: string | null; format: string };
  /** Where the session started and stopped, in words ("The Last Lantern", "p. 112"); null when unknown. */
  startLabel: string | null;
  endLabel: string | null;
  annotations: AnnotationDto[];
  notes: NoteDto[];
}

function toSessionDto(session: {
  id: string;
  status: string;
  startTime: Date;
  endTime: Date | null;
  durationSeconds: number | null;
  startPosition: string | null;
  endPosition: string | null;
  reflection: string | null;
}): SessionDto {
  return {
    id: session.id,
    status: session.status,
    startTime: session.startTime,
    endTime: session.endTime,
    durationSeconds: session.durationSeconds,
    startPosition: session.startPosition,
    endPosition: session.endPosition,
    reflection: session.reflection,
  };
}

interface UnitLabel {
  editionId: string;
  structuralId: string;
  label: string;
  order: number;
}

// Only the chapter labels -- the stored graph also carries every chapter's full text.
async function chapterLabels(editionIds: string[]): Promise<Map<string, UnitLabel[]>> {
  const byEdition = new Map<string, UnitLabel[]>();
  if (editionIds.length === 0) return byEdition;
  const rows = await prisma.$queryRaw<UnitLabel[]>`
    SELECT e.id AS "editionId", u->>'structuralId' AS "structuralId", u->>'label' AS "label", (u->>'order')::int AS "order"
    FROM "Edition" e, jsonb_array_elements(e."chapterGraph"->'units') u
    WHERE e.id = ANY(${editionIds}::text[]) AND jsonb_typeof(e."chapterGraph"->'units') = 'array'`;
  for (const row of rows) byEdition.set(row.editionId, [...(byEdition.get(row.editionId) ?? []), row]);
  return byEdition;
}

/**
 * A stored position in words. Physical positions are already what the reader typed; PDF
 * positions are page numbers; the flow reader stores a chapter's structuralId and the EPUB
 * view a CFI, whose first step after /6/ is the spine item (2 = first).
 */
export function positionLabel(position: string | null, format: string, units: UnitLabel[]): string | null {
  if (!position) return null;
  if (format === 'PHYSICAL') return position;
  if (/^\d+$/.test(position)) return `p. ${position}`;
  const cfi = /^epubcfi\(\/6\/(\d+)/.exec(position);
  const unit = cfi
    ? units.find((u) => u.order === Number(cfi[1]) / 2 - 1)
    : units.find((u) => u.structuralId === position);
  return unit?.label ?? null;
}

// The Journal shows completed reading activity (SRS §12.5) — ended
// sessions only; Active/Paused sessions aren't history yet. Multiple
// sessions for the same book on the same day are kept as separate
// entries, never merged (SRS §12.11) — this is simply never done here.
//
// T-049: each entry also carries the annotations/notes made *during*
// that session (linked via sessionId at creation time — see
// annotations.service.ts / notes.service.ts) so the journal reads as a
// record of what was actually captured while reading, not just
// start/end timestamps.
export async function listJournal(
  userId: string,
  query: ListJournalQuery,
): Promise<{ items: JournalEntryDto[]; total: number }> {
  const where = {
    userId,
    status: 'ENDED' as const,
    ...(query.workId ? { journey: { workId: query.workId } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.readingSession.findMany({
      where,
      // Most recently finished first: a session logged after the fact ends "now" even
      // though it started long ago.
      orderBy: [{ endTime: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        copy: {
          select: {
            edition: {
              select: { id: true, format: true, workId: true, work: { select: { title: true, coverImageUrl: true } } },
            },
          },
        },
      },
    }),
    prisma.readingSession.count({ where }),
  ]);

  const sessionIds = rows.map((row) => row.id);
  const digitalEditions = [...new Set(rows.filter((r) => r.copy.edition.format !== 'PHYSICAL').map((r) => r.copy.edition.id))];
  const [annotationRows, noteRows, labels] = await Promise.all([
    sessionIds.length
      ? prisma.annotation.findMany({ where: { userId, sessionId: { in: sessionIds } } })
      : Promise.resolve([]),
    sessionIds.length
      ? prisma.note.findMany({ where: { userId, sessionId: { in: sessionIds } } })
      : Promise.resolve([]),
    chapterLabels(digitalEditions),
  ]);

  const items = rows.map((row) => {
    const { format, id: editionId } = row.copy.edition;
    const units = labels.get(editionId) ?? [];
    return {
    ...toSessionDto(row),
    book: {
      workId: row.copy.edition.workId,
      title: row.copy.edition.work.title,
      coverImageUrl: row.copy.edition.work.coverImageUrl,
      format,
    },
    startLabel: positionLabel(row.startPosition, format, units),
    endLabel: positionLabel(row.endPosition, format, units),
    annotations: annotationRows.filter((a) => a.sessionId === row.id).map(toAnnotationDto),
    notes: noteRows.filter((n) => n.sessionId === row.id).map(toNoteDto),
    };
  });

  return { items, total };
}
