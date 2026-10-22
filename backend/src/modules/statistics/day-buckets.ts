// Day-bucketing for streaks and trends (T-054). Sessions are assigned to
// the calendar day the *reader* experienced, in an IANA time zone the
// client sends with each request (`?tz=`), rather than a bare UTC slice of
// the timestamp — which put a session at 00:30 IST on the previous day.
//
// Two-step design keeps DST out of the arithmetic entirely:
//   1. timestamp -> local calendar date key ("YYYY-MM-DD") via Intl, which
//      applies the zone's real offset (DST included) for that instant;
//   2. all further math (previous day, consecutive runs, week/month starts)
//      runs on those plain calendar dates in UTC, where every day is
//      exactly 24h.
//
// Request-supplied rather than a stored User.timezone: no schema change,
// and it matches what the person sees on the device they're looking at.
// Trade-off: sessions logged while travelling are bucketed by the zone
// in effect when the stats are viewed, not where the reading happened.

export const DEFAULT_TIME_ZONE = 'UTC';

const DAY_MS = 86_400_000;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function toLocalDateKey(instant: Date, timeZone: string): string {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function keyToUtcMs(key: string): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

function utcMsToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  return utcMsToKey(keyToUtcMs(key) + days * DAY_MS);
}

// ISO weeks: Monday is the first day.
export function startOfWeek(key: string): string {
  const weekday = new Date(keyToUtcMs(key)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((weekday + 6) % 7));
}

export function startOfMonth(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function startOfYear(key: string): string {
  return `${key.slice(0, 4)}-01-01`;
}

export function addMonths(monthStartKey: string, months: number): string {
  const year = Number(monthStartKey.slice(0, 4));
  const month = Number(monthStartKey.slice(5, 7));
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
}

// A day with no session yet doesn't break the streak until it's over, so
// a streak may end yesterday as well as today.
export function computeCurrentStreak(dayKeys: Set<string>, todayKey: string): number {
  let cursor = todayKey;
  if (!dayKeys.has(cursor)) {
    cursor = addDays(cursor, -1);
    if (!dayKeys.has(cursor)) return 0;
  }
  let streak = 0;
  while (dayKeys.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function computeLongestStreak(dayKeys: Set<string>): number {
  const sorted = [...dayKeys].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of sorted) {
    run = previous !== null && addDays(previous, 1) === key ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = key;
  }
  return longest;
}
