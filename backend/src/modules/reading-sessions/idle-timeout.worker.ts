import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../../lib/queue';
import { logger } from '../../lib/logger';
import { runIdleTimeoutSweep } from './idle-timeout.job';

const QUEUE_NAME = 'session-idle-timeout-sweep';
const SWEEP_INTERVAL_MS = 60_000;

export const idleTimeoutQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

export function startIdleTimeoutWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runIdleTimeoutSweep();
    },
    { connection: redisConnection },
  );
  worker.on('failed', (job, err) => {
    logger.warn({ jobId: job?.id, err }, 'idle-timeout sweep job failed');
  });
  return worker;
}

// Call once at process startup (server.ts). Repeatable jobs are
// idempotent to re-add (same jobId), so this is safe across restarts.
export async function scheduleIdleTimeoutSweep(): Promise<void> {
  await idleTimeoutQueue.add('sweep', {}, { repeat: { every: SWEEP_INTERVAL_MS }, jobId: 'sweep-repeatable' });
}
