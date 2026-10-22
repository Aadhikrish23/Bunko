import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadEdition, listDownloads, removeDownload, storageEstimate } from './downloads';

export function useDownloads() {
  return useQuery({ queryKey: ['offline-downloads'], queryFn: listDownloads, networkMode: 'always' });
}

export function useStorageEstimate() {
  return useQuery({ queryKey: ['offline-storage'], queryFn: storageEstimate, networkMode: 'always' });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['offline-downloads'] }),
      queryClient.invalidateQueries({ queryKey: ['offline-storage'] }),
    ]);
}

export function useDownloadEdition() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ editionId, title }: { editionId: string; title: string }) => downloadEdition(editionId, title),
    onSuccess: invalidate,
  });
}

export function useRemoveDownload() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: removeDownload, onSuccess: invalidate, networkMode: 'always' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
