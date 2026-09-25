import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createWorker } from 'tesseract.js';
import { s3Client, S3_BUCKET } from '../../config/s3';
import { prisma } from '../../config/prisma';
import { logger } from '../../lib/logger';
import type { ChapterGraph } from './chapter-graph';
import { resolveOcrLanguage } from './ocr-language';
import { indexPdf } from './pdf-indexer';

// T-037a: backfills real chapter text for a scanned PDF (no native
// text layer) via OCR, run as a background job rather than inline in
// the request/response cycle — OCR-ing every page of a real book can
// take minutes, which has no place blocking an HTTP request. Runs
// after the fast (OCR-free) indexPdf() has already given the edition
// a working, if empty-text, chapterGraph — SRS §38.2's graceful
// degradation is still the state a reader sees until (or if) this
// completes.
//
// Deliberately does not touch what the reader displays: only
// Edition.chapterGraph's text/textAnchors are updated. The scanned
// page image stays what PdfReader renders either way (T-026/T-029
// untouched by this).
export async function runOcrBackfill(editionId: string): Promise<void> {
  const edition = await prisma.edition.findUnique({
    where: { id: editionId },
    include: {
      copies: { where: { digitalFileId: { not: null } }, include: { digitalFile: true }, take: 1 },
      work: true,
    },
  });
  if (!edition || edition.format !== 'PDF') return;

  const existingGraph = edition.chapterGraph as ChapterGraph | null;
  // Already has real text (a re-trigger raced with a completed run, or
  // this edition's PDF turned out not to need OCR after all) — never
  // attempt OCR on a PDF that already has a text layer (T-037a).
  if (existingGraph?.hasTextLayer) return;

  const digitalFile = edition.copies[0]?.digitalFile;
  if (!digitalFile) return;

  const object = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: digitalFile.storageKey }));
  if (!object.Body) return;
  const buffer = Buffer.from(await object.Body.transformToByteArray());

  // Edition.language is the more specific signal (the same Work can have
  // editions in different languages); Work.language/originalLanguage are
  // the fallback when an edition wasn't tagged individually. All three
  // are free-text display names ("Tamil"), not ISO codes — resolveOcrLanguage
  // does that translation for Tesseract's benefit.
  const ocrLanguage = resolveOcrLanguage(edition.language, edition.work?.language, edition.work?.originalLanguage);
  const ocrWorker = await createWorker(ocrLanguage);

  try {
    const graph = await indexPdf(buffer, { ocrWorker });
    await prisma.edition.update({ where: { id: editionId }, data: { chapterGraph: graph as object } });
    const unitsWithText = graph.units.filter((u) => u.text.length > 0).length;
    logger.info({ editionId, ocrLanguage, totalUnits: graph.units.length, unitsWithText }, 'OCR backfill complete');
  } finally {
    await ocrWorker.terminate();
  }
}
