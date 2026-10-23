import type { TrendRange } from '../../lib/api/types';

// Clean y-axis ticks for whole-number data: 0 up to a round top, in steps
// of 1, 2, or 5 × 10^k, aiming for about four intervals.
export function niceTicks(max: number, targetIntervals = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / targetIntervals;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((factor) => factor * magnitude).find((s) => s >= rough) ?? magnitude * 10);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return ticks;
}

export function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands.toFixed(thousands < 10 ? 1 : 0).replace(/\.0$/, '')}K`;
}

export function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

// Bucket starts are calendar dates (YYYY-MM-DD) already in the reader's
// zone, so they're formatted in UTC to avoid shifting them a day.
function dateFormatter(locale: string | undefined, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options });
}

export function bucketLabel(
  start: string,
  range: TrendRange,
  variant: 'axis' | 'full',
  locale?: string,
): string {
  const date = new Date(`${start}T00:00:00Z`);
  switch (range) {
    case 'daily':
      return variant === 'axis'
        ? dateFormatter(locale, { month: 'short', day: 'numeric' }).format(date)
        : dateFormatter(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    case 'weekly':
      return variant === 'axis'
        ? dateFormatter(locale, { month: 'short', day: 'numeric' }).format(date)
        : `Week of ${dateFormatter(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)}`;
    case 'monthly':
      return variant === 'axis'
        ? dateFormatter(locale, { month: 'short' }).format(date)
        : dateFormatter(locale, { month: 'long', year: 'numeric' }).format(date);
    case 'yearly':
      return start.slice(0, 4);
    case 'all-time':
      return `Since ${dateFormatter(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)}`;
  }
}

// About six evenly spaced x-axis labels, always including the most recent
// bucket so "now" is anchored.
export function axisLabelIndices(count: number): Set<number> {
  const step = Math.max(1, Math.ceil(count / 6));
  const indices = new Set<number>();
  for (let i = count - 1; i >= 0; i -= step) indices.add(i);
  return indices;
}

export const RANGE_WINDOW_LABEL: Record<TrendRange, string> = {
  daily: 'in the last 30 days',
  weekly: 'in the last 12 weeks',
  monthly: 'in the last 12 months',
  yearly: 'across all years',
  'all-time': 'all time',
};

const languageNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' });
  } catch {
    return null;
  }
})();

// Metadata providers give ISO codes ("en", "eng"); show a readable name
// when the code is one Intl knows, and the raw value otherwise.
// The server sends a language name ("English") or, for older data, a code ("en", "pt-BR").
// Only a code is looked up: Intl reads "english" as a valid subtag and hands it back as-is.
export function languageLabel(value: string): string {
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(value)) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  try {
    return languageNames?.of(value) ?? value;
  } catch {
    return value;
  }
}
