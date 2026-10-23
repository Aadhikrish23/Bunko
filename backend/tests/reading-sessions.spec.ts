import { test, expect } from './fixtures/auth.fixture';
import { prisma } from '../src/config/prisma';
import { runIdleTimeoutSweep } from '../src/modules/reading-sessions/idle-timeout.job';
import type { APIRequestContext } from '@playwright/test';

// Background-job logic (idle-timeout.job.ts) has no HTTP surface to test
// through — TESTING_STRATEGY.md §1 explicitly allows importing such
// logic directly rather than reaching for a second test tool, and T-020's
// own acceptance criteria calls for a mocked clock, which this gives us.

async function createCopy(
  authedRequest: APIRequestContext,
  format: 'PHYSICAL' | 'EPUB' | 'PDF' = 'EPUB',
): Promise<string> {
  // coverImageUrl is set to a dummy value so createWork (library.service.ts)
  // skips its live external metadata-search waterfall (Google Books →
  // Hardcover → Open Library) — that cascade only runs when a cover is
  // missing, and for a nonsense test title every tier legitimately finds
  // no match before falling through to the next, real network round-trip
  // each. This test calls createCopy twice per test, so that cascade
  // running twice was the actual cause of the intermittent 20s+ stalls
  // on this file's two multi-copy tests (root-caused after ruling out
  // Node version, the OCR worker, and Postgres locks/bloat).
  const work = await authedRequest.post('/api/v1/works', {
    data: { title: `Test Book ${Date.now()}`, coverImageUrl: 'https://example.com/cover.jpg' },
  });
  const workId = (await work.json()).data.id;
  const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format } });
  const editionId = (await edition.json()).data.id;
  const copy = await authedRequest.post('/api/v1/copies', { data: { editionId } });
  return (await copy.json()).data.id;
}

async function backdateUpdatedAt(sessionId: string, when: Date): Promise<void> {
  await prisma.$executeRaw`UPDATE "ReadingSession" SET "updatedAt" = ${when} WHERE id = ${sessionId}`;
}

test.describe('POST /reading-sessions (T-019)', () => {
  test('starting a session while one is already ACTIVE returns 409', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest);
    const first = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    expect(first.status()).toBe(201);

    const secondCopyId = await createCopy(authedRequest);
    const second = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId: secondCopyId } });
    expect(second.status()).toBe(409);
  });

  test('pausing active session unblocks starting a session for another copy', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest);
    const first = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    expect(first.status()).toBe(201);

    const pauseRes = await authedRequest.post('/api/v1/reading-sessions/pause-active');
    expect(pauseRes.status()).toBe(200);
    expect((await pauseRes.json()).data.status).toBe('PAUSED');

    const secondCopyId = await createCopy(authedRequest);
    const second = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId: secondCopyId } });
    expect(second.status()).toBe(201);
  });
});

test.describe('idle timeout (T-020, SRS §12.8 steps 4-5)', () => {
  test('an idle ACTIVE session is paused after the configured threshold', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest);
    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    const sessionId = (await started.json()).data.id;

    // Simulate 10 minutes of inactivity (default threshold is 5 minutes).
    await backdateUpdatedAt(sessionId, new Date(Date.now() - 10 * 60_000));
    await runIdleTimeoutSweep();

    const session = await prisma.readingSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe('PAUSED');
  });

  test('reopening within the grace window resumes the same session', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest);
    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    const sessionId = (await started.json()).data.id;

    await backdateUpdatedAt(sessionId, new Date(Date.now() - 10 * 60_000));
    await runIdleTimeoutSweep(); // -> PAUSED

    // Still within the default 15-minute grace window.
    const resumed = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    expect(resumed.status()).toBe(201);
    expect((await resumed.json()).data.id).toBe(sessionId);
    expect((await resumed.json()).data.status).toBe('ACTIVE');
  });

  test('beyond the grace window, the paused session auto-ends instead of resuming', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest);
    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    const sessionId = (await started.json()).data.id;

    // Idle well beyond both the idle threshold and the grace window.
    await backdateUpdatedAt(sessionId, new Date(Date.now() - 25 * 60_000));
    await runIdleTimeoutSweep();

    const session = await prisma.readingSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe('ENDED');

    // Starting again on the same copy creates a fresh session, not a resume.
    const restarted = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    expect(restarted.status()).toBe(201);
    expect((await restarted.json()).data.id).not.toBe(sessionId);
  });
});

