import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { AiAnswer, AiExcerpt, AiInsights, AiRecommendations, AiStatus, AiSummary } from './types';

export function useAiStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<AiStatus>('/ai/status') });
}

export function useSetAiConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (consent: { semanticSearch: boolean; generative: boolean }) => api.put<AiStatus>('/ai/consent', consent),
    onSuccess: (status) => queryClient.setQueryData(['ai-status'], status),
  });
}

export function useAiSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ai-search', q],
    queryFn: () => api.get<{ results: AiExcerpt[] }>('/ai/search', { q }),
    enabled: enabled && q.trim().length > 0,
    retry: false,
  });
}

// Generation costs money and sends data to the provider, so it only ever
// runs on an explicit action — mutations, never auto-fetching queries.
export function useAsk() {
  return useMutation({ mutationFn: (question: string) => api.post<AiAnswer>('/ai/ask', { question }) });
}

export function useWorkSummary(workId: string) {
  return useMutation({ mutationFn: () => api.post<AiSummary>(`/ai/works/${workId}/summary`) });
}

export function useInsights() {
  return useMutation({ mutationFn: () => api.post<AiInsights>('/ai/insights') });
}

export function useRecommendations() {
  return useMutation({ mutationFn: () => api.post<AiRecommendations>('/ai/recommendations') });
}
