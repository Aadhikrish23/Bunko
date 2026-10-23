import { prisma } from '../../config/prisma';
import { toAnnotationDto, type AnnotationDto } from '../annotations/annotations.service';
import { toNoteDto, type NoteDto } from '../notes/notes.service';
import type { SessionDto } from '../reading-sessions/reading-sessions.service';
import type { ListJournalQuery } from './journal.schema';
import { chapterLabels, positionLabel } from '../reader/position-labels';

export { positionLabel };

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
