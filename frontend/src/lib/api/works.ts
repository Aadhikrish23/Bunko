import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PaginatedResult } from './client';
import type { ReadingStatus, Work } from './types';

export interface WorksFilter {
  status?: ReadingStatus;
  shelfId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export function useWorks(filter: WorksFilter = {}) {
  return useQuery({
    queryKey: ['works', filter],
    queryFn: () => api.getPaginated<Work>('/works', { ...filter }),
    placeholderData: (previous) => previous as PaginatedResult<Work> | undefined,
  });
}

export function useWork(workId: string | undefined) {
  return useQuery({
    queryKey: ['works', workId],
    queryFn: () => api.get<Work>(`/works/${workId}`),
    enabled: Boolean(workId),
  });
}

export type CreateWorkInput =
  | { workId: string }
  | {
      title: string;
      authors?: string[];
      seriesName?: string | null;
      genres?: string[];
      coverImageUrl?: string | null;
      externalSource?: string | null;
      externalId?: string | null;
      description?: string | null;
      originalLanguage?: string | null;
      language?: string | null;
      partsCount?: number | null;
      chaptersCount?: number | null;
    };

export function useCreateWork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkInput) => api.post<Work>('/works', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['works'] });
    },
  });
}

export function useUpdateWorkStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workId, status }: { workId: string; status: ReadingStatus }) =>
      api.patch<Work>(`/works/${workId}`, { status }),
    // Show the new status at once; the server catches up (and wins) a moment later.
    onMutate: async ({ workId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['works', workId] });
      const previous = queryClient.getQueryData<Work>(['works', workId]);
      if (previous) queryClient.setQueryData<Work>(['works', workId], { ...previous, status });
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) queryClient.setQueryData(['works', variables.workId], context.previous);
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['works'] });
      queryClient.invalidateQueries({ queryKey: ['works', variables.workId] });
    },
  });
}

export function useDeleteWork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workId: string) => api.delete(`/works/${workId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['works'] });
    },
  });
}
