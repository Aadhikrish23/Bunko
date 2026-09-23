import type { ReadingSession } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { upsertCanonicalPosition } from '../continuity/canonical-position';
import { findUnitByClosestPage, findUnitByStructuralId, type ChapterGraph } from '../reader/chapter-graph';
import type { EndSessionInput, ReportProgressInput, StartSessionInput } from './reading-sessions.schema';

export interface SessionDto {
  id: string;
  status: string;
  startTime: Date;
  endTime: Date | null;
  durationSeconds: number | null;
  startPosition: string | null;
  endPosition: string | null;
  reflection: string | null;
}

function toSessionDto(session: ReadingSession): SessionDto {
  return {
    id: session.id,
    status: session.status,
    startTime: session.startTime,
    endTime: session.endTime,
    durationSeconds: session.durationSeconds,
    startPosition: session.startPosition,
    endPosition: session.endPosition,
    reflection: session.reflection,
  };
}

async function requireOwnSession(userId: string, sessionId: string): Promise<ReadingSession> {
  const session = await prisma.readingSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Reading session not found');
  }
  return session;
}

function isWithinGraceWindow(pausedAt: Date, now: Date): boolean {
  const graceWindowMs = env.SESSION_GRACE_WINDOW_MINUTES * 60_000;
  return now.getTime() - pausedAt.getTime() <= graceWindowMs;
}

// State machine per SRS §12.7: [Not Started] -> [Active] -> [Paused] ->
// [Active] -> [Ended]. Only one ACTIVE session per user at a time.
export async function startSession(userId: string, input: StartSessionInput, now = new Date()): Promise<SessionDto> {
  const activeSession = await prisma.readingSession.findFirst({ where: { userId, status: 'ACTIVE' } });
  if (activeSession) {
    // Reopening the reader for the SAME copy (e.g. a page refresh) isn't
    // "starting a second session" in the sense SRS §12.7 means — just
    // hand back the one already running. A different copy is the real
    // conflict the ticket describes.
    if (activeSession.copyId === input.copyId) {
      return toSessionDto(activeSession);
    }
    throw new AppError('CONFLICT', 'Another session is already active for this user');
  }

  const copy = await prisma.copy.findFirst({
    where: { id: input.copyId, userId },
    include: { edition: true },
  });
  if (!copy) {
    throw new AppError('NOT_FOUND', 'Copy not found in your library');
  }

  // Resume a still-paused session for this exact copy within the grace
  // window (SRS §12.8 step 5) instead of starting a second one. Beyond
  // the window, the idle-timeout sweep (T-020) will have already ended
  // it, so this simply won't find a match.
  const pausedSession = await prisma.readingSession.findFirst({
    where: { userId, copyId: copy.id, status: 'PAUSED' },
    orderBy: { updatedAt: 'desc' },
  });
  if (pausedSession && isWithinGraceWindow(pausedSession.updatedAt, now)) {
    const resumed = await prisma.readingSession.update({
      where: { id: pausedSession.id },
      data: { status: 'ACTIVE' },
    });
    return toSessionDto(resumed);
  }

  const journey = await prisma.readingJourney.upsert({
    where: { userId_workId: { userId, workId: copy.edition.workId } },
    create: { userId, workId: copy.edition.workId },
    update: {},
  });

  const session = await prisma.readingSession.create({
    data: {
      userId,
      journeyId: journey.id,
      copyId: copy.id,
      medium: copy.edition.format,
      status: 'ACTIVE',
      startTime: now,
      startPosition: input.startPosition ?? null,
    },
  });

  return toSessionDto(session);
}

export async function reportProgress(userId: string, sessionId: string, input: ReportProgressInput): Promise<void> {
  const session = await requireOwnSession(userId, sessionId);
  if (session.status !== 'ACTIVE') {
    throw new AppError('CONFLICT', 'Cannot report progress on a session that is not active');
  }
  await prisma.readingSession.update({ where: { id: sessionId }, data: { endPosition: input.position } });
}

