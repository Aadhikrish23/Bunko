import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { ReadingSession } from './types';

export function useStartSession() {
  return useMutation({
    mutationFn: (input: { copyId: string; startPosition?: string | null }) =>
      api.post<ReadingSession>('/reading-sessions', input),
  });
}

export function useReportProgress() {
  return useMutation({
    mutationFn: ({ sessionId, position }: { sessionId: string; position: string }) =>
      api.patch(`/reading-sessions/${sessionId}/progress`, { position }),
  });
}

export function usePauseSession() {
  return useMutation({
    mutationFn: (sessionId: string) => api.post<ReadingSession>(`/reading-sessions/${sessionId}/pause`),
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      endPosition,
      reflection,
    }: {
      sessionId: string;
      endPosition?: string;
      reflection?: string | null;
    }) => api.post<ReadingSession>(`/reading-sessions/${sessionId}/end`, { endPosition, reflection }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
    },
  });
}
