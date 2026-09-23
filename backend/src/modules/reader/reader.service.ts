import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma } from '../../config/prisma';
import { s3Client, S3_BUCKET } from '../../config/s3';
import { AppError } from '../../lib/app-error';
import { logger } from '../../lib/logger';
import { runMappingAlgorithm } from '../continuity/mapping-algorithm';
import * as sessionsService from '../reading-sessions/reading-sessions.service';
import type { ChapterGraph } from './chapter-graph';
import { indexEpub } from './epub-indexer';
import { enqueueOcrBackfill } from './ocr-backfill.worker';
import { indexPdf } from './pdf-indexer';

const FILE_URL_EXPIRY_SECONDS = 3600;

export interface ReaderManifestDto {
  fileUrl: string;
  format: 'EPUB' | 'PDF';
  startPosition: string | null;
  confidence: number | null;
  sessionId: string;
}

export interface ChapterDto {
  structuralId: string;
  label: string;
  order: number;
  pageNumber: number | null;
  text: string;
}

export interface ChaptersResponseDto {
  format: 'EPUB' | 'PDF';
  hasTextLayer: boolean;
  chapters: ChapterDto[];
}

export async function ensureIndexed(
  edition: { id: string; format: string; chapterGraph: unknown },
  digitalFile: { storageKey: string },
): Promise<ChapterGraph> {
  if (edition.chapterGraph) {
    return edition.chapterGraph as ChapterGraph;
  }

  const object = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: digitalFile.storageKey }));
  if (!object.Body) {
    throw new AppError('UNSUPPORTED_FILE', 'Digital file is empty');
  }
  const buffer = Buffer.from(await object.Body.transformToByteArray());

  const chapterGraph = edition.format === 'EPUB' ? indexEpub(buffer) : await indexPdf(buffer);
  await prisma.edition.update({ where: { id: edition.id }, data: { chapterGraph: chapterGraph as object } });

  // T-037a: a scanned PDF gets this fast, empty-text graph immediately
  // (SRS §38.2 graceful degradation) — OCR to backfill real text runs
  // separately in the background rather than blocking this response,
  // since it can take minutes for a real book. The next read of this
  // edition picks up the enriched graph once the job completes.
  if (edition.format === 'PDF' && !chapterGraph.hasTextLayer) {
    enqueueOcrBackfill(edition.id).catch((err) => {
      logger.warn({ err, editionId: edition.id }, 'Failed to enqueue OCR backfill');
    });
  }

  return chapterGraph;
}

// Resolution order: (1) resume where a previous session on this exact
// edition left off (confidence 1.0, no ambiguity); (2) fall back to the
// journey's canonical position mapped through the continuity engine
// (Phase 5, SRS §11.7) — but ONLY an exact structural-ID match, the one
// method that's fully trusted (see continuity.service.ts's
// requiresConfirmation for the full reasoning: title/anchor/proportional
// matches always need a human "yes"). Any candidate weaker than that is
// deliberately NOT returned here — this endpoint has no way to ask the
// user first, so it only ever hands back a startPosition safe to
// silently jump to. A less-certain candidate is instead available via
// the explicit POST /reading-journeys/:id/resolve-position (T-035),
// which the frontend confirmation prompt (T-036) uses *before* opening
// the reader.
async function resolveStartPosition(
  userId: string,
  edition: { id: string; workId: string; chapterGraph: unknown },
): Promise<{ startPosition: string | null; confidence: number | null }> {
  const lastSession = await prisma.readingSession.findFirst({
    where: { userId, copy: { editionId: edition.id } },
    orderBy: { updatedAt: 'desc' },
  });
  if (lastSession) {
    const position = lastSession.endPosition ?? lastSession.startPosition;
    if (position) {
      return { startPosition: position, confidence: 1.0 };
    }
  }

  const journey = await prisma.readingJourney.findUnique({
    where: { userId_workId: { userId, workId: edition.workId } },
    include: { canonicalPosition: true },
  });
  const source = journey?.canonicalPosition;
  const chapterGraph = edition.chapterGraph as ChapterGraph | null;
  if (!source || !chapterGraph) {
    return { startPosition: null, confidence: null };
  }

  const result = runMappingAlgorithm(source, chapterGraph);
  if (result.unit && result.method === 'structural') {
    return { startPosition: result.unit.structuralId, confidence: result.confidence };
  }
  return { startPosition: null, confidence: null };
}

// Resolves the signed file URL, the last saved position for this user,
// and auto-starts a reading session (SRS §12.8 step 2) — the request
// flow documented in ARCHITECTURE.md §4.
export async function getReaderManifest(userId: string, editionId: string): Promise<ReaderManifestDto> {
  const copy = await prisma.copy.findFirst({
    where: { editionId, userId },
    include: { edition: true, digitalFile: true },
    orderBy: { acquiredAt: 'desc' },
  });
  if (!copy || !copy.digitalFile) {
    throw new AppError('NOT_FOUND', 'No digital copy of this edition in your library');
  }
  if (copy.edition.format === 'PHYSICAL') {
    throw new AppError('VALIDATION_ERROR', 'This edition is physical and has no reader manifest');
  }

  const chapterGraph = await ensureIndexed(copy.edition, copy.digitalFile);

  const { startPosition, confidence } = await resolveStartPosition(userId, {
    ...copy.edition,
    chapterGraph,
  });

  const fileUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: copy.digitalFile.storageKey }),
    { expiresIn: FILE_URL_EXPIRY_SECONDS },
  );

  const session = await sessionsService.startSession(userId, { copyId: copy.id, startPosition });

  return {
    fileUrl,
    format: copy.edition.format as 'EPUB' | 'PDF',
    startPosition,
    confidence,
    sessionId: session.id,
  };
}

// Chapter text for the flow-reader UI and future chapter-level AI
// features — reuses the same chapterGraph the continuity engine indexes
// at import time (SRS §11.6) rather than a separate extraction path.
// Ownership-scoped the same way as the reader manifest above: the caller
// must hold a copy of this edition.
export async function getChapters(userId: string, editionId: string): Promise<ChaptersResponseDto> {
  const copy = await prisma.copy.findFirst({
    where: { editionId, userId },
    include: { edition: true, digitalFile: true },
    orderBy: { acquiredAt: 'desc' },
  });
  if (!copy || !copy.digitalFile) {
    throw new AppError('NOT_FOUND', 'No digital copy of this edition in your library');
  }
  if (copy.edition.format === 'PHYSICAL') {
    throw new AppError('VALIDATION_ERROR', 'This edition is physical and has no chapters');
  }

  const chapterGraph = await ensureIndexed(copy.edition, copy.digitalFile);

  return {
    format: chapterGraph.format,
    hasTextLayer: chapterGraph.hasTextLayer,
    chapters: chapterGraph.units.map((unit) => ({
      structuralId: unit.structuralId,
      label: unit.label,
      order: unit.order,
      pageNumber: unit.pageNumber,
      text: unit.text,
    })),
  };
}
