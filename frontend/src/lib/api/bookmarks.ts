import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDownload, readSnapshot, saveSnapshot } from '../offline/downloads';
import { enqueue, pendingEvents } from '../offline/outbox';
import { applyPendingBookmarks } from '../offline/outbox-logic';
import { onlineOr } from '../offline/online-or';
import { api } from './client';
import type { Bookmark } from './types';

// Before Phase 9, bookmarks lived only in this browser's localStorage.
// The first online load of an edition uploads them (with their original
// ids, so a retry can't duplicate them) and only then forgets them.
const LEGACY_KEY = (editionId: string) => `bunko:bookmarks:${editionId}`;

interface LegacyBookmark {
  id: string;
  label: string;
  position: string;
}

async function importLegacyBookmarks(editionId: string): Promise<boolean> {
  let legacy: LegacyBookmark[] = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY(editionId)) ?? '[]') as LegacyBookmark[];
  } catch {
    return false;
  }
  if (!Array.isArray(legacy) || legacy.length === 0) return false;
  for (const bookmark of legacy) {
    await api.post(`/editions/${editionId}/bookmarks`, {
      id: bookmark.id,
      label: String(bookmark.label).slice(0, 120) || 'Bookmark',
      position: bookmark.position,
    });
  }
  localStorage.removeItem(LEGACY_KEY(editionId));
  return true;
}

export function useBookmarks(editionId: string | undefined) {
  return useQuery({
    queryKey: ['bookmarks', editionId],
    queryFn: () =>
      onlineOr(
        async () => {
          await importLegacyBookmarks(editionId!);
          const bookmarks = await api.get<Bookmark[]>(`/editions/${editionId}/bookmarks`);
          if (await getDownload(editionId!)) await saveSnapshot(`bookmarks:${editionId}`, bookmarks);
          return bookmarks;
        },
        async () =>
          applyPendingBookmarks(
            (await readSnapshot<Bookmark[]>(`bookmarks:${editionId}`)) ?? [],
            await pendingEvents(),
            editionId!,
          ),
      ),
    enabled: !!editionId,
  });
}

export function useAddBookmark(editionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ position, label }: { position: string; label: string }) => {
      const id = crypto.randomUUID();
      return onlineOr(
        () => api.post<Bookmark>(`/editions/${editionId}/bookmarks`, { id, position, label }),
        async () => {
          await enqueue('BOOKMARK_CREATED', { bookmarkId: id, editionId, position, label });
          return null;
        },
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks', editionId] }),
  });
}

export function useRemoveBookmark(editionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      onlineOr(
        () => api.delete(`/bookmarks/${id}`),
        () => enqueue('BOOKMARK_DELETED', { bookmarkId: id }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks', editionId] }),
  });
}
