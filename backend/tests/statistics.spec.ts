import { randomUUID } from 'crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures/auth.fixture';
import { prisma } from '../src/config/prisma';

// Statistics are computed from session history, so these tests create
// sessions through the API (so journeys/copies are real) and then backdate
// their timing/positions directly — same approach as reading-sessions.spec.ts.

interface WorkOptions {
  format?: 'PHYSICAL' | 'EPUB' | 'PDF';
  genres?: string[];
  authors?: string[];
  language?: string | null;
}

async function createCopy(authedRequest: APIRequestContext, options: WorkOptions = {}) {
  const work = await authedRequest.post('/api/v1/works', {
    data: {
      title: `Stats Book ${randomUUID()}`,
      // A cover skips createWork's live metadata lookup (see reading-sessions.spec.ts).
      coverImageUrl: 'https://example.com/cover.jpg',
      genres: options.genres ?? [],
      authors: options.authors ?? [],
      language: options.language ?? null,
    },
  });
  const workId = (await work.json()).data.id as string;
  const edition = await authedRequest.post('/api/v1/editions', {
    data: { workId, format: options.format ?? 'PDF' },
  });
  const editionId = (await edition.json()).data.id as string;
  const copy = await authedRequest.post('/api/v1/copies', { data: { editionId } });
  const copyId = (await copy.json()).data.id as string;
  return { workId, editionId, copyId };
}

async function addEndedSession(
  authedRequest: APIRequestContext,
  copyId: string,
  options: { start: Date; minutes: number; startPosition?: string | null; endPosition: string },
): Promise<string> {
  const started = await authedRequest.post('/api/v1/reading-sessions', { data: { copyId } });
  const id = (await started.json()).data.id as string;
  await authedRequest.post(`/api/v1/reading-sessions/${id}/end`, { data: { endPosition: options.endPosition } });
  await prisma.readingSession.update({
    where: { id },
    data: {
      startTime: options.start,
      endTime: new Date(options.start.getTime() + options.minutes * 60_000),
      durationSeconds: options.minutes * 60,
      startPosition: options.startPosition ?? null,
      endPosition: options.endPosition,
    },
  });
  return id;
}

// Noon UTC n days before today — far from any UTC midnight, so UTC-based
// assertions don't depend on what time the suite runs.
function utcNoonDaysAgo(days: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days, 12));
}

async function getStats(authedRequest: APIRequestContext, tz = 'UTC') {
  const response = await authedRequest.get(`/api/v1/statistics?tz=${encodeURIComponent(tz)}`);
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}

test.describe('GET /statistics (T-053)', () => {
  test('requires authentication', async ({ request }) => {
    expect((await request.get('/api/v1/statistics')).status()).toBe(401);
  });

  test('rejects an invalid tz', async ({ authedRequest }) => {
    expect((await authedRequest.get('/api/v1/statistics?tz=Mars%2FOlympus')).status()).toBe(400);
  });

  test('a new account gets zeros and nulls, not errors', async ({ authedRequest }) => {
    const stats = await getStats(authedRequest);
    expect(stats).toMatchObject({
      booksCompleted: 0,
      totalMinutesRead: 0,
      totalSessions: 0,
      averageSessionMinutes: null,
      pagesRead: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
      pace: { pagesPerHour: null, pagesPerSession: null, sampleSessions: 0 },
      breakdowns: { byGenre: [], byAuthor: [], byLanguage: [], byFormat: [] },
    });
  });

  test('totals, average session length, current and longest streak reconcile', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(90_000);
    const { copyId } = await createCopy(authedRequest);
    // A 3-day run (10, 9, 8 days ago), then a 2-day run ending today.
    const plan: Array<[number, number]> = [
      [10, 30],
      [9, 20],
      [8, 10],
      [1, 40],
      [0, 20],
    ];
    for (const [daysAgo, minutes] of plan) {
      await addEndedSession(authedRequest, copyId, {
        start: utcNoonDaysAgo(daysAgo),
        minutes,
        endPosition: 'Chapter 1', // unresolvable on purpose: pages stay out of this test
      });
    }

    const stats = await getStats(authedRequest);
    expect(stats.totalSessions).toBe(5);
    expect(stats.totalMinutesRead).toBe(120);
    expect(stats.averageSessionMinutes).toBe(24);
    expect(stats.longestStreakDays).toBe(3);
    // Today's session is at noon UTC; if the suite runs before noon UTC it
    // is still "today", so the current run is 2 either way.
    expect(stats.currentStreakDays).toBe(2);
    expect(stats.pagesRead).toBe(0);
  });

  test('breakdowns count library books by genre, author, language, and format', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(90_000);
    const fantasy = await createCopy(authedRequest, {
      format: 'PHYSICAL',
      genres: ['Fantasy'],
      authors: ['Brandon Sanderson'],
      language: 'en',
    });
    // Same work, second format: counts once under each format.
    const epubEdition = await authedRequest.post('/api/v1/editions', {
      data: { workId: fantasy.workId, format: 'EPUB' },
    });
    await authedRequest.post('/api/v1/copies', { data: { editionId: (await epubEdition.json()).data.id } });
    await createCopy(authedRequest, { format: 'PDF', genres: ['Fantasy', 'Adventure'], authors: ['Brandon Sanderson'] });
    await createCopy(authedRequest, { format: 'PDF' });

    const { breakdowns } = await getStats(authedRequest);
    expect(breakdowns.byGenre).toEqual([
      { label: 'Fantasy', count: 2 },
      { label: 'Adventure', count: 1 },
      { label: null, count: 1 },
    ]);
    expect(breakdowns.byAuthor).toEqual([
      { label: 'Brandon Sanderson', count: 2 },
      { label: null, count: 1 },
    ]);
    expect(breakdowns.byLanguage).toEqual([
      { label: null, count: 2 },
      { label: 'English', count: 1 }, // codes and lowercase names are shown as language names (R1-09)
    ]);
    expect(breakdowns.byFormat).toEqual([
      { label: 'PDF', count: 2 },
      { label: 'EPUB', count: 1 },
      { label: 'PHYSICAL', count: 1 },
    ]);
  });
});

