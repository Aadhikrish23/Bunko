import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { JournalEntry } from './types';

export function useJournal(filter: { workId?: string; page?: number } = {}) {
  return useQuery({
    queryKey: ['journal', filter],
    queryFn: () => api.getPaginated<JournalEntry>('/journal', { ...filter }),
  });
}
