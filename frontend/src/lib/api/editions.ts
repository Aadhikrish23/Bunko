import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Copy, EditionFormat, EditionSummary } from './types';

export function useCreateEdition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { workId: string; format: EditionFormat; publisher?: string | null }) =>
      api.post<EditionSummary>('/editions', input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['works', variables.workId] });
    },
  });
}

export function useCreateCopy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { editionId: string; digitalFileId?: string | null }) => api.post<Copy>('/copies', input),
    onSuccess: () => {
      // The mutation only knows editionId, not which work it belongs to
      // — invalidate broadly (matches the list and every work detail
      // query) rather than threading workId through just for this.
      queryClient.invalidateQueries({ queryKey: ['works'] });
    },
  });
}