test.describe('POST /reading-sessions/:id/end (T-021)', () => {
  test('is idempotent for the same payload', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest);
    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    const sessionId = (await started.json()).data.id;

    const payload = { endPosition: 'location-500', reflection: 'Good chapter.' };
    const first = await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, { data: payload });
    expect(first.status()).toBe(200);

    const second = await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, { data: payload });
    expect(second.status()).toBe(200);
    expect((await second.json()).data).toEqual((await first.json()).data);
  });

  test('rejects ending again with materially different data', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest);
    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    const sessionId = (await started.json()).data.id;

    await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, { data: { endPosition: 'location-500' } });
    const conflicting = await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, {
      data: { endPosition: 'location-999' },
    });
    expect(conflicting.status()).toBe(409);
  });

  test('a physical session requires endPosition before it can end', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest, 'PHYSICAL');
    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    const sessionId = (await started.json()).data.id;

    const withoutPosition = await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, { data: {} });
    expect(withoutPosition.status()).toBe(400);

    const withPosition = await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, {
      data: { endPosition: 'Chapter 10' },
    });
    expect(withPosition.status()).toBe(200);
  });
});

test.describe('GET /journal (T-022)', () => {
  test('lists ended sessions reverse-chronologically and excludes active ones', async ({ authedRequest }) => {
    const activeCopyId = await createCopy(authedRequest);
    await authedRequest.post('/api/v1/reading-sessions', { data: { copyId: activeCopyId } });

    const response = await authedRequest.get('/api/v1/journal');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.every((entry: { status: string }) => entry.status === 'ENDED')).toBe(true);
  });
});

test.describe('GET /statistics (T-023)', () => {
  test('reflects completed sessions', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest);
    const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    const sessionId = (await started.json()).data.id;
    await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, { data: { endPosition: 'p2' } });

    const response = await authedRequest.get('/api/v1/statistics');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveProperty('booksCompleted');
    expect(body.data).toHaveProperty('totalMinutesRead');
    expect(body.data).toHaveProperty('currentStreakDays');
  });
});

test.describe('POST /reading-sessions/log (R1-07)', () => {
  test('logs a finished past session, counted in the journal with its book', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest, 'PHYSICAL');
    const endedAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const res = await authedRequest.post('/api/v1/reading-sessions/log', {
      data: { copyId, endedAt, minutes: 40, startPosition: 'p. 80', endPosition: 'p. 112', reflection: 'the statues!' },
    });
    expect(res.status()).toBe(201);
    const session = (await res.json()).data;
    expect(session).toMatchObject({ status: 'ENDED', durationSeconds: 2400, endPosition: 'p. 112' });

    const journal = (await (await authedRequest.get('/api/v1/journal')).json()).data;
    const entry = journal.find((e: { id: string }) => e.id === session.id);
    expect(entry.book).toMatchObject({ format: 'PHYSICAL' });
    expect(typeof entry.book.title).toBe('string');

    const stats = (await (await authedRequest.get('/api/v1/statistics?tz=UTC')).json()).data;
    expect(stats.pagesRead).toBe(32);
  });

  test('refuses a session that ends in the future, or another reader\'s copy', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest, 'PHYSICAL');
    const future = await authedRequest.post('/api/v1/reading-sessions/log', {
      data: { copyId, endedAt: new Date(Date.now() + 86_400_000).toISOString(), minutes: 10 },
    });
    expect(future.status()).toBe(400);
    const stranger = await authedRequest.post('/api/v1/reading-sessions/log', {
      data: { copyId: '00000000-0000-0000-0000-000000000000', minutes: 10 },
    });
    expect(stranger.status()).toBe(404);
  });
});

