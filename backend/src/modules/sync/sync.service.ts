import { Prisma, type ReadingPosition, type ReadingSession, type SyncEventStatus } from '@prisma/client';
import { ZodError } from 'zod';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { createAnnotation, updateAnnotation } from '../annotations/annotations.service';
import { createBookmark } from '../bookmarks/bookmarks.service';
import { upsertCanonicalPosition, type CanonicalPositionData } from '../continuity/canonical-position';
import { createNote, updateNote } from '../notes/notes.service';
import { scheduleAiIndex } from '../ai/ai-index';
import { setPreference } from '../preferences/preferences.service';
import { canonicalPositionForSession } from '../reading-sessions/reading-sessions.service';
import { payloadSchemas, type SyncEventInput } from './sync.schema';

// A stuck "session" (device asleep mid-session, clock oddities) is capped
// rather than inflating reading time.
const MAX_SESSION_SECONDS = 12 * 3600;

export interface DeviceDto {
  deviceId: string;
  label: string;
  lastSeenAt: Date;
  lastSyncAt: Date | null;
  current: boolean;
}

export interface EventResult {
  id: string;
  status: SyncEventStatus;
  duplicate?: boolean;
  detail?: unknown;
}

interface Outcome {
  status: SyncEventStatus;
  detail?: Record<string, unknown>;
}

interface PositionSnapshot extends CanonicalPositionData {
  deviceId: string | null;
  at: string; // when that position was set (server) or recorded (device)
}

interface ConflictDetail {
  journeyId: string;
  workId: string;
  sessionId: string;
  server: PositionSnapshot;
  device: PositionSnapshot;
}

export interface ConflictDto {
  id: string;
  workId: string;
  title: string | null;
  createdAt: Date;
  server: PositionSnapshot & { deviceLabel: string | null };
  device: PositionSnapshot & { deviceLabel: string | null };
}

// ---------------------------------------------------------------- devices

export async function registerDevice(userId: string, deviceId: string, label: string, now = new Date()) {
  const device = await prisma.deviceSession.upsert({
    where: { userId_deviceId: { userId, deviceId } },
    create: { userId, deviceId, label, lastSeenAt: now },
    update: { label, lastSeenAt: now },
  });
  return { deviceId: device.deviceId, label: device.label, lastSeenAt: device.lastSeenAt, lastSyncAt: device.lastSyncAt };
}

export async function listDevices(userId: string, currentDeviceId: string | null): Promise<DeviceDto[]> {
  const devices = await prisma.deviceSession.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } });
  return devices.map((device) => ({
    deviceId: device.deviceId,
    label: device.label,
    lastSeenAt: device.lastSeenAt,
    lastSyncAt: device.lastSyncAt,
    current: device.deviceId === currentDeviceId,
  }));
}

// ------------------------------------------------------- position conflicts

function normalise(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase() || null;
}

function samePosition(a: CanonicalPositionData, b: CanonicalPositionData): boolean {
  if (a.structuralId && b.structuralId) return a.structuralId === b.structuralId;
  const label = normalise(a.chapterLabel);
  return label !== null && label === normalise(b.chapterLabel);
}

function snapshot(position: ReadingPosition): PositionSnapshot {
  return {
    structuralId: position.structuralId,
    chapterLabel: position.chapterLabel,
    textAnchor: position.textAnchor,
    pageNumber: position.pageNumber,
    confidence: position.confidence,
    deviceId: position.updatedByDeviceId,
    at: position.updatedAt.toISOString(),
  };
}

