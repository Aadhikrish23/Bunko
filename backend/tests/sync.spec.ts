import { randomUUID } from 'crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures/auth.fixture';
import { prisma } from '../src/config/prisma';

const DEVICE_A = randomUUID();
const DEVICE_B = randomUUID();

async function createCopy(authedRequest: APIRequestContext, format: 'EPUB' | 'PDF' = 'EPUB') {
  const work = await authedRequest.post('/api/v1/works', {
    data: { title: `Sync Book ${randomUUID()}`, coverImageUrl: 'https://example.com/c.jpg' },
  });
  const workId = (await work.json()).data.id as string;
  const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format } });
  const editionId = (await edition.json()).data.id as string;
  const copy = await authedRequest.post('/api/v1/copies', { data: { editionId } });
  return { workId, editionId, copyId: (await copy.json()).data.id as string };
}

function event(type: string, payload: Record<string, unknown>, createdAt = new Date()) {
  return { id: randomUUID(), type, createdAt: createdAt.toISOString(), payload };
}

async function sync(authedRequest: APIRequestContext, deviceId: string, events: unknown[]) {
  const response = await authedRequest.post('/api/v1/sync/events', {
    headers: { 'X-Device-Id': deviceId },
    data: { events },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data as Array<{ id: string; status: string; duplicate?: boolean; detail?: Record<string, unknown> }>;
}

async function canonicalPosition(userId: string, workId: string) {
  const journey = await prisma.readingJourney.findUnique({
    where: { userId_workId: { userId, workId } },
    include: { canonicalPosition: true },
  });
  return journey?.canonicalPosition ?? null;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

test.describe('sync devices (T-071)', () => {
  test('registers a device and marks the calling one as current', async ({ authedRequest }) => {
    const registered = await authedRequest.post('/api/v1/sync/devices', {
      data: { deviceId: DEVICE_A, label: 'Chrome on Windows' },
    });
    expect(registered.status()).toBe(200);

    const list = await authedRequest.get('/api/v1/sync/devices', { headers: { 'X-Device-Id': DEVICE_A } });
    const devices = (await list.json()).data;
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ deviceId: DEVICE_A, label: 'Chrome on Windows', current: true });
  });
});

test.describe('sync events (T-069)', () => {
  test('requires authentication and a device id', async ({ request, authedRequest }) => {
    expect((await request.post('/api/v1/sync/events', { data: { events: [] } })).status()).toBe(401);
    const noDevice = await authedRequest.post('/api/v1/sync/events', {
      data: { events: [event('ANNOTATION_DELETED', { annotationId: randomUUID() })] },
    });
    expect(noDevice.status()).toBe(400);
  });

  test('replaying a batch never applies anything twice', async ({ authedRequest }) => {
    const { editionId } = await createCopy(authedRequest);
    const batch = [
      event('ANNOTATION_CREATED', {
        annotationId: randomUUID(),
        editionId,
        kind: 'HIGHLIGHT',
        position: 'ch1',
        text: 'made offline',
      }),
    ];

    const first = await sync(authedRequest, DEVICE_A, batch);
    expect(first[0]).toMatchObject({ status: 'APPLIED' });
    const second = await sync(authedRequest, DEVICE_A, batch);
    expect(second[0]).toMatchObject({ status: 'APPLIED', duplicate: true });

    const list = await authedRequest.get(`/api/v1/editions/${editionId}/annotations`);
    expect((await list.json()).data).toHaveLength(1);
  });

  test('an annotation created then edited offline keeps both, with the client id', async ({ authedRequest }) => {
    const { editionId } = await createCopy(authedRequest);
    const annotationId = randomUUID();
    const results = await sync(authedRequest, DEVICE_A, [
      event('ANNOTATION_CREATED', { annotationId, editionId, kind: 'QUOTE', position: 'ch2', text: 'q' }, minutesAgo(10)),
      event('ANNOTATION_UPDATED', { annotationId, note: 'added later, still offline' }, minutesAgo(5)),
    ]);
    expect(results.map((r) => r.status)).toEqual(['APPLIED', 'APPLIED']);

    const annotation = (await (await authedRequest.get(`/api/v1/editions/${editionId}/annotations`)).json()).data[0];
    expect(annotation).toMatchObject({ id: annotationId, note: 'added later, still offline' });
  });

  test('an offline edit older than the server copy is skipped; deletes win over edits', async ({ authedRequest }) => {
    const { editionId } = await createCopy(authedRequest);
    const created = await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'HIGHLIGHT', position: 'ch1', text: 'online' },
    });
    const annotationId = (await created.json()).data.id;
    await authedRequest.patch(`/api/v1/annotations/${annotationId}`, { data: { note: 'newer, made online' } });

    const stale = await sync(authedRequest, DEVICE_B, [
      event('ANNOTATION_UPDATED', { annotationId, note: 'older offline edit' }, minutesAgo(60)),
    ]);
    expect(stale[0]).toMatchObject({ status: 'SKIPPED', detail: { reason: 'server copy is newer' } });

    const afterDelete = await sync(authedRequest, DEVICE_B, [
      event('ANNOTATION_DELETED', { annotationId }),
      event('ANNOTATION_UPDATED', { annotationId, note: 'too late' }),
    ]);
    expect(afterDelete.map((r) => r.status)).toEqual(['APPLIED', 'SKIPPED']);
  });

  test('one bad event is rejected on its own without failing the batch', async ({ authedRequest }) => {
    const { editionId } = await createCopy(authedRequest);
    const results = await sync(authedRequest, DEVICE_A, [
      event('ANNOTATION_CREATED', { annotationId: randomUUID(), editionId, kind: 'NOT_A_KIND', position: 'x', text: 'x' }),
      event('BOOKMARK_CREATED', { bookmarkId: randomUUID(), editionId, position: 'ch3', label: 'Chapter 3' }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['REJECTED', 'APPLIED']);
  });

  test("events can't touch another user's data", async ({ authedRequest, request }) => {
    const { editionId } = await createCopy(authedRequest);
    const other = await request.post('/api/v1/auth/register', {
      data: { email: `sync-other-${randomUUID()}@example.com`, password: 'correct-horse-battery-staple', displayName: 'Other' },
    });
    const headers = { Authorization: `Bearer ${(await other.json()).data.accessToken}`, 'X-Device-Id': DEVICE_B };
    const response = await request.post('/api/v1/sync/events', {
      headers,
      data: {
        events: [event('BOOKMARK_CREATED', { bookmarkId: randomUUID(), editionId, position: 'ch1', label: 'x' })],
      },
    });
    expect((await response.json()).data[0]).toMatchObject({ status: 'REJECTED' });
  });

  test('preferences replay last-write-wins by client time', async ({ authedRequest }) => {
    const results = await sync(authedRequest, DEVICE_A, [
      event('PREFERENCE_SET', { key: 'reader-settings', value: { fontScale: 1.25 } }, minutesAgo(5)),
      event('PREFERENCE_SET', { key: 'reader-settings', value: { fontScale: 0.9 } }, minutesAgo(30)),
    ]);
    expect(results.map((r) => r.status)).toEqual(['APPLIED', 'SKIPPED']);
    const prefs = (await (await authedRequest.get('/api/v1/preferences')).json()).data;
    expect(prefs[0].value).toEqual({ fontScale: 1.25 });
  });
});

