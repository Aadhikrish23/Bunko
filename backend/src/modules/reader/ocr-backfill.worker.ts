import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../../lib/queue';
import { logger } from '../../lib/logger';
import { runOcrBackfill } from './ocr-backfill.job';

const QUEUE_NAME = 'pdf-ocr-backfill';

interface OcrBackfillJobData {
  editionId: string;
}

export const ocrBackfillQueue = new Queue<OcrBackfillJobData>(QUEUE_NAME, { connection: redisConnection });

export function startOcrBackfillWorker(): Worker<OcrBackfillJobData> {
  const worker = new Worker<OcrBackfillJobData>(
    QUEUE_NAME,
    async (job) => {
      await runOcrBackfill(job.data.editionId);
    },
    { connection: redisConnection, concurrency: 1 }, // OCR is CPU-heavy — one at a time
  );
  worker.on('failed', (job, err) => {
    logger.warn({ jobId: job?.id, editionId: job?.data.editionId, err }, 'OCR backfill job failed');
  });
  return worker;
}

// jobId keyed by edition, not a fresh id per call, so re-triggering
// (e.g. the same scanned edition opened again before OCR finishes)
// de-duplicates for free rather than queuing redundant OCR runs.
export async function enqueueOcrBackfill(editionId: string): Promise<void> {
  await ocrBackfillQueue.add('ocr-backfill', { editionId }, { jobId: `ocr-backfill-${editionId}` });
}