// T-070. Compares the canonical position against the offline session's
// window [startTime, endTime] (device clock):
//   - set after the session ended  -> the server's is simply newer; keep it.
//   - set by another device during the session -> both readers moved
//     concurrently; if the positions differ, the reader decides (CONFLICT).
//   - otherwise (older, or this device's own earlier progress) -> apply.
async function applyOfflineSessionPosition(
  deviceId: string,
  journeyId: string,
  workId: string,
  session: ReadingSession,
): Promise<Outcome> {
  const candidate = await canonicalPositionForSession(session);
  if (!candidate || !session.endTime) return { status: 'APPLIED' };

  const journey = await prisma.readingJourney.findUnique({
    where: { id: journeyId },
    include: { canonicalPosition: true },
  });
  const current = journey?.canonicalPosition ?? null;

  if (current && current.updatedAt >= session.endTime) {
    return { status: 'APPLIED', detail: { position: 'kept newer position' } };
  }
  if (
    current &&
    current.updatedAt > session.startTime &&
    current.updatedByDeviceId !== deviceId &&
    !samePosition(current, candidate)
  ) {
    const detail: ConflictDetail = {
      journeyId,
      workId,
      sessionId: session.id,
      server: snapshot(current),
      device: { ...candidate, deviceId, at: session.endTime.toISOString() },
    };
    return { status: 'CONFLICT', detail: detail as unknown as Record<string, unknown> };
  }

  await upsertCanonicalPosition(journeyId, candidate, deviceId);
  return { status: 'APPLIED' };
}

// ------------------------------------------------------------ event handlers

async function recordOfflineSession(userId: string, deviceId: string, raw: unknown): Promise<Outcome> {
  const payload = payloadSchemas.SESSION_RECORDED.parse(raw);
  const startTime = new Date(payload.startTime);
  const endTime = new Date(payload.endTime);
  if (endTime < startTime) throw new AppError('VALIDATION_ERROR', 'endTime is before startTime');

  const copy = await prisma.copy.findFirst({ where: { id: payload.copyId, userId }, include: { edition: true } });
  if (!copy) throw new AppError('NOT_FOUND', 'Copy not found in your library');
  const journey = await prisma.readingJourney.upsert({
    where: { userId_workId: { userId, workId: copy.edition.workId } },
    create: { userId, workId: copy.edition.workId },
    update: {},
  });

  // Append-only: an offline session never conflicts with other sessions.
  // A replay finds its own earlier row and just re-checks the position.
  let session = await prisma.readingSession.findUnique({ where: { id: payload.sessionId } });
  if (session && session.userId !== userId) throw new AppError('CONFLICT', 'That session id is already in use');
  if (!session) {
    session = await prisma.readingSession.create({
      data: {
        id: payload.sessionId,
        userId,
        journeyId: journey.id,
        copyId: copy.id,
        medium: copy.edition.format,
        status: 'ENDED',
        startTime,
        endTime,
        durationSeconds: Math.min(MAX_SESSION_SECONDS, Math.round((endTime.getTime() - startTime.getTime()) / 1000)),
        startPosition: payload.startPosition ?? null,
        endPosition: payload.endPosition ?? null,
        reflection: payload.reflection ?? null,
        device: deviceId,
      },
    });
  }

  return applyOfflineSessionPosition(deviceId, journey.id, copy.edition.workId, session);
}

// An item made during an offline session links to it only if that session
// has actually reached the server; otherwise it's kept unlinked rather
// than rejected — the annotation matters more than the link.
async function ownSessionOrNull(userId: string, sessionId: string | null | undefined): Promise<string | null> {
  if (!sessionId) return null;
  const session = await prisma.readingSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
  return session?.id ?? null;
}

