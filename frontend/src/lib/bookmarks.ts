// Bookmarks are client-side only for MVP (T-031: "minimal manual
// bookmark ... within their own copy only") — there's no Bookmark table
// in DATA_MODEL.md, and adding one is more than "minimal" needs.
// Per-browser via localStorage trivially satisfies "their own copy
// only"; cross-device sync is Phase 9 territory (offline/sync), not
// this ticket's job.
export interface Bookmark {
  id: string;
  label: string;
  position: string;
  createdAt: string;
}

function storageKey(editionId: string): string {
  return `bunko:bookmarks:${editionId}`;
}

export function getBookmarks(editionId: string): Bookmark[] {
  try {
    const raw = localStorage.getItem(storageKey(editionId));
    return raw ? (JSON.parse(raw) as Bookmark[]) : [];
  } catch {
    return [];
  }
}

function save(editionId: string, bookmarks: Bookmark[]): void {
  try {
    localStorage.setItem(storageKey(editionId), JSON.stringify(bookmarks));
  } catch {
    // Private browsing / storage full — bookmarks are a convenience, not
    // a critical path.
  }
}

export function addBookmark(editionId: string, position: string, label: string): Bookmark[] {
  const next = [...getBookmarks(editionId), { id: crypto.randomUUID(), label, position, createdAt: new Date().toISOString() }];
  save(editionId, next);
  return next;
}

export function removeBookmark(editionId: string, bookmarkId: string): Bookmark[] {
  const next = getBookmarks(editionId).filter((bookmark) => bookmark.id !== bookmarkId);
  save(editionId, next);
  return next;
}
