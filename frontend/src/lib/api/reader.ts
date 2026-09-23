import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { ChaptersResponse, ReaderManifest } from './types';

export function useReaderManifest(editionId: string | undefined) {
  return useQuery({
    queryKey: ['reader-manifest', editionId],
    queryFn: () => api.get<ReaderManifest>(`/editions/${editionId}/reader-manifest`),
    enabled: Boolean(editionId),
    staleTime: 0, // always re-fetch on open — this call also auto-starts a session
    retry: false,
  });
}

export function useChapters(editionId: string | undefined) {
  return useQuery({
    queryKey: ['chapters', editionId],
    queryFn: () => api.get<ChaptersResponse>(`/editions/${editionId}/chapters`),
    enabled: Boolean(editionId),
    staleTime: 5 * 60 * 1000, // chapter text doesn't change once indexed
  });
}
