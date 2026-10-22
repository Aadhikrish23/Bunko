import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Soundtrack, SoundtrackMapping, SoundtrackResolution, SoundtrackTargetType } from './types';

// `enabled` lets the reader skip these requests entirely until the
// soundtrack is actually in use.
export function useSoundtracks(enabled = true) {
  return useQuery({
    queryKey: ['soundtracks'],
    queryFn: () => api.get<Soundtrack[]>('/soundtracks'),
    enabled,
  });
}

export function useWorkSoundtrack(workId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['work-soundtrack', workId],
    queryFn: () => api.get<SoundtrackResolution>(`/works/${workId}/soundtrack`),
    enabled: enabled && !!workId,
  });
}

// Any change to playlists or associations can change what a book
// resolves to, so both caches refresh together.
function useInvalidateSoundtracks() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['soundtracks'] }),
      queryClient.invalidateQueries({ queryKey: ['work-soundtrack'] }),
    ]);
}

export function useCreateSoundtrack() {
  const invalidate = useInvalidateSoundtracks();
  return useMutation({
    mutationFn: (input: { name: string; url: string }) => api.post<Soundtrack>('/soundtracks', input),
    onSuccess: invalidate,
  });
}

export function useUpdateSoundtrack() {
  const invalidate = useInvalidateSoundtracks();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; url?: string }) =>
      api.patch<Soundtrack>(`/soundtracks/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteSoundtrack() {
  const invalidate = useInvalidateSoundtracks();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/soundtracks/${id}`),
    onSuccess: invalidate,
  });
}

export function useMapSoundtrack() {
  const invalidate = useInvalidateSoundtracks();
  return useMutation({
    mutationFn: (input: { soundtrackId: string; targetType: SoundtrackTargetType; targetKey: string }) =>
      api.put<SoundtrackMapping>('/soundtrack-mappings', input),
    onSuccess: invalidate,
  });
}

export function useUnmapSoundtrack() {
  const invalidate = useInvalidateSoundtracks();
  return useMutation({
    mutationFn: (mappingId: string) => api.delete(`/soundtrack-mappings/${mappingId}`),
    onSuccess: invalidate,
  });
}
