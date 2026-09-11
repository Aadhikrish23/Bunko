import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { ReadingSession } from './types';

export function useJournal(filter: { workId?: string; page?: number } = {}) {
  return useQuery({
    queryKey: ['journal', filter],
    queryFn: () => api.getPaginated<ReadingSession>('/journal', { ...filter }),
  });
}
