import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Annotation, AnnotationKind } from './types';

export interface CreateAnnotationInput {
  kind: AnnotationKind;
  position: string;
  text: string;
  color?: string;
  note?: string;
  sessionId?: string | null;
}

export interface UpdateAnnotationInput {
  note?: string | null;
  color?: string | null;
}

export function useAnnotations(editionId: string | undefined) {
  return useQuery({
    queryKey: ['annotations', editionId],
    queryFn: () => api.get<Annotation[]>(`/editions/${editionId}/annotations`),
    enabled: !!editionId,
  });
}

export function useCreateAnnotation(editionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAnnotationInput) => api.post<Annotation>(`/editions/${editionId}/annotations`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annotations', editionId] }),
  });
}

export function useUpdateAnnotation(editionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAnnotationInput & { id: string }) =>
      api.patch<Annotation>(`/annotations/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annotations', editionId] }),
  });
}

export function useDeleteAnnotation(editionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/annotations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annotations', editionId] }),
  });
}
