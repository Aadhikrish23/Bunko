import type { ChapterTranslation } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { redisConnection } from '../../lib/queue';
import type { ChapterGraph } from '../reader/chapter-graph';
import { ensureIndexed } from '../reader/reader.service';
import { availability, requireConsent } from './ai.service';
import { hashChapterText } from './chapter-hash';
import { segmentText } from './segment-text';
import { enqueueTranslation } from './translation.worker';

// Chapter translation (SRS §20.5, T-090). Each translation belongs to the
// user who asked for it and is never served to anyone else, even for the
// same edition (§25.4: no redistribution).

// Long enough for any normal novel chapter; a PDF with no outline is one
// "chapter" for the whole book and is refused rather than half-translated.
export const MAX_TRANSLATABLE_CHARS = 120_000;

export interface ChapterTranslationDto {
  id: string;
  structuralId: string;
  targetLanguage: string;
  status: ChapterTranslation['status'];
  segmentsDone: number;
  segmentsTotal: number;
  // Only once READY.
  text: string | null;
  error: string | null;
  // The chapter's text has changed since this was made (re-extraction).
  stale: boolean;
  model: string | null;
  updatedAt: string;
  generated: true;
}

function toDto(row: ChapterTranslation, currentHash: string | undefined): ChapterTranslationDto {
  return {
    id: row.id,
    structuralId: row.structuralId,
    targetLanguage: row.targetLanguage,
    status: row.status,
    segmentsDone: row.segmentsDone,
    segmentsTotal: row.segmentsTotal,
    text: row.status === 'READY' ? row.text : null,
    error: row.error,
    stale: currentHash !== undefined && currentHash !== row.sourceHash,
    model: row.model,
    updatedAt: row.updatedAt.toISOString(),
    generated: true,
  };
}

// Same scoping as GET /editions/:id/chapters: the caller must hold a
// digital copy of this edition.
async function ownedDigitalCopy(userId: string, editionId: string) {
  const copy = await prisma.copy.findFirst({
    where: { editionId, userId },
    include: { edition: true, digitalFile: true },
    orderBy: { acquiredAt: 'desc' },
  });
  if (!copy || !copy.digitalFile) {
    throw new AppError('NOT_FOUND', 'No digital copy of this edition in your library');
  }
  if (copy.edition.format === 'PHYSICAL') {
    throw new AppError('VALIDATION_ERROR', 'A physical edition has no chapter text to translate');
  }
  return { edition: copy.edition, digitalFile: copy.digitalFile };
}

// Characters of book text sent for translation are budgeted per user per
// day; charged when a translation is requested, because that's when the
// cost is committed.
async function chargeBudget(userId: string, chars: number): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `ai:translation-chars:${userId}:${day}`;
  const used = await redisConnection.incrby(key, chars);
  if (used === chars) await redisConnection.expire(key, 2 * 86_400);
  if (used > env.AI_DAILY_TRANSLATION_CHARS) {
    await redisConnection.decrby(key, chars);
    const left = Math.max(0, env.AI_DAILY_TRANSLATION_CHARS - (used - chars));
    throw new AppError(
      'RATE_LIMITED',
      `This chapter needs ${chars.toLocaleString('en')} characters of today’s translation allowance, and ${left.toLocaleString('en')} are left. Try again tomorrow.`,
    );
  }
}

export async function requestTranslation(
  userId: string,
  editionId: string,
  structuralId: string,
  targetLanguage: string,
): Promise<ChapterTranslationDto> {
  await requireConsent(userId, 'translation');

  const { edition, digitalFile } = await ownedDigitalCopy(userId, editionId);
  const graph = await ensureIndexed(edition, digitalFile);
  const unit = graph.units.find((candidate) => candidate.structuralId === structuralId);
  if (!unit) throw new AppError('NOT_FOUND', 'Chapter not found in this edition');

  const text = unit.text.trim();
  if (text.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'This chapter has no text to translate yet');
  }
  if (text.length > MAX_TRANSLATABLE_CHARS) {
    throw new AppError(
      'VALIDATION_ERROR',
      `This chapter is too long to translate (${text.length.toLocaleString('en')} characters; the limit is ${MAX_TRANSLATABLE_CHARS.toLocaleString('en')}).`,
    );
  }

  const sourceHash = hashChapterText(text);
  const key = { userId, editionId, structuralId, targetLanguage };
  const existing = await prisma.chapterTranslation.findUnique({
    where: { userId_editionId_structuralId_targetLanguage: key },
  });
  // Already done (or underway) for this exact text: no new charge, no new job.
  if (existing && existing.sourceHash === sourceHash && existing.status !== 'FAILED') {
    // Re-queueing a pending one is a no-op while its job exists (same job
    // id), and recovers it if the job was lost (e.g. Redis was flushed).
    if (existing.status === 'PENDING') await enqueueTranslation(existing.id, sourceHash);
    return toDto(existing, sourceHash);
  }

  if (!(await availability()).translation) {
    throw new AppError('AI_UNAVAILABLE', 'Translation isn’t set up on this server');
  }

  await chargeBudget(userId, text.length);
  const fresh = {
    sourceHash,
    charCount: text.length,
    status: 'PENDING' as const,
    segmentsDone: 0,
    segmentsTotal: segmentText(text).length,
    text: '',
    error: null,
    model: null,
  };
  const row = await prisma.chapterTranslation.upsert({
    where: { userId_editionId_structuralId_targetLanguage: key },
    create: { ...key, ...fresh },
    update: fresh,
  });
  await enqueueTranslation(row.id, sourceHash);
  return toDto(row, sourceHash);
}

export async function listTranslations(
  userId: string,
  editionId: string,
  targetLanguage?: string,
): Promise<ChapterTranslationDto[]> {
  const rows = await prisma.chapterTranslation.findMany({
    where: { userId, editionId, ...(targetLanguage ? { targetLanguage } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  if (rows.length === 0) return [];

  // Staleness is checked against the stored graph as it is; listing never
  // triggers a re-index.
  const edition = await prisma.edition.findUnique({ where: { id: editionId }, select: { chapterGraph: true } });
  const graph = edition?.chapterGraph as ChapterGraph | null;
  const hashes = new Map<string, string>();
  for (const unit of graph?.units ?? []) {
    if (rows.some((row) => row.structuralId === unit.structuralId)) {
      hashes.set(unit.structuralId, hashChapterText(unit.text));
    }
  }
  return rows.map((row) => toDto(row, hashes.get(row.structuralId)));
}
