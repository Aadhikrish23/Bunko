import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDownload, readSnapshot, saveSnapshot } from '../offline/downloads';
import { isOfflineSessionId, OFFLINE_SESSION_PREFIX } from '../offline/local-sessions';
import { enqueue, pendingEvents } from '../offline/outbox';
import { applyPendingAnnotations } from '../offline/outbox-logic';
import { onlineOr } from '../offline/online-or';
import { api } from './client';
import type { Annotation, AnnotationKind, SearchResult } from './types';

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

// An offline session's id is "offline:<uuid>"; the server knows it by the
// bare uuid once it syncs.
function serverSessionId(sessionId: string | null | undefined): string | null {
  if (!sessionId) return null;
  return isOfflineSessionId(sessionId) ? sessionId.slice(OFFLINE_SESSION_PREFIX.length) : sessionId;
}

export function useAnnotations(editionId: string | undefined) {
  return useQuery({
    queryKey: ['annotations', editionId],
    queryFn: () =>
      onlineOr(
        async () => {
          const annotations = await api.get<Annotation[]>(`/editions/${editionId}/annotations`);
          // Keep a downloaded book's offline copy current.
          if (await getDownload(editionId!)) await saveSnapshot(`annotations:${editionId}`, annotations);
          return annotations;
        },
        async () =>
          applyPendingAnnotations(
            (await readSnapshot<Annotation[]>(`annotations:${editionId}`)) ?? [],
            await pendingEvents(),
            editionId!,
          ),
      ),
    enabled: !!editionId,
  });
}

export function useCreateAnnotation(editionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAnnotationInput) => {
      const queue = async () => {
        await enqueue('ANNOTATION_CREATED', {
          annotationId: crypto.randomUUID(),
          editionId,
          kind: input.kind,
          position: input.position,
          text: input.text,
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          sessionId: serverSessionId(input.sessionId),
        });
        return null;
      };
      // Made during a session that only exists on this device (even if the
      // network is back): queue it, so it reaches the server after that
      // session does.
      if (input.sessionId && isOfflineSessionId(input.sessionId)) return queue();
      return onlineOr(() => api.post<Annotation>(`/editions/${editionId}/annotations`, input), queue);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annotations', editionId] }),
  });
}

export function useUpdateAnnotation(editionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAnnotationInput & { id: string }) =>
      onlineOr(
        () => api.patch<Annotation>(`/annotations/${id}`, input),
        async () => {
          await enqueue('ANNOTATION_UPDATED', { annotationId: id, ...input });
          return null;
        },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annotations', editionId] }),
  });
}

export function useDeleteAnnotation(editionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      onlineOr(
        () => api.delete(`/annotations/${id}`),
        () => enqueue('ANNOTATION_DELETED', { annotationId: id }),
      ),
    // Gone from the list at once, so the next item never slides under a second click (R4-01);
    // put back if the delete fails.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['annotations', editionId] });
      const before = queryClient.getQueryData<Annotation[]>(['annotations', editionId]);
      queryClient.setQueryData<Annotation[]>(['annotations', editionId], (list) => list?.filter((a) => a.id !== id));
      return { before };
    },
    onError: (_err, _id, context) => {
      if (context?.before) queryClient.setQueryData(['annotations', editionId], context.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['annotations', editionId] }),
  });
}

export function useSearchAnnotations(q: string) {
  return useQuery({
    queryKey: ['annotations-search', q],
    queryFn: () => api.get<SearchResult[]>('/annotations/search', { q }),
    enabled: q.trim().length > 0,
  });
}
