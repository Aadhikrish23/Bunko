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

export interface ShelfArrangement {
  tabKey: string;
  workIds: string[];
}

// A reader's drag-reorder of one Shelves view, synced so it follows the
// account across devices — localStorage (shelf-order.ts) stays as the
// instant-write optimistic cache in front of this.
export function useShelfArrangement(tabKey: string) {
  return useQuery({
    queryKey: ['shelf-arrangement', tabKey],
    queryFn: () => api.get<ShelfArrangement>(`/shelves/arrangement/${encodeURIComponent(tabKey)}`),
  });
}

export function useSaveShelfArrangement() {
  return useMutation({
    mutationFn: ({ tabKey, workIds }: ShelfArrangement) =>
      api.put<ShelfArrangement>(`/shelves/arrangement/${encodeURIComponent(tabKey)}`, { workIds }),
  });
}
