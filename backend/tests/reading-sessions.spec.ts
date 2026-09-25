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
