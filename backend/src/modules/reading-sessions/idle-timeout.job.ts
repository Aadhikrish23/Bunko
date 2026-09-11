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
  const pauseCutoff = new Date(now.getTime() - idleThresholdMs);
  // A session idle long enough that it would already be past the grace
  // window too (measuring from the moment it *would have* been paused,
  // idleThreshold after its last activity) skips the PAUSED
  // intermediate state entirely and ends directly in this same sweep.
  // Without this, updating a row always bumps its @updatedAt column, so
  // pausing it first would erase the very evidence needed to also end
  // it in the same pass — real idle time beyond both thresholds would
  // incorrectly take two separate sweep runs (and real wall-clock time
  // between them) to resolve instead of one.
  const endCutoffFromActive = new Date(now.getTime() - idleThresholdMs - graceWindowMs);

  let pausedCount = 0;
  let endedCount = 0;

  // ACTIVE sessions idle beyond the threshold (no progress update, i.e.
  // no page-turn, which is what bumps `updatedAt`) — SRS §12.8 step 4.
  const idleActiveSessions = await prisma.readingSession.findMany({
    where: { status: 'ACTIVE', updatedAt: { lt: pauseCutoff } },
  });

  for (const session of idleActiveSessions) {
    if (session.updatedAt < endCutoffFromActive) {
      const endTime = new Date(session.updatedAt.getTime() + idleThresholdMs);
      const durationSeconds = Math.max(0, Math.round((endTime.getTime() - session.startTime.getTime()) / 1000));
      await prisma.readingSession.update({
        where: { id: session.id },
        data: { status: 'ENDED', endTime, durationSeconds },
      });
      endedCount += 1;
    } else {
      await prisma.readingSession.update({ where: { id: session.id }, data: { status: 'PAUSED' } });
      pausedCount += 1;
    }
  }

  // PAUSED sessions from an *earlier* sweep, now also beyond the grace
  // window — SRS §12.8 step 5, so idle time isn't counted as reading
  // time. Duration is computed up to the moment it was paused, not
  // extended by however long it sat waiting for this sweep.
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
    endedCount += 1;
  }

  const result = { pausedCount, endedCount };
  if (result.pausedCount > 0 || result.endedCount > 0) {
    logger.info(result, 'idle-timeout sweep');
  }
  return result;
}
