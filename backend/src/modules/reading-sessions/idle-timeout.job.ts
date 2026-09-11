import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { logger } from '../../lib/logger';

export interface IdleTimeoutSweepResult {
  pausedCount: number;
  endedCount: number;
}

// Pure sweep logic, decoupled from the BullMQ scheduling wrapper
// (idle-timeout.worker.ts) so it can be tested with an injected `now`
// rather than real sleeps (T-020 acceptance criteria).
export async function runIdleTimeoutSweep(now: Date = new Date()): Promise<IdleTimeoutSweepResult> {
  const idleThresholdMs = env.SESSION_IDLE_TIMEOUT_MINUTES * 60_000;
  const graceWindowMs = env.SESSION_GRACE_WINDOW_MINUTES * 60_000;

  // ACTIVE sessions idle beyond the threshold (no progress update, i.e. no
  // page-turn, which is what bumps `updatedAt`) -> PAUSED (SRS §12.8 step 4).
  const idleActiveSessions = await prisma.readingSession.findMany({
    where: { status: 'ACTIVE', updatedAt: { lt: new Date(now.getTime() - idleThresholdMs) } },
  });
  if (idleActiveSessions.length > 0) {
    await prisma.readingSession.updateMany({
      where: { id: { in: idleActiveSessions.map((session) => session.id) } },
      data: { status: 'PAUSED' },
    });
  }

  // PAUSED sessions beyond the grace window -> ENDED, so idle time isn't
  // counted as reading time (SRS §12.8 step 5). Duration is computed up to
  // the moment it was paused, not extended by the sweep's own delay.
  const stalePausedSessions = await prisma.readingSession.findMany({
    where: { status: 'PAUSED', updatedAt: { lt: new Date(now.getTime() - graceWindowMs) } },
  });
  for (const session of stalePausedSessions) {
    const durationSeconds = Math.max(
      0,
      Math.round((session.updatedAt.getTime() - session.startTime.getTime()) / 1000),
    );
    await prisma.readingSession.update({
      where: { id: session.id },
      data: { status: 'ENDED', endTime: session.updatedAt, durationSeconds },
    });
  }

  const result = { pausedCount: idleActiveSessions.length, endedCount: stalePausedSessions.length };
  if (result.pausedCount > 0 || result.endedCount > 0) {
    logger.info(result, 'idle-timeout sweep');
  }
  return result;
}
