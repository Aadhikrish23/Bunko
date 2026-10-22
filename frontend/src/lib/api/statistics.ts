import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { Statistics, TrendRange, Trends } from './types';

// Streak and trend day boundaries follow the zone the reader is viewing
// from (backend T-054), so a session at 00:30 local counts for that day.
function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

// Keys share the ['statistics'] prefix so ending a session (sessions.ts)
// invalidates both the totals and every trend range.
export function useStatistics() {
  const tz = browserTimeZone();
  return useQuery({
    queryKey: ['statistics', tz],
    queryFn: () => api.get<Statistics>('/statistics', { tz }),
  });
}

export function useTrends(range: TrendRange) {
  const tz = browserTimeZone();
  return useQuery({
    queryKey: ['statistics', 'trends', range, tz],
    queryFn: () => api.get<Trends>('/statistics/trends', { range, tz }),
    // Switching range keeps the previous chart on screen (dimmed) instead
    // of flashing a spinner.
    placeholderData: keepPreviousData,
  });
}