test.describe('streak day-bucketing (T-054)', () => {
  test('a session just after local midnight counts toward the local day, not the UTC one', async ({
    authedRequest,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { copyId } = await createCopy(authedRequest);
    // 20:00 UTC three days ago is 01:30 the next day in India (UTC+5:30):
    // two different UTC days, but the same local day in Asia/Kolkata.
    const threeDaysAgo = utcNoonDaysAgo(3);
    await addEndedSession(authedRequest, copyId, {
      start: new Date(threeDaysAgo.getTime() + 8 * 3_600_000),
      minutes: 15,
      endPosition: 'x',
    });
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(2), minutes: 15, endPosition: 'x' });

    expect((await getStats(authedRequest, 'UTC')).longestStreakDays).toBe(2);
    expect((await getStats(authedRequest, 'Asia/Kolkata')).longestStreakDays).toBe(1);
  });

  test('consecutive local days across a DST change still form one streak', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { copyId } = await createCopy(authedRequest);
    // US DST ended 2025-11-02 02:00 local (a 25-hour day in New York).
    // Local NY days: Nov 1 (23:30 EDT), Nov 2 (23:30 EST), Nov 3 (noon EST).
    for (const start of ['2025-11-02T03:30:00Z', '2025-11-03T04:30:00Z', '2025-11-03T17:00:00Z']) {
      await addEndedSession(authedRequest, copyId, { start: new Date(start), minutes: 10, endPosition: 'x' });
    }

    expect((await getStats(authedRequest, 'America/New_York')).longestStreakDays).toBe(3);
    // In UTC the first two land on Nov 2 and Nov 3 and the third also on
    // Nov 3, so only two distinct days.
    expect((await getStats(authedRequest, 'UTC')).longestStreakDays).toBe(2);
  });

  test('a gap of a day breaks the current streak', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { copyId } = await createCopy(authedRequest);
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(3), minutes: 10, endPosition: 'x' });
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(2), minutes: 10, endPosition: 'x' });

    const stats = await getStats(authedRequest);
    expect(stats.currentStreakDays).toBe(0); // nothing yesterday or today
    expect(stats.longestStreakDays).toBe(2);
  });
});

