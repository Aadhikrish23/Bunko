import { Queue, Worker } from 'bullmq';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { logger } from '../../lib/logger';
import { createWorkerConnection, redisConnection } from '../../lib/queue';
import type { ChapterGraph } from '../reader/chapter-graph';
import { callAi } from './ai-client';
import { hashChapterText } from './chapter-hash';
import { joinSegments, segmentText } from './segment-text';
import { languageName } from './translation-languages';

// Translates one chapter segment by segment through ai-service (T-090).
// Runs in the background because a long chapter takes minutes; the reader
// polls the translation's progress.

const QUEUE_NAME = 'chapter-translation';

// One segment is up to ~6,000 characters of output, streamed by ai-service.
const SEGMENT_TIMEOUT_MS = 300_000;

interface TranslationJobData {
  translationId: string;
  sourceHash: string;
}

export const translationQueue = new Queue<TranslationJobData>(QUEUE_NAME, { connection: redisConnection });

// Every write is conditional on the row still being this run's pending
// translation: a revoke (row deleted) or a newer request (new hash) makes
// the count 0, and the run stops.
async function updateIfCurrent(
  translationId: string,
  sourceHash: string,
  data: Parameters<typeof prisma.chapterTranslation.updateMany>[0]['data'],
): Promise<boolean> {
  const { count } = await prisma.chapterTranslation.updateMany({
    where: { id: translationId, sourceHash, status: 'PENDING' },
    data,
  });
  return count > 0;
}

export async function runTranslation({ translationId, sourceHash }: TranslationJobData): Promise<void> {
  const row = await prisma.chapterTranslation.findUnique({
    where: { id: translationId },
    include: { edition: { select: { chapterGraph: true } } },
  });
  if (!row || row.status !== 'PENDING' || row.sourceHash !== sourceHash) return;

  const graph = row.edition.chapterGraph as ChapterGraph | null;
  const unit = graph?.units.find((candidate) => candidate.structuralId === row.structuralId);
  if (!unit || hashChapterText(unit.text) !== sourceHash) {
    await updateIfCurrent(translationId, sourceHash, {
      status: 'FAILED',
      error: 'The chapter’s text changed before it could be translated. Try again.',
    });
    return;
  }

  const segments = segmentText(unit.text);
  const language = languageName(row.targetLanguage);
  const translated: string[] = [];
  try {
    for (const [index, segment] of segments.entries()) {
      // Consent can be revoked mid-chapter: stop before sending more text.
      const consent = await prisma.aiConsent.findUnique({ where: { userId: row.userId } });
      if (!consent?.translation) return;

      const result = await callAi<{ text: string; model: string }>(
        'POST',
        '/internal/translate',
        { userId: row.userId, text: segment.text, targetLanguage: language },
        SEGMENT_TIMEOUT_MS,
      );
      translated.push(result.text);
      const current = await updateIfCurrent(translationId, sourceHash, { segmentsDone: index + 1, model: result.model });
      if (!current) return;
    }
    await updateIfCurrent(translationId, sourceHash, { status: 'READY', text: joinSegments(translated, segments) });
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'The translation could not be completed.';
    if (!(err instanceof AppError)) logger.error({ err, translationId }, 'Chapter translation failed');
    await updateIfCurrent(translationId, sourceHash, { status: 'FAILED', error: message });
  }
}

export function startTranslationWorker(): Worker<TranslationJobData> {
  const worker = new Worker<TranslationJobData>(QUEUE_NAME, async (job) => runTranslation(job.data), {
    connection: createWorkerConnection(),
    concurrency: 2,
  });
  worker.on('failed', (job, err) => {
    logger.warn({ jobId: job?.id, translationId: job?.data.translationId, err }, 'Translation job failed');
  });
  return worker;
}

// Keyed by translation and source text, so a double-click doesn't queue the
// same work twice; removed when done so a retry after a failure can run.
export async function enqueueTranslation(translationId: string, sourceHash: string): Promise<void> {
  await translationQueue.add(
    'translate-chapter',
    { translationId, sourceHash },
    { jobId: `translate-${translationId}-${sourceHash.slice(0, 16)}`, removeOnComplete: true, removeOnFail: true },
  );
}
