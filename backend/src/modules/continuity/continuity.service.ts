import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { ensureIndexed } from '../reader/reader.service';
import type { ChapterGraph } from '../reader/chapter-graph';
import { upsertCanonicalPosition } from './canonical-position';
import { runMappingAlgorithm } from './mapping-algorithm';
import type { CorrectPositionInput } from './continuity.schema';

export interface ResolvedPositionDto {
  structuralId: string | null;
  chapterLabel: string | null;
  confidence: number;
  requiresConfirmation: boolean;
}

// Implements the mapping algorithm end-to-end (SRS §11.7-11.9): loads the
// journey's canonical position, ensures the target edition is indexed,
// and applies the priority-ordered mapping. Read-only — it never writes
// the canonical position itself; confirming or correcting the result is
// POST /reading-journeys/:id/position (T-037), which both "confirm this"
// and "no, actually here" funnel through.
export async function resolvePosition(
  userId: string,
  journeyId: string,
  targetEditionId: string,
): Promise<ResolvedPositionDto> {
  const journey = await prisma.readingJourney.findFirst({
    where: { id: journeyId, userId },
    include: { canonicalPosition: true },
  });
  if (!journey) {
    throw new AppError('NOT_FOUND', 'Reading journey not found');
  }

  const targetEdition = await prisma.edition.findFirst({
    where: { id: targetEditionId, workId: journey.workId },
  });
  if (!targetEdition) {
    throw new AppError('NOT_FOUND', 'Target edition not found for this work');
  }

  const source = journey.canonicalPosition;
  if (!source) {
    // Nothing recorded yet for this work — no mapping to attempt; the
    // reader simply starts from the beginning, no prompt needed.
    return { structuralId: null, chapterLabel: null, confidence: 0, requiresConfirmation: false };
  }

  let chapterGraph = targetEdition.chapterGraph as ChapterGraph | null;
  if (!chapterGraph) {
    const copy = await prisma.copy.findFirst({
      where: { editionId: targetEditionId, userId },
      include: { digitalFile: true },
    });
    if (copy?.digitalFile) {
      chapterGraph = await ensureIndexed(targetEdition, copy.digitalFile);
    }
  }

  if (!chapterGraph) {
    // Target isn't indexed yet (no digital copy owned, or not yet
    // opened) — can't compute a real mapping; ask rather than guess.
    return { structuralId: null, chapterLabel: null, confidence: 0, requiresConfirmation: true };
  }

  const result = runMappingAlgorithm(source, chapterGraph);

  return {
    structuralId: result.unit?.structuralId ?? null,
    chapterLabel: result.unit?.label ?? null,
    confidence: result.confidence,
    // Below-threshold confidence must not auto-navigate (T-034) — the
    // frontend confirmation prompt (T-036) is gated on this flag exactly.
    requiresConfirmation: result.confidence < env.MAPPING_CONFIDENCE_THRESHOLD,
  };
}

// The user confirming a resolved candidate ("Continue here?" -> yes) and
// the user correcting a wrong one (SRS §11.5) are the same operation:
// telling Bunko the definitive canonical position now. Scoped to the
// caller's own journey — a correction never affects another user's
// mapping for the same editions (T-037).
export async function correctPosition(userId: string, journeyId: string, input: CorrectPositionInput): Promise<void> {
  const journey = await prisma.readingJourney.findFirst({ where: { id: journeyId, userId } });
  if (!journey) {
    throw new AppError('NOT_FOUND', 'Reading journey not found');
  }

  await upsertCanonicalPosition(journeyId, {
    structuralId: input.structuralId ?? null,
    chapterLabel: input.chapterLabel ?? null,
    textAnchor: null,
    pageNumber: input.pageNumber ?? null,
    confidence: 1.0, // user-confirmed/corrected positions are treated as ground truth
  });
}