test.describe('pages read & reading pace (T-053, T-056)', () => {
  test('PDF page positions give literal pages and, with enough data, a pace', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(90_000);
    const { copyId } = await createCopy(authedRequest, { format: 'PDF' });
    // First digital session opens at page 1 (no recorded start).
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(3), minutes: 30, endPosition: '21' });
    await addEndedSession(authedRequest, copyId, {
      start: utcNoonDaysAgo(2),
      minutes: 30,
      startPosition: '21',
      endPosition: '41',
    });
    // No recorded start: continues from the previous session's end (41).
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(1), minutes: 30, endPosition: '61' });

    const stats = await getStats(authedRequest);
    expect(stats.pagesRead).toBe(60);
    expect(stats.pace).toEqual({ pagesPerHour: 40, pagesPerSession: 20, sampleSessions: 3 });
  });

  test('pace stays null until there is enough reliable data', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { copyId } = await createCopy(authedRequest, { format: 'PDF' });
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(2), minutes: 30, endPosition: '11' });
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(1), minutes: 30, endPosition: '21' });

    const stats = await getStats(authedRequest);
    expect(stats.pagesRead).toBe(20);
    expect(stats.pace).toEqual({ pagesPerHour: null, pagesPerSession: null, sampleSessions: 2 });
  });

  test('a physical first session (no known start) and free-text positions are left out, not guessed', async ({
    authedRequest,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const { copyId } = await createCopy(authedRequest, { format: 'PHYSICAL' });
    // The reader may have started mid-book before logging: unknown.
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(3), minutes: 20, endPosition: 'p. 50' });
    // 50 -> 80: known.
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(2), minutes: 20, endPosition: 'p. 80' });
    // "Chapter 9" can't be turned into pages: unknown.
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(1), minutes: 20, endPosition: 'Chapter 9' });

    expect((await getStats(authedRequest)).pagesRead).toBe(30);
  });

  test('EPUB progress uses estimated-equivalent pages from chapter text length (SRS §19.3)', async ({
    authedRequest,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { editionId, copyId } = await createCopy(authedRequest, { format: 'EPUB' });
    await prisma.edition.update({
      where: { id: editionId },
      data: {
        chapterGraph: {
          version: 3,
          format: 'EPUB',
          hasTextLayer: true,
          units: [
            { structuralId: 'ch0', label: 'One', order: 0, pageNumber: null, textAnchors: [], text: 'a'.repeat(3600) },
            { structuralId: 'ch1', label: 'Two', order: 1, pageNumber: null, textAnchors: [], text: 'b'.repeat(1800) },
            { structuralId: 'ch2', label: 'Three', order: 2, pageNumber: null, textAnchors: [], text: 'c'.repeat(500) },
          ],
        },
      },
    });
    // Start of book -> start of ch2: 3,600 + 1,800 chars = 3 pages at 1,800 chars/page.
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(1), minutes: 25, endPosition: 'ch2' });

    expect((await getStats(authedRequest)).pagesRead).toBe(3);
  });
});

test.describe('GET /statistics/trends (T-055)', () => {
  test('rejects an unknown range', async ({ authedRequest }) => {
    expect((await authedRequest.get('/api/v1/statistics/trends?range=hourly')).status()).toBe(400);
  });

  test('daily: 30 buckets ending today, totals cover only that window', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { copyId } = await createCopy(authedRequest);
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(1), minutes: 45, endPosition: 'x' });
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(40), minutes: 60, endPosition: 'x' });

    const response = await authedRequest.get('/api/v1/statistics/trends?range=daily&tz=UTC');
    expect(response.status()).toBe(200);
    const trends = (await response.json()).data;
    expect(trends.range).toBe('daily');
    expect(trends.buckets).toHaveLength(30);
    expect(trends.buckets[29].start).toBe(utcNoonDaysAgo(0).toISOString().slice(0, 10));
    expect(trends.buckets[28]).toMatchObject({ minutesRead: 45, sessions: 1 });
    expect(trends.totals).toMatchObject({ minutesRead: 45, sessions: 1 }); // the 40-days-ago session is outside
  });

  test('weekly buckets start on Monday; monthly on the 1st', async ({ authedRequest }) => {
    const weekly = (await (await authedRequest.get('/api/v1/statistics/trends?range=weekly')).json()).data;
    expect(weekly.buckets).toHaveLength(12);
    for (const bucket of weekly.buckets) {
      expect(new Date(`${bucket.start}T00:00:00Z`).getUTCDay()).toBe(1);
    }

    const monthly = (await (await authedRequest.get('/api/v1/statistics/trends?range=monthly')).json()).data;
    expect(monthly.buckets).toHaveLength(12);
    for (const bucket of monthly.buckets) {
      expect(bucket.start.endsWith('-01')).toBe(true);
    }
  });

  test('yearly spans from the first session year; all-time is one bucket with everything', async ({
    authedRequest,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { copyId } = await createCopy(authedRequest);
    await addEndedSession(authedRequest, copyId, {
      start: new Date('2024-06-01T12:00:00Z'),
      minutes: 30,
      endPosition: 'x',
    });
    await addEndedSession(authedRequest, copyId, { start: utcNoonDaysAgo(1), minutes: 15, endPosition: 'x' });

    const yearly = (await (await authedRequest.get('/api/v1/statistics/trends?range=yearly')).json()).data;
    const thisYear = new Date().getUTCFullYear();
    expect(yearly.buckets.map((bucket: { start: string }) => bucket.start)).toEqual(
      Array.from({ length: thisYear - 2024 + 1 }, (_, i) => `${2024 + i}-01-01`),
    );
    expect(yearly.buckets[0]).toMatchObject({ minutesRead: 30, sessions: 1 });

    const allTime = (await (await authedRequest.get('/api/v1/statistics/trends?range=all-time')).json()).data;
    expect(allTime.buckets).toHaveLength(1);
    expect(allTime.buckets[0].start).toBe('2024-06-01');
    expect(allTime.totals).toMatchObject({ minutesRead: 45, sessions: 2 });
  });
});
