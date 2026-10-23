import type { ReadingSession } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { upsertCanonicalPosition, type CanonicalPositionData } from '../continuity/canonical-position';
import { markReadingIfWanted } from '../library/library.service';
import { findUnitByClosestPage, findUnitByStructuralId, type ChapterGraph } from '../reader/chapter-graph';
import type { EndSessionInput, LogSessionInput, ReportProgressInput, StartSessionInput } from './reading-sessions.schema';

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

/**
 * Reading time only (SRS §12.8): from start to `until`, minus every pause. A session that is
 * paused right now stops counting at the moment it was paused.
 */
export function readingSeconds(
  session: Pick<ReadingSession, 'startTime' | 'status' | 'pausedAt' | 'pausedSeconds'>,
  until: Date,
): number {
  const stop = session.status === 'PAUSED' && session.pausedAt && session.pausedAt < until ? session.pausedAt : until;
  return Math.max(0, Math.round((stop.getTime() - session.startTime.getTime()) / 1000) - session.pausedSeconds);
}

/** Back to ACTIVE, adding the pause that just ended to the paused total. */
async function resume(session: ReadingSession, now: Date): Promise<ReadingSession> {
  const pausedFor = session.pausedAt ? Math.max(0, Math.round((now.getTime() - session.pausedAt.getTime()) / 1000)) : 0;
  return prisma.readingSession.update({
    where: { id: session.id },
    data: { status: 'ACTIVE', pausedAt: null, pausedSeconds: session.pausedSeconds + pausedFor },
  });
}

async function conflictMessage(active: ReadingSession): Promise<string> {
  const copy = await prisma.copy.findUnique({
    where: { id: active.copyId },
    select: { edition: { select: { work: { select: { title: true } } } } },
  });
  const title = copy?.edition.work.title;
  return title
    ? `You're still in a reading session for “${title}”. End or pause it first.`
    : "You're still in another reading session. End or pause it first.";
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
    throw new AppError('CONFLICT', await conflictMessage(activeSession));
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
    return toSessionDto(await resume(pausedSession, now));
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
  await markReadingIfWanted(userId, copy.edition.workId);

  return toSessionDto(session);
}

export async function reportProgress(
  userId: string,
  sessionId: string,
  input: ReportProgressInput,
  now = new Date(),
): Promise<void> {
  let session = await requireOwnSession(userId, sessionId);
  // A page turn in a session the idle sweep paused means the reader is back: resume it
  // (still within the grace window, and only if no other session took over meanwhile).
  if (session.status === 'PAUSED' && isWithinGraceWindow(session.updatedAt, now)) {
    const other = await prisma.readingSession.findFirst({ where: { userId, status: 'ACTIVE' }, select: { id: true } });
    if (!other) session = await resume(session, now);
  }
  if (session.status !== 'ACTIVE') {
    throw new AppError('CONFLICT', 'Cannot report progress on a session that is not active');
  }
  await prisma.readingSession.update({ where: { id: sessionId }, data: { endPosition: input.position } });
}

export async function pauseSession(userId: string, sessionId: string, now = new Date()): Promise<SessionDto> {
  const session = await requireOwnSession(userId, sessionId);
  if (session.status === 'PAUSED') return toSessionDto(session);
  if (session.status !== 'ACTIVE') {
    throw new AppError('CONFLICT', 'Only an active session can be paused');
  }
  const updated = await prisma.readingSession.update({
    where: { id: sessionId },
    data: { status: 'PAUSED', pausedAt: now },
  });
  return toSessionDto(updated);
}

/**
 * Removes a finished session the reader logged by mistake (R3-09). Only ENDED sessions: an
 * open one is closed, not deleted. Highlights and notes made during it stay, unlinked.
 */
export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  const session = await requireOwnSession(userId, sessionId);
  if (session.status !== 'ENDED') {
    throw new AppError('CONFLICT', 'End this reading session before deleting it');
  }
  await prisma.$transaction([
    prisma.annotation.updateMany({ where: { sessionId }, data: { sessionId: null } }),
    prisma.note.updateMany({ where: { sessionId }, data: { sessionId: null } }),
    prisma.readingSession.delete({ where: { id: sessionId } }),
  ]);
}

/**
 * The session still open for a copy (active, or paused within the grace window), so a page
 * can show "in progress" again after a refresh. Null when there isn't one.
 */
