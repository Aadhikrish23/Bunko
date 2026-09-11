import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { MetadataCandidate } from './types';

export function useMetadataSearch(query: string) {
  return useQuery({
    queryKey: ['metadata-search', query],
    queryFn: () => api.get<MetadataCandidate[]>('/metadata/search', { q: query }),
    enabled: query.trim().length > 0,
  });
}
