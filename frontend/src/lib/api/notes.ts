import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isOfflineSessionId, OFFLINE_SESSION_PREFIX } from '../offline/local-sessions';
import { enqueue } from '../offline/outbox';
import { onlineOr } from '../offline/online-or';
import { api } from './client';
import type { Note, NoteScope } from './types';

export interface CreateNoteInput {
  scope: NoteScope;
  body: string;
  position?: string;
  copyId?: string;
  sessionId?: string | null;
}

export function useNotes(workId: string | undefined) {
  return useQuery({
    queryKey: ['notes', workId],
    queryFn: () => api.get<Note[]>(`/works/${workId}/notes`),
    enabled: !!workId,
  });
}

// Offline (T-074), or made during a session that only exists on this
// device, a note is queued for sync instead — see useCreateAnnotation.
export function useCreateNote(workId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteInput) => {
      const localSession = !!input.sessionId && isOfflineSessionId(input.sessionId);
      const queue = async () => {
        await enqueue('NOTE_CREATED', {
          noteId: crypto.randomUUID(),
          workId,
          scope: input.scope,
          body: input.body,
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.copyId !== undefined ? { copyId: input.copyId } : {}),
          sessionId: localSession ? input.sessionId!.slice(OFFLINE_SESSION_PREFIX.length) : (input.sessionId ?? null),
        });
        return null;
      };
      if (localSession) return queue();
      return onlineOr(() => api.post<Note>(`/works/${workId}/notes`, input), queue);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes', workId] }),
  });
}

export function useUpdateNote(workId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      onlineOr(
        () => api.patch<Note>(`/notes/${id}`, { body }),
        async () => {
          await enqueue('NOTE_UPDATED', { noteId: id, body });
          return null;
        },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes', workId] }),
  });
}

export function useDeleteNote(workId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      onlineOr(
        () => api.delete(`/notes/${id}`),
        () => enqueue('NOTE_DELETED', { noteId: id }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes', workId] }),
  });
}
