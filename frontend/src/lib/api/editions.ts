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
  return useMutation({
    mutationFn: (input: { editionId: string; digitalFileId?: string | null }) => api.post<Copy>('/copies', input),
  });
}
