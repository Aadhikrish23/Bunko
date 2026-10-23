import { Prisma } from '@prisma/client';
import { normalizeLanguageName } from '../metadata/metadata.service';
import { prisma } from '../../config/prisma';
import {
  addDays,
  addMonths,
  computeCurrentStreak,
  computeLongestStreak,
  startOfMonth,
  startOfWeek,
  startOfYear,
  toLocalDateKey,
} from './day-buckets';
import { computePace, type PaceStats } from './pace';
import { buildEditionIndex, estimatePagesBySession, type EditionIndex, type UnitInfo } from './progress';

// `label` null = the book has no value for that dimension (no genre, no
// author, unknown language) — the client decides how to word "unknown".
export interface BreakdownEntry {
  label: string | null;
  count: number;
}

export interface Breakdowns {
  byGenre: BreakdownEntry[];
  byAuthor: BreakdownEntry[];
  byLanguage: BreakdownEntry[];
  byFormat: BreakdownEntry[];
}

// SRS §19.1. Counts in `breakdowns` are books in the caller's library
// (any reading status); a book with copies in two formats counts once in
// each format.
export interface Statistics {
  booksCompleted: number;
  totalMinutesRead: number;
  totalSessions: number;
  averageSessionMinutes: number | null;
  pagesRead: number;
  currentStreakDays: number;
  longestStreakDays: number;
  pace: PaceStats;
  breakdowns: Breakdowns;
}

export type TrendRange = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all-time';

export interface TrendBucket {
  start: string; // YYYY-MM-DD, first local day of the bucket
  minutesRead: number;
  sessions: number;
  pagesRead: number;
}

export interface Trends {
  range: TrendRange;
  timeZone: string;
  buckets: TrendBucket[];
  totals: Omit<TrendBucket, 'start'>;
}

interface EndedSession {
  id: string;
  copyId: string;
  startTime: Date;
  durationSeconds: number | null;
  startPosition: string | null;
  endPosition: string | null;
}

interface UnitRow extends UnitInfo {
  editionId: string;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

// Only the per-unit metadata page estimation needs (order, page number,
// text length) — pulled out in SQL so a stats request never ships every
// chapter's full text from Edition.chapterGraph.
async function loadEditionIndexes(copyIds: string[]): Promise<Map<string, EditionIndex | null>> {
  if (copyIds.length === 0) return new Map();

  const copies = await prisma.copy.findMany({
    where: { id: { in: copyIds } },
    select: { id: true, editionId: true, edition: { select: { format: true } } },
  });
  const editionIds = [...new Set(copies.map((copy) => copy.editionId))];

  const unitRows = await prisma.$queryRaw<UnitRow[]>(Prisma.sql`
    SELECT e.id AS "editionId",
           u->>'structuralId' AS "structuralId",
           (u->>'order')::int AS "order",
           (u->>'pageNumber')::int AS "pageNumber",
           length(coalesce(u->>'text', ''))::int AS "textLength"
    FROM "Edition" e
    CROSS JOIN LATERAL jsonb_array_elements(e."chapterGraph"->'units') AS u
    WHERE e.id IN (${Prisma.join(editionIds)})
  `);

  const unitsByEdition = new Map<string, UnitInfo[]>();
  for (const row of unitRows) {
    const list = unitsByEdition.get(row.editionId) ?? [];
    list.push(row);
    unitsByEdition.set(row.editionId, list);
  }

  const indexByEdition = new Map<string, EditionIndex>();
  const result = new Map<string, EditionIndex | null>();
  for (const copy of copies) {
    let index = indexByEdition.get(copy.editionId);
    if (!index) {
      index = buildEditionIndex(copy.edition.format, unitsByEdition.get(copy.editionId) ?? []);
      indexByEdition.set(copy.editionId, index);
    }
    result.set(copy.id, index);
  }
  return result;
}

async function loadEndedSessions(
  userId: string,
): Promise<{ sessions: EndedSession[]; pagesBySession: Map<string, number | null> }> {
  const sessions = await prisma.readingSession.findMany({
    where: { userId, status: 'ENDED' },
    select: {
      id: true,
      copyId: true,
      startTime: true,
      durationSeconds: true,
      startPosition: true,
      endPosition: true,
    },
    orderBy: { startTime: 'asc' },
  });
  const indexByCopyId = await loadEditionIndexes([...new Set(sessions.map((session) => session.copyId))]);
  return { sessions, pagesBySession: estimatePagesBySession(sessions, indexByCopyId) };
}

function toEntries(counts: Map<string | null, number>): BreakdownEntry[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.label === null) return 1;
      if (b.label === null) return -1;
      return a.label.localeCompare(b.label);
    });
}

