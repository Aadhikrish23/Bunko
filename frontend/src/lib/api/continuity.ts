import { useMutation } from '@tanstack/react-query';
import { api } from './client';
import type { ResolvedPosition } from './types';

export function useResolvePosition() {
  return useMutation({
    mutationFn: ({ journeyId, targetEditionId }: { journeyId: string; targetEditionId: string }) =>
      api.post<ResolvedPosition>(`/reading-journeys/${journeyId}/resolve-position`, { targetEditionId }),
  });
}

export function useCorrectPosition() {
  return useMutation({
    mutationFn: ({
      journeyId,
      structuralId,
      chapterLabel,
      pageNumber,
    }: {
      journeyId: string;
      structuralId?: string | null;
      chapterLabel?: string | null;
      pageNumber?: number | null;
    }) => api.post(`/reading-journeys/${journeyId}/position`, { structuralId, chapterLabel, pageNumber }),
  });
}
