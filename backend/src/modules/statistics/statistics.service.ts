import { prisma } from '../../config/prisma';

export interface BasicStatistics {
  booksCompleted: number;
  totalMinutesRead: number;
  currentStreakDays: number;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Consecutive-day streak ending today or yesterday — a day with no
// session yet doesn't break the streak until that day is fully over.
function computeCurrentStreak(sessionStartTimes: Date[], now: Date): number {
  if (sessionStartTimes.length === 0) {
    return 0;
  }

  const uniqueDays = new Set(sessionStartTimes.map(toDateKey));
  const cursor = new Date(now);

  if (!uniqueDays.has(toDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!uniqueDays.has(toDateKey(cursor))) {
      return 0;
    }
  }

  let streak = 0;
  while (uniqueDays.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Minimum baseline only (T-023) — full stats/trends dashboard is Phase 7
// (SRS §19, docs/TASKS.md T-023 note).
export async function getBasicStatistics(userId: string, now: Date = new Date()): Promise<BasicStatistics> {
  const [booksCompleted, sessions] = await Promise.all([
    prisma.userWork.count({ where: { userId, status: 'FINISHED' } }),
    prisma.readingSession.findMany({
      where: { userId, status: 'ENDED' },
      select: { durationSeconds: true, startTime: true },
    }),
  ]);

  const totalMinutesRead = Math.round(
    sessions.reduce((sum, session) => sum + (session.durationSeconds ?? 0), 0) / 60,
  );
  const currentStreakDays = computeCurrentStreak(sessions.map((session) => session.startTime), now);

  return { booksCompleted, totalMinutesRead, currentStreakDays };
}