export async function pauseSession(userId: string, sessionId: string): Promise<SessionDto> {
  const session = await requireOwnSession(userId, sessionId);
  if (session.status !== 'ACTIVE') {
    throw new AppError('CONFLICT', 'Only an active session can be paused');
  }
  const updated = await prisma.readingSession.update({ where: { id: sessionId }, data: { status: 'PAUSED' } });
  return toSessionDto(updated);
}

export async function pauseActiveSession(userId: string): Promise<SessionDto | null> {
  const activeSession = await prisma.readingSession.findFirst({ where: { userId, status: 'ACTIVE' } });
  if (!activeSession) return null;
  return pauseSession(userId, activeSession.id);
}

export async function endSession(
  userId: string,
  sessionId: string,
  input: EndSessionInput,
  now = new Date(),
): Promise<SessionDto> {
  const session = await requireOwnSession(userId, sessionId);

  if (session.status === 'ENDED') {
    // Idempotent: the same payload replayed returns the existing result
    // rather than an error (docs/API_SPEC.md §6); a materially different
    // payload is a conflict.
    const samePayload =
      (input.endPosition ?? null) === session.endPosition && (input.reflection ?? null) === session.reflection;
    if (samePayload) {
      return toSessionDto(session);
    }
    throw new AppError('CONFLICT', 'Session already ended with different data');
  }

  // Physical sessions require an endPosition before they can end
  // (SRS §12.9 step 4).
  if (session.medium === 'PHYSICAL' && !input.endPosition && !session.endPosition) {
    throw new AppError('VALIDATION_ERROR', 'endPosition is required to end a physical reading session');
  }

  const endTime = now;
  const durationSeconds = Math.max(0, Math.round((endTime.getTime() - session.startTime.getTime()) / 1000));

  const updated = await prisma.readingSession.update({
    where: { id: sessionId },
    data: {
      status: 'ENDED',
      endTime,
      durationSeconds,
      endPosition: input.endPosition ?? session.endPosition,
      reflection: input.reflection ?? session.reflection,
    },
  });

  await updateCanonicalPositionFromSession(updated);

  return toSessionDto(updated);
}

// Keeps the journey's canonical position current automatically as the
// user reads (SRS §6.2 "Automatic Where Possible") — without this, cross-
// edition continuity (Phase 5) would only ever work via the manual
// correction endpoint (T-037), which defeats the point.
async function updateCanonicalPositionFromSession(session: ReadingSession): Promise<void> {
  if (!session.endPosition) return;

  if (session.medium === 'PHYSICAL') {
    // Physical positions are entered as free-text chapter labels
    // (T-039's chapter/page picker) — directly portable as a title-match
    // signal for a digital edition (SRS §11.9 worked example).
    await upsertCanonicalPosition(session.journeyId, {
      structuralId: null,
      chapterLabel: session.endPosition,
      textAnchor: null,
      pageNumber: null,
      confidence: null,
    });
    return;
  }

  // Digital endPosition is that edition's own local structuralId — look
  // up its label/anchor/page so the canonical record carries portable
  // signals too, not just an id meaningful only within this one edition.
  // For PDF, the reported position is always a bare page number
  // (T-029/T-030) — an exact structuralId match covers the no-outline
  // page-fallback case (whose ids ARE bare page numbers); when there's
  // an outline instead, the page falls *under* an outline entry rather
  // than matching one exactly, so falling back to the closest-by-page
  // unit still recovers a real chapterLabel/textAnchor for it.
  const copy = await prisma.copy.findUnique({ where: { id: session.copyId }, include: { edition: true } });
  const chapterGraph = copy?.edition.chapterGraph as ChapterGraph | null;
  let unit = chapterGraph ? findUnitByStructuralId(chapterGraph, session.endPosition) : null;
  if (!unit && chapterGraph && session.medium === 'PDF' && /^\d+$/.test(session.endPosition)) {
    unit = findUnitByClosestPage(chapterGraph, Number(session.endPosition));
  }

  await upsertCanonicalPosition(session.journeyId, {
    structuralId: session.endPosition,
    chapterLabel: unit?.label ?? null,
    textAnchor: unit?.textAnchors[0]?.hash ?? null,
    pageNumber: unit?.pageNumber ?? (session.medium === 'PDF' ? Number(session.endPosition) || null : null),
    confidence: null,
  });
}
