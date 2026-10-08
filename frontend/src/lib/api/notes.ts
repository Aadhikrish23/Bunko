import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useCreateNote(workId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteInput) => api.post<Note>(`/works/${workId}/notes`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes', workId] }),
  });
}

export function useUpdateNote(workId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => api.patch<Note>(`/notes/${id}`, { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes', workId] }),
  });
}

export function useDeleteNote(workId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/notes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes', workId] }),
  });
}