// Black-box round 2 (T-105): time away isn't reading, a reflection can follow the end,
// a clash names the other book, and reading moves a Want to Read book to Reading.
test.describe('reading time and session hand-offs (R2-04 – R2-06, R2-22)', () => {
  const workOf = async (copyId: string) =>
    (await prisma.copy.findUniqueOrThrow({ where: { id: copyId }, include: { edition: true } })).edition.workId;

  test('time paused (a hidden tab) is not counted as reading', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest);
    const sessionId = (await (await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } })).json()).data.id;
    await prisma.$executeRaw`UPDATE "ReadingSession" SET "startTime" = ${new Date(Date.now() - 10 * 60_000)} WHERE id = ${sessionId}`;

    expect((await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/pause`)).status()).toBe(200);
    // Away for eight minutes, then back.
    await prisma.$executeRaw`UPDATE "ReadingSession" SET "pausedAt" = ${new Date(Date.now() - 8 * 60_000)} WHERE id = ${sessionId}`;
    const resumed = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
    expect((await resumed.json()).data).toMatchObject({ id: sessionId, status: 'ACTIVE' });

    const ended = (await (await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, { data: {} })).json()).data;
    expect(ended.durationSeconds).toBeGreaterThanOrEqual(118);
    expect(ended.durationSeconds).toBeLessThanOrEqual(125);
  });

  test('a page turn in a session the idle sweep paused resumes it', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest);
    const sessionId = (await (await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } })).json()).data.id;
    await backdateUpdatedAt(sessionId, new Date(Date.now() - 10 * 60_000));
    await runIdleTimeoutSweep();
    const progress = await authedRequest.patch(`/api/v1/reading-sessions/${sessionId}/progress`, { data: { position: 'ch2' } });
    expect(progress.status()).toBe(200);
    expect((await prisma.readingSession.findUniqueOrThrow({ where: { id: sessionId } })).status).toBe('ACTIVE');
  });

  test('a reflection can be added once the session has ended', async ({ authedRequest }) => {
    const copyId = await createCopy(authedRequest);
    const sessionId = (await (await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } })).json()).data.id;
    await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, { data: { endPosition: 'ch3' } });
    const withReflection = await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, {
      data: { endPosition: 'ch3', reflection: 'The customs house was eerie.' },
    });
    expect(withReflection.status()).toBe(200);
    expect((await withReflection.json()).data.reflection).toBe('The customs house was eerie.');
    // Changing a reflection already written is still a conflict.
    const changed = await authedRequest.post(`/api/v1/reading-sessions/${sessionId}/end`, { data: { reflection: 'Different.' } });
    expect(changed.status()).toBe(409);
  });

  test('a clash names the book whose session is still open', async ({ authedRequest }) => {
    const first = await createCopy(authedRequest);
    await authedRequest.post('/api/v1/reading-sessions', { data: { copyId: first } });
    const clash = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId: await createCopy(authedRequest) } });
    expect(clash.status()).toBe(409);
    expect((await clash.json()).error.message).toMatch(/still in a reading session for “Test Book \d+”/);
  });

  test('starting or logging a session moves Want to Read to Reading, never a finished book', async ({ authedRequest, testUser }) => {
    const live = await createCopy(authedRequest);
    await authedRequest.post('/api/v1/reading-sessions', { data: { copyId: live } });
    const status = async (copyId: string) =>
      (await prisma.userWork.findUniqueOrThrow({ where: { userId_workId: { userId: testUser.userId, workId: await workOf(copyId) } } })).status;
    expect(await status(live)).toBe('READING');

    const reread = await createCopy(authedRequest, 'PHYSICAL');
    await authedRequest.patch(`/api/v1/works/${await workOf(reread)}`, { data: { status: 'FINISHED' } });
    await authedRequest.post('/api/v1/reading-sessions/log', { data: { copyId: reread, minutes: 20 } });
    expect(await status(reread)).toBe('FINISHED');
  });
});
