import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Shelf } from './types';

export function useShelves() {
  return useQuery({
    queryKey: ['shelves'],
    queryFn: () => api.get<Shelf[]>('/shelves'),
  });
}

export function useCreateShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Shelf>('/shelves', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shelves'] }),
  });
}

export function useDeleteShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shelfId: string) => api.delete(`/shelves/${shelfId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shelves'] }),
  });
}

export function useAssignWorkToShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shelfId, workId }: { shelfId: string; workId: string }) =>
      api.post(`/shelves/${shelfId}/works`, { workId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['works'] }),
  });
}

export function useRemoveWorkFromShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shelfId, workId }: { shelfId: string; workId: string }) =>
      api.delete(`/shelves/${shelfId}/works/${workId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['works'] }),
  });
}
