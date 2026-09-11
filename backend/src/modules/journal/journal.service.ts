import { prisma } from '../../config/prisma';
import type { SessionDto } from '../reading-sessions/reading-sessions.service';
import type { ListJournalQuery } from './journal.schema';

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
export async function listJournal(
  userId: string,
  query: ListJournalQuery,
): Promise<{ items: SessionDto[]; total: number }> {
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

  return { items: rows.map(toSessionDto), total };
}
