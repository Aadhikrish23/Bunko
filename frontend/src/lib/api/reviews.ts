import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './client';
import type { Review } from './types';

export interface UpsertReviewInput {
  rating: number | null;
  body?: string | null;
  isFavourite?: boolean;
  rereadIntention?: boolean;
}

// One review per user per work — "no review yet" is a 404 from the API,
// which here is an ordinary empty state, not an error.
export function useReview(workId: string | undefined) {
  return useQuery({
    queryKey: ['review', workId],
    queryFn: async () => {
      try {
        return await api.get<Review>(`/works/${workId}/review`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!workId,
  });
}

export function useUpsertReview(workId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertReviewInput) => api.put<Review>(`/works/${workId}/review`, input),
    onSuccess: (review) => queryClient.setQueryData(['review', workId], review),
  });
}

export function useDeleteReview(workId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/works/${workId}/review`),
    onSuccess: () => queryClient.setQueryData(['review', workId], null),
  });
}
