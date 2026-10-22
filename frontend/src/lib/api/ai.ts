import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { AiAnswer, AiExcerpt, AiInsights, AiRecommendations, AiStatus, AiSummary, ChapterTranslation } from './types';

export function useAiStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<AiStatus>('/ai/status') });
}

export function useSetAiConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (consent: { semanticSearch: boolean; generative: boolean; translation: boolean }) =>
      api.put<AiStatus>('/ai/consent', consent),
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

const TRANSLATION_POLL_MS = 3_000;

// The caller's translations of one edition into one language. Polls while
// any is still being translated, and stops once all have settled.
export function useTranslations(editionId: string | undefined, targetLanguage: string | null) {
  return useQuery({
    queryKey: ['translations', editionId, targetLanguage],
    queryFn: () =>
      api.get<ChapterTranslation[]>(`/ai/editions/${editionId}/translations`, { targetLanguage: targetLanguage! }),
    enabled: Boolean(editionId && targetLanguage),
    refetchInterval: (query) =>
      query.state.data?.some((translation) => translation.status === 'PENDING') ? TRANSLATION_POLL_MS : false,
    retry: false,
  });
}

// Sends the chapter's text to the provider, so only on an explicit action.
export function useRequestTranslation(editionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { structuralId: string; targetLanguage: string }) =>
      api.post<ChapterTranslation>(`/ai/editions/${editionId}/translations`, input),
    onSuccess: (_translation, input) =>
      queryClient.invalidateQueries({ queryKey: ['translations', editionId, input.targetLanguage] }),
  });
}
