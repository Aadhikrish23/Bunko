import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endAllLocalSessions, endLocalSession, isOfflineSessionId, recordLocalProgress } from '../offline/local-sessions';
import { onlineOr } from '../offline/online-or';
import { api } from './client';
import type { ReadingSession } from './types';

/** The session still open for a copy (survives a page refresh), or null. */
export function useOpenSession(copyId: string | undefined) {
  return useQuery({
    queryKey: ['open-session', copyId],
    queryFn: () => api.get<ReadingSession | null>('/reading-sessions/open', { copyId: copyId! }),
    enabled: Boolean(copyId),
  });
}

export function useStartSession() {
  return useMutation({
    mutationFn: (input: { copyId: string; startPosition?: string | null }) =>
      api.post<ReadingSession>('/reading-sessions', input),
  });
}

// An "offline:" session (T-074) never touches the server until it ends;
// its progress is kept on the device.
export function useReportProgress() {
  return useMutation({
    mutationFn: ({ sessionId, position }: { sessionId: string; position: string }) =>
      isOfflineSessionId(sessionId)
        ? recordLocalProgress(sessionId, position)
        : api.patch(`/reading-sessions/${sessionId}/progress`, { position }),
  });
}

export function usePauseSession() {
  return useMutation({
    mutationFn: (sessionId: string) => api.post<ReadingSession>(`/reading-sessions/${sessionId}/pause`),
  });
}

export function usePauseActiveSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      onlineOr(
        async () => {
          await endAllLocalSessions();
          return api.post<ReadingSession | null>('/reading-sessions/pause-active');
        },
        async () => {
          await endAllLocalSessions();
          return null;
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal'] });
    },
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      endPosition,
      reflection,
    }: {
      sessionId: string;
      endPosition?: string;
      reflection?: string | null;
    }): Promise<Pick<ReadingSession, 'durationSeconds'>> => {
      if (isOfflineSessionId(sessionId)) {
        const ended = await endLocalSession(sessionId, { endPosition, reflection });
        return { durationSeconds: ended?.durationSeconds ?? null };
      }
      return api.post<ReadingSession>(`/reading-sessions/${sessionId}/end`, { endPosition, reflection });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      queryClient.invalidateQueries({ queryKey: ['open-session'] });
    },
  });
}

/** A session that already happened ("40 min last night, pages 80 to 112"). */
export function useLogSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      copyId: string;
      endedAt?: string;
      minutes: number;
      startPosition?: string | null;
      endPosition?: string | null;
      reflection?: string | null;
    }) => api.post<ReadingSession>('/reading-sessions/log', input),
    onSuccess: () => {
      for (const queryKey of [['journal'], ['statistics'], ['works']]) void queryClient.invalidateQueries({ queryKey });
    },
  });
}