test.describe('offline sessions & position conflicts (T-069, T-070)', () => {
  test('an offline session is recorded as a finished session and moves the position', async ({
    authedRequest,
    testUser,
  }) => {
    const { workId, copyId } = await createCopy(authedRequest);
    const sessionId = randomUUID();
    const results = await sync(authedRequest, DEVICE_B, [
      event('SESSION_RECORDED', {
        sessionId,
        copyId,
        startTime: minutesAgo(50).toISOString(),
        endTime: minutesAgo(20).toISOString(),
        endPosition: 'ch7',
      }),
    ]);
    expect(results[0]).toMatchObject({ status: 'APPLIED' });

    const session = await prisma.readingSession.findUnique({ where: { id: sessionId } });
    expect(session).toMatchObject({ status: 'ENDED', durationSeconds: 1800, endPosition: 'ch7', device: DEVICE_B });
    expect((await canonicalPosition(testUser.userId, workId))?.structuralId).toBe('ch7');
  });

  test('another device moving the position during the offline window is a conflict, resolvable either way', async ({
    authedRequest,
    testUser,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { workId, copyId } = await createCopy(authedRequest);

    // Device A reads online and ends at ch9...
    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    const onlineId = (await started.json()).data.id;
    await authedRequest.post(`/api/v1/reading-sessions/${onlineId}/end`, {
      headers: { 'X-Device-Id': DEVICE_A },
      data: { endPosition: 'ch9' },
    });
    // ...20 minutes ago, while device B was reading offline (30 -> 10 min ago).
    const position = await canonicalPosition(testUser.userId, workId);
    await prisma.$executeRaw`UPDATE "ReadingPosition" SET "updatedAt" = ${minutesAgo(20)} WHERE id = ${position!.id}`;

    const results = await sync(authedRequest, DEVICE_B, [
      event('SESSION_RECORDED', {
        sessionId: randomUUID(),
        copyId,
        startTime: minutesAgo(30).toISOString(),
        endTime: minutesAgo(10).toISOString(),
        endPosition: 'ch4',
      }),
    ]);
    expect(results[0]!.status).toBe('CONFLICT');
    expect((await canonicalPosition(testUser.userId, workId))?.structuralId).toBe('ch9'); // nothing overwritten

    const conflicts = (await (await authedRequest.get('/api/v1/sync/conflicts')).json()).data;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      workId,
      server: { structuralId: 'ch9', deviceId: DEVICE_A },
      device: { structuralId: 'ch4', deviceId: DEVICE_B },
    });

    const resolved = await authedRequest.post(`/api/v1/sync/conflicts/${conflicts[0].id}/resolve`, {
      data: { keep: 'DEVICE' },
    });
    expect(resolved.status()).toBe(204);
    expect((await canonicalPosition(testUser.userId, workId))?.structuralId).toBe('ch4');
    expect((await (await authedRequest.get('/api/v1/sync/conflicts')).json()).data).toEqual([]);
  });

  test('a position set after the offline session ended is newer and is kept', async ({ authedRequest, testUser }) => {
    const { workId, copyId } = await createCopy(authedRequest);
    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    const onlineId = (await started.json()).data.id;
    await authedRequest.post(`/api/v1/reading-sessions/${onlineId}/end`, {
      headers: { 'X-Device-Id': DEVICE_A },
      data: { endPosition: 'ch12' },
    });

    // Device B's offline session ended an hour ago — before A's progress.
    const results = await sync(authedRequest, DEVICE_B, [
      event('SESSION_RECORDED', {
        sessionId: randomUUID(),
        copyId,
        startTime: minutesAgo(90).toISOString(),
        endTime: minutesAgo(60).toISOString(),
        endPosition: 'ch3',
      }),
    ]);
    expect(results[0]).toMatchObject({ status: 'APPLIED', detail: { position: 'kept newer position' } });
    expect((await canonicalPosition(testUser.userId, workId))?.structuralId).toBe('ch12');
  });

  test('the same position on both devices is not a conflict', async ({ authedRequest, testUser }) => {
    const { workId, copyId } = await createCopy(authedRequest);
    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    await authedRequest.post(`/api/v1/reading-sessions/${(await started.json()).data.id}/end`, {
      headers: { 'X-Device-Id': DEVICE_A },
      data: { endPosition: 'ch5' },
    });
    const position = await canonicalPosition(testUser.userId, workId);
    await prisma.$executeRaw`UPDATE "ReadingPosition" SET "updatedAt" = ${minutesAgo(20)} WHERE id = ${position!.id}`;

    const results = await sync(authedRequest, DEVICE_B, [
      event('SESSION_RECORDED', {
        sessionId: randomUUID(),
        copyId,
        startTime: minutesAgo(30).toISOString(),
        endTime: minutesAgo(10).toISOString(),
        endPosition: 'ch5',
      }),
    ]);
    expect(results[0]!.status).toBe('APPLIED');
  });
});