export async function getOpenSession(userId: string, copyId: string, now = new Date()): Promise<SessionDto | null> {
  const session = await prisma.readingSession.findFirst({
    where: { userId, copyId, status: { in: ['ACTIVE', 'PAUSED'] } },
    orderBy: { updatedAt: 'desc' },
  });
  if (!session) return null;
  if (session.status === 'PAUSED' && !isWithinGraceWindow(session.updatedAt, now)) return null;
  return toSessionDto(session);
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
  deviceId: string | null = null,
): Promise<SessionDto> {
  const session = await requireOwnSession(userId, sessionId);

  if (session.status === 'ENDED') {
    // Idempotent: the same payload replayed returns the existing result
    // rather than an error (docs/API_SPEC.md §6); a materially different
    // payload is a conflict.
    const samePosition = input.endPosition === undefined || input.endPosition === session.endPosition;
    const samePayload = samePosition && (input.reflection ?? null) === session.reflection;
    if (samePayload) {
      return toSessionDto(session);
    }
    // The reflection asked for after a session ends (SRS §12.10) arrives after the end itself.
    if (samePosition && input.reflection && !session.reflection) {
      return toSessionDto(
        await prisma.readingSession.update({ where: { id: sessionId }, data: { reflection: input.reflection } }),
      );
    }
    throw new AppError('CONFLICT', 'Session already ended with different data');
  }

  // Physical sessions require an endPosition before they can end
  // (SRS §12.9 step 4).
  if (session.medium === 'PHYSICAL' && !input.endPosition && !session.endPosition) {
    throw new AppError('VALIDATION_ERROR', 'endPosition is required to end a physical reading session');
  }

  const endTime = session.status === 'PAUSED' && session.pausedAt ? session.pausedAt : now;
  const durationSeconds = readingSeconds(session, now);

  const updated = await prisma.readingSession.update({
    where: { id: sessionId },
    data: {
      status: 'ENDED',
      endTime,
      durationSeconds,
      pausedAt: null,
      endPosition: input.endPosition ?? session.endPosition,
      reflection: input.reflection ?? session.reflection,
    },
  });

  const position = await canonicalPositionForSession(updated);
  if (position) await upsertCanonicalPosition(updated.journeyId, position, deviceId);

  return toSessionDto(updated);
}

// The canonical position a finished session implies — which endSession
// writes automatically as the user reads (SRS §6.2 "Automatic Where
// Possible"; without it, cross-edition continuity would only ever work
// via the manual correction endpoint, T-037), and which offline sync
// compares against the current one before writing (T-070).
export async function canonicalPositionForSession(
  session: Pick<ReadingSession, 'endPosition' | 'medium' | 'copyId'>,
): Promise<CanonicalPositionData | null> {
  if (!session.endPosition) return null;

  if (session.medium === 'PHYSICAL') {
    // Physical positions are entered as free-text chapter labels
    // (T-039's chapter/page picker) — directly portable as a title-match
    // signal for a digital edition (SRS §11.9 worked example).
    return {
      structuralId: null,
      chapterLabel: session.endPosition,
      textAnchor: null,
      pageNumber: null,
      confidence: null,
    };
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

  return {
    structuralId: session.endPosition,
    chapterLabel: unit?.label ?? null,
    textAnchor: unit?.textAnchors[0]?.hash ?? null,
    pageNumber: unit?.pageNumber ?? (session.medium === 'PDF' ? Number(session.endPosition) || null : null),
    confidence: null,
  };
}

/**
 * Logs a reading session that already happened (SRS §6.3: manual override always available).
 * It's recorded as ended, and moves the book's reading position only when it is the most
 * recent reading of that book -- logging last Tuesday never rewinds where the reader is now.
 */
export async function logSession(userId: string, input: LogSessionInput, now = new Date()): Promise<SessionDto> {
  const endTime = input.endedAt ?? now;
  if (endTime.getTime() > now.getTime() + 60_000) throw new AppError('VALIDATION_ERROR', "A logged session can't end in the future");
  const startTime = new Date(endTime.getTime() - input.minutes * 60_000);

  const copy = await prisma.copy.findFirst({ where: { id: input.copyId, userId }, include: { edition: true } });
  if (!copy) throw new AppError('NOT_FOUND', 'Copy not found in your library');
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
      status: 'ENDED',
      startTime,
      endTime,
      durationSeconds: input.minutes * 60,
      startPosition: input.startPosition ?? null,
      endPosition: input.endPosition ?? null,
      reflection: input.reflection ?? null,
    },
  });
  await markReadingIfWanted(userId, copy.edition.workId);

  const newer = await prisma.readingSession.findFirst({
    where: { journeyId: journey.id, status: 'ENDED', endTime: { gt: endTime }, id: { not: session.id } },
    select: { id: true },
  });
  if (!newer) {
    const position = await canonicalPositionForSession(session);
    if (position) await upsertCanonicalPosition(journey.id, position, null);
  }
  return toSessionDto(session);
}
