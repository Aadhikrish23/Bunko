import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { MetadataCandidate } from './types';

export function useMetadataSearch(query: string, lang?: string) {
  return useQuery({
    queryKey: ['metadata-search', query, lang],
    queryFn: () => api.get<MetadataCandidate[]>('/metadata/search', { q: query, ...(lang && lang !== 'all' ? { lang } : {}) }),
    enabled: query.trim().length > 0,
  });
}
