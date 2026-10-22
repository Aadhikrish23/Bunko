import { useQuery } from '@tanstack/react-query';
import { getDownload, objectUrlFor } from '../offline/downloads';
import { startLocalSession } from '../offline/local-sessions';
import { onlineOr } from '../offline/online-or';
import { api } from './client';
import type { ChaptersResponse, ReaderManifest } from './types';

export class NotDownloadedError extends Error {
  constructor() {
    super('You’re offline, and this book isn’t downloaded. Download it while online to read it offline.');
    this.name = 'NotDownloadedError';
  }
}

// Offline (T-074): open the downloaded copy with a local session instead.
// The readers already remember their last position per edition locally,
// so startPosition is left to them.
async function offlineManifest(editionId: string): Promise<ReaderManifest> {
  const download = await getDownload(editionId);
  if (!download) throw new NotDownloadedError();
  const sessionId = await startLocalSession({ editionId, copyId: download.copyId, startPosition: null });
  return {
    fileUrl: objectUrlFor(download),
    format: download.format,
    startPosition: null,
    confidence: null,
    sessionId,
    workId: download.workId,
    copyId: download.copyId,
    offline: true,
  };
}

export function useReaderManifest(editionId: string | undefined) {
  return useQuery({
    queryKey: ['reader-manifest', editionId],
    queryFn: () =>
      onlineOr(
        () => api.get<ReaderManifest>(`/editions/${editionId}/reader-manifest`),
        () => offlineManifest(editionId!),
      ),
    enabled: Boolean(editionId),
    staleTime: 0, // always re-fetch on open — this call also auto-starts a session
    retry: false,
  });
}

export function useChapters(editionId: string | undefined) {
  return useQuery({
    queryKey: ['chapters', editionId],
    queryFn: () =>
      onlineOr(
        () => api.get<ChaptersResponse>(`/editions/${editionId}/chapters`),
        async () => {
          const chapters = (await getDownload(editionId!))?.chapters;
          if (!chapters) throw new NotDownloadedError();
          return chapters;
        },
      ),
    enabled: Boolean(editionId),
    staleTime: 5 * 60 * 1000, // chapter text doesn't change once indexed
  });
}
