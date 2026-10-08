import { prisma } from '../../config/prisma';
import { toAnnotationDto, type AnnotationDto } from '../annotations/annotations.service';
import { toNoteDto, type NoteDto } from '../notes/notes.service';
import type { SessionDto } from '../reading-sessions/reading-sessions.service';
import type { ListJournalQuery } from './journal.schema';

export interface JournalEntryDto extends SessionDto {
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
      orderBy: { startTime: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.readingSession.count({ where }),
  ]);

  const sessionIds = rows.map((row) => row.id);
  const [annotationRows, noteRows] = await Promise.all([
    sessionIds.length
      ? prisma.annotation.findMany({ where: { userId, sessionId: { in: sessionIds } } })
      : Promise.resolve([]),
    sessionIds.length
      ? prisma.note.findMany({ where: { userId, sessionId: { in: sessionIds } } })
      : Promise.resolve([]),
  ]);

  const items = rows.map((row) => ({
    ...toSessionDto(row),
    annotations: annotationRows.filter((a) => a.sessionId === row.id).map(toAnnotationDto),
    notes: noteRows.filter((n) => n.sessionId === row.id).map(toNoteDto),
  }));

  return { items, total };
}