async function applyEvent(userId: string, deviceId: string, event: SyncEventInput, at: Date): Promise<Outcome> {
  switch (event.type) {
    case 'SESSION_RECORDED':
      return recordOfflineSession(userId, deviceId, event.payload);

    case 'ANNOTATION_CREATED': {
      const { annotationId, editionId, sessionId, ...input } = payloadSchemas.ANNOTATION_CREATED.parse(event.payload);
      const existing = await prisma.annotation.findUnique({ where: { id: annotationId } });
      if (existing) {
        if (existing.userId !== userId) throw new AppError('CONFLICT', 'That annotation id is already in use');
        return { status: 'SKIPPED', detail: { reason: 'already exists' } };
      }
      await createAnnotation(
        userId,
        editionId,
        { ...input, sessionId: await ownSessionOrNull(userId, sessionId) },
        { id: annotationId, createdAt: at },
      );
      return { status: 'APPLIED' };
    }

    case 'ANNOTATION_UPDATED': {
      const { annotationId, ...changes } = payloadSchemas.ANNOTATION_UPDATED.parse(event.payload);
      const existing = await prisma.annotation.findFirst({ where: { id: annotationId, userId } });
      // Deletes win over concurrent edits.
      if (!existing) return { status: 'SKIPPED', detail: { reason: 'deleted' } };
      if (existing.updatedAt > at) return { status: 'SKIPPED', detail: { reason: 'server copy is newer' } };
      await updateAnnotation(userId, annotationId, changes);
      return { status: 'APPLIED' };
    }

    case 'ANNOTATION_DELETED': {
      const { annotationId } = payloadSchemas.ANNOTATION_DELETED.parse(event.payload);
      const { count } = await prisma.annotation.deleteMany({ where: { id: annotationId, userId } });
      return count ? { status: 'APPLIED' } : { status: 'SKIPPED', detail: { reason: 'already deleted' } };
    }

    case 'NOTE_CREATED': {
      const { noteId, workId, ...rest } = payloadSchemas.NOTE_CREATED_IDS.parse(event.payload);
      const input = payloadSchemas.NOTE_CREATED.parse(rest);
      const existing = await prisma.note.findUnique({ where: { id: noteId } });
      if (existing) {
        if (existing.userId !== userId) throw new AppError('CONFLICT', 'That note id is already in use');
        return { status: 'SKIPPED', detail: { reason: 'already exists' } };
      }
      await createNote(
        userId,
        workId,
        { ...input, sessionId: await ownSessionOrNull(userId, input.sessionId) },
        { id: noteId, createdAt: at },
      );
      return { status: 'APPLIED' };
    }

    case 'NOTE_UPDATED': {
      const { noteId, body } = payloadSchemas.NOTE_UPDATED.parse(event.payload);
      const existing = await prisma.note.findFirst({ where: { id: noteId, userId } });
      if (!existing) return { status: 'SKIPPED', detail: { reason: 'deleted' } };
      if (existing.updatedAt > at) return { status: 'SKIPPED', detail: { reason: 'server copy is newer' } };
      await updateNote(userId, noteId, { body });
      return { status: 'APPLIED' };
    }

    case 'NOTE_DELETED': {
      const { noteId } = payloadSchemas.NOTE_DELETED.parse(event.payload);
      const { count } = await prisma.note.deleteMany({ where: { id: noteId, userId } });
      return count ? { status: 'APPLIED' } : { status: 'SKIPPED', detail: { reason: 'already deleted' } };
    }

    case 'BOOKMARK_CREATED': {
      const { bookmarkId, editionId, position, label } = payloadSchemas.BOOKMARK_CREATED.parse(event.payload);
      const { created } = await createBookmark(userId, editionId, { id: bookmarkId, position, label }, { createdAt: at });
      return created ? { status: 'APPLIED' } : { status: 'SKIPPED', detail: { reason: 'already exists' } };
    }

    case 'BOOKMARK_DELETED': {
      const { bookmarkId } = payloadSchemas.BOOKMARK_DELETED.parse(event.payload);
      const { count } = await prisma.bookmark.deleteMany({ where: { id: bookmarkId, userId } });
      return count ? { status: 'APPLIED' } : { status: 'SKIPPED', detail: { reason: 'already deleted' } };
    }

    case 'PREFERENCE_SET': {
      const { key, value } = payloadSchemas.PREFERENCE_SET.parse(event.payload);
      const { applied } = await setPreference(userId, key, value, at, deviceId);
      return applied ? { status: 'APPLIED' } : { status: 'SKIPPED', detail: { reason: 'a newer value exists' } };
    }
  }
}