function increment(counts: Map<string | null, number>, label: string | null): void {
  counts.set(label, (counts.get(label) ?? 0) + 1);
}

async function loadBreakdowns(userId: string): Promise<Breakdowns> {
  const [userWorks, copies] = await Promise.all([
    prisma.userWork.findMany({
      where: { userId },
      select: {
        workId: true,
        work: {
          select: {
            genres: true,
            language: true,
            authors: { select: { author: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.copy.findMany({
      where: { userId },
      select: { edition: { select: { workId: true, format: true, language: true } } },
    }),
  ]);

  const formatsByWork = new Map<string, Set<string>>();
  const editionLanguageByWork = new Map<string, string>();
  for (const { edition } of copies) {
    const formats = formatsByWork.get(edition.workId) ?? new Set<string>();
    formats.add(edition.format);
    formatsByWork.set(edition.workId, formats);
    if (edition.language && !editionLanguageByWork.has(edition.workId)) {
      editionLanguageByWork.set(edition.workId, edition.language);
    }
  }

  const byGenre = new Map<string | null, number>();
  const byAuthor = new Map<string | null, number>();
  const byLanguage = new Map<string | null, number>();
  const byFormat = new Map<string | null, number>();

  for (const { workId, work } of userWorks) {
    if (work.genres.length === 0) increment(byGenre, null);
    for (const genre of new Set(work.genres)) increment(byGenre, genre);

    if (work.authors.length === 0) increment(byAuthor, null);
    for (const name of new Set(work.authors.map((entry) => entry.author.name))) increment(byAuthor, name);

    // "english", "en" and "English" are one language.
    increment(byLanguage, normalizeLanguageName(work.language ?? editionLanguageByWork.get(workId) ?? null));

    for (const format of formatsByWork.get(workId) ?? []) increment(byFormat, format);
  }

  return {
    byGenre: toEntries(byGenre),
    byAuthor: toEntries(byAuthor),
    byLanguage: toEntries(byLanguage),
    byFormat: toEntries(byFormat),
  };
}

export async function getStatistics(userId: string, timeZone: string, now: Date = new Date()): Promise<Statistics> {
  const [booksCompleted, { sessions, pagesBySession }, breakdowns] = await Promise.all([
    prisma.userWork.count({ where: { userId, status: 'FINISHED' } }),
    loadEndedSessions(userId),
    loadBreakdowns(userId),
  ]);

  const totalSeconds = sessions.reduce((sum, session) => sum + (session.durationSeconds ?? 0), 0);
  const knownPages = [...pagesBySession.values()].filter((pages): pages is number => pages !== null);
  const dayKeys = new Set(sessions.map((session) => toLocalDateKey(session.startTime, timeZone)));

  return {
    booksCompleted,
    totalMinutesRead: Math.round(totalSeconds / 60),
    totalSessions: sessions.length,
    averageSessionMinutes: sessions.length > 0 ? roundToTenth(totalSeconds / 60 / sessions.length) : null,
    pagesRead: Math.round(knownPages.reduce((sum, pages) => sum + pages, 0)),
    currentStreakDays: computeCurrentStreak(dayKeys, toLocalDateKey(now, timeZone)),
    longestStreakDays: computeLongestStreak(dayKeys),
    pace: computePace(
      sessions.map((session) => ({
        pages: pagesBySession.get(session.id) ?? null,
        durationSeconds: session.durationSeconds,
      })),
    ),
    breakdowns,
  };
}

const DAILY_BUCKETS = 30;
const WEEKLY_BUCKETS = 12;
const MONTHLY_BUCKETS = 12;

function bucketStarts(range: TrendRange, todayKey: string, firstDayKey: string | null): string[] {
  switch (range) {
    case 'daily':
      return Array.from({ length: DAILY_BUCKETS }, (_, i) => addDays(todayKey, i - (DAILY_BUCKETS - 1)));
    case 'weekly': {
      const thisWeek = startOfWeek(todayKey);
      return Array.from({ length: WEEKLY_BUCKETS }, (_, i) => addDays(thisWeek, (i - (WEEKLY_BUCKETS - 1)) * 7));
    }
    case 'monthly': {
      const thisMonth = startOfMonth(todayKey);
      return Array.from({ length: MONTHLY_BUCKETS }, (_, i) => addMonths(thisMonth, i - (MONTHLY_BUCKETS - 1)));
    }
    case 'yearly': {
      const thisYear = Number(todayKey.slice(0, 4));
      const firstYear = firstDayKey ? Math.min(Number(firstDayKey.slice(0, 4)), thisYear) : thisYear;
      return Array.from({ length: thisYear - firstYear + 1 }, (_, i) => `${firstYear + i}-01-01`);
    }
    case 'all-time':
      return [firstDayKey ?? todayKey];
  }
}

function bucketKeyFor(range: TrendRange, dayKey: string, allTimeKey: string): string {
  switch (range) {
    case 'daily':
      return dayKey;
    case 'weekly':
      return startOfWeek(dayKey);
    case 'monthly':
      return startOfMonth(dayKey);
    case 'yearly':
      return startOfYear(dayKey);
    case 'all-time':
      return allTimeKey;
  }
}

// SRS §19.2. A session belongs to the bucket of the local day it started
// in, even if it ran past midnight. Totals cover only the returned window
// (e.g. the last 30 days for `daily`), not all history.
export async function getTrends(
  userId: string,
  range: TrendRange,
  timeZone: string,
  now: Date = new Date(),
): Promise<Trends> {
  const { sessions, pagesBySession } = await loadEndedSessions(userId);
  const todayKey = toLocalDateKey(now, timeZone);
  const dayKeyBySession = new Map(sessions.map((session) => [session.id, toLocalDateKey(session.startTime, timeZone)]));
  const firstDayKey = [...dayKeyBySession.values()].sort()[0] ?? null;

  const starts = bucketStarts(range, todayKey, firstDayKey);
  const allTimeKey = starts[0] ?? todayKey;
  const buckets = new Map<string, TrendBucket>(
    starts.map((start) => [start, { start, minutesRead: 0, sessions: 0, pagesRead: 0 }]),
  );
  const secondsByBucket = new Map<string, number>();

  for (const session of sessions) {
    const bucket = buckets.get(bucketKeyFor(range, dayKeyBySession.get(session.id)!, allTimeKey));
    if (!bucket) continue; // outside the window
    bucket.sessions += 1;
    bucket.pagesRead += pagesBySession.get(session.id) ?? 0;
    secondsByBucket.set(bucket.start, (secondsByBucket.get(bucket.start) ?? 0) + (session.durationSeconds ?? 0));
  }

  const ordered = starts.map((start) => {
    const bucket = buckets.get(start)!;
    return {
      ...bucket,
      minutesRead: Math.round((secondsByBucket.get(start) ?? 0) / 60),
      pagesRead: Math.round(bucket.pagesRead),
    };
  });

  return {
    range,
    timeZone,
    buckets: ordered,
    totals: {
      minutesRead: ordered.reduce((sum, bucket) => sum + bucket.minutesRead, 0),
      sessions: ordered.reduce((sum, bucket) => sum + bucket.sessions, 0),
      pagesRead: ordered.reduce((sum, bucket) => sum + bucket.pagesRead, 0),
    },
  };
}
