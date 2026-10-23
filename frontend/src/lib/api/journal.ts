import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { JournalEntry } from './types';

/** Removes a finished session logged by mistake; its highlights and notes stay. */
export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.delete(`/reading-sessions/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
    },
  });
}

export function useJournal(filter: { workId?: string; page?: number } = {}) {
  return useQuery({
    queryKey: ['journal', filter],
    queryFn: () => api.getPaginated<JournalEntry>('/journal', { ...filter }),
  });
}