function rejectionReason(err: unknown): string | null {
  if (err instanceof AppError) return err.message;
  if (err instanceof ZodError) return err.issues.map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`).join('; ');
  return null;
}

// T-069. Events apply strictly in the order given (the client's outbox
// order). Each is recorded once per (user, client event id), so replaying
// a batch after a dropped response returns the original results instead
// of applying anything twice. Every handler is itself idempotent too, so
// a crash between applying and recording can't double-apply on retry.
export async function ingestEvents(
  userId: string,
  deviceId: string,
  events: SyncEventInput[],
  now = new Date(),
): Promise<EventResult[]> {
  const results: EventResult[] = [];

  for (const event of events) {
    const previous = await prisma.syncEvent.findUnique({
      where: { userId_clientEventId: { userId, clientEventId: event.id } },
    });
    if (previous) {
      results.push({ id: event.id, status: previous.status, duplicate: true, detail: previous.detail ?? undefined });
      continue;
    }

    // Device clocks can run ahead; an event can't have happened after it
    // arrived.
    const clientAt = new Date(event.createdAt);
    const at = clientAt > now ? now : clientAt;

    let outcome: Outcome;
    try {
      outcome = await applyEvent(userId, deviceId, event, at);
    } catch (err) {
      const reason = rejectionReason(err);
      if (reason === null) throw err;
      outcome = { status: 'REJECTED', detail: { reason } };
    }

    try {
      await prisma.syncEvent.create({
        data: {
          userId,
          deviceId,
          clientEventId: event.id,
          type: event.type,
          payload: event.payload as Prisma.InputJsonValue,
          clientCreatedAt: at,
          status: outcome.status,
          detail: outcome.detail ? (outcome.detail as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
    } catch (err) {
      // A concurrent retry of the same batch recorded it first.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
    results.push({ id: event.id, status: outcome.status, ...(outcome.detail ? { detail: outcome.detail } : {}) });
  }

  await prisma.deviceSession.updateMany({ where: { userId, deviceId }, data: { lastSyncAt: now, lastSeenAt: now } });
  // Replayed deletes bypass the services' own re-index hooks.
  scheduleAiIndex(userId);
  return results;
}

// ---------------------------------------------------- conflict resolution

export async function listConflicts(userId: string): Promise<ConflictDto[]> {
  const rows = await prisma.syncEvent.findMany({
    where: { userId, status: 'CONFLICT', resolvedAt: null },
    orderBy: { receivedAt: 'asc' },
  });
  const details = rows.map((row) => row.detail as unknown as ConflictDetail);
  const [works, devices] = await Promise.all([
    prisma.work.findMany({ where: { id: { in: details.map((d) => d.workId) } }, select: { id: true, title: true } }),
    prisma.deviceSession.findMany({ where: { userId }, select: { deviceId: true, label: true } }),
  ]);
  const titles = new Map(works.map((work) => [work.id, work.title]));
  const labels = new Map(devices.map((device) => [device.deviceId, device.label]));
  const labelFor = (deviceId: string | null) => (deviceId ? (labels.get(deviceId) ?? null) : null);

  return rows.map((row, index) => {
    const detail = details[index]!;
    return {
      id: row.id,
      workId: detail.workId,
      title: titles.get(detail.workId) ?? null,
      createdAt: row.receivedAt,
      server: { ...detail.server, deviceLabel: labelFor(detail.server.deviceId) },
      device: { ...detail.device, deviceLabel: labelFor(detail.device.deviceId) },
    };
  });
}

export async function resolveConflict(userId: string, id: string, keep: 'SERVER' | 'DEVICE'): Promise<void> {
  const row = await prisma.syncEvent.findFirst({ where: { id, userId, status: 'CONFLICT' } });
  if (!row) throw new AppError('NOT_FOUND', 'Conflict not found');
  if (row.resolvedAt) return; // already decided — repeating the choice is a no-op

  if (keep === 'DEVICE') {
    const { journeyId, device } = row.detail as unknown as ConflictDetail;
    await upsertCanonicalPosition(
      journeyId,
      {
        structuralId: device.structuralId,
        chapterLabel: device.chapterLabel,
        textAnchor: device.textAnchor,
        pageNumber: device.pageNumber,
        confidence: device.confidence,
      },
      device.deviceId,
    );
  }
  await prisma.syncEvent.update({ where: { id }, data: { resolvedAt: new Date(), resolution: keep } });
}
