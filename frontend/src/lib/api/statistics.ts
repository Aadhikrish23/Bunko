import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { BasicStatistics } from './types';

export function useStatistics() {
  return useQuery({
    queryKey: ['statistics'],
    queryFn: () => api.get<BasicStatistics>('/statistics'),
  });
}
