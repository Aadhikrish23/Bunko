import type { Annotation, Bookmark } from '../api/types';

export type SyncEventType =
  | 'SESSION_RECORDED'
  | 'ANNOTATION_CREATED'
  | 'ANNOTATION_UPDATED'
  | 'ANNOTATION_DELETED'
  | 'NOTE_CREATED'
  | 'NOTE_UPDATED'
  | 'NOTE_DELETED'
  | 'BOOKMARK_CREATED'
  | 'BOOKMARK_DELETED'
  | 'PREFERENCE_SET';

export interface OutboxEvent {
  seq?: number; // IndexedDB auto-increment: the replay order
  id: string; // client event id — what makes server replay idempotent
  type: SyncEventType;
  createdAt: string; // when the change happened on this device
  payload: Record<string, unknown>;
}

// What may be sent now: the longest in-order prefix with nothing tied to
// a still-open offline session. Stopping at the first held-back event
// (rather than skipping it) keeps replay strictly ordered — a later edit
// can never reach the server before the create it depends on.
export function flushablePrefix(events: OutboxEvent[], openSessionIds: Set<string>): OutboxEvent[] {
  const ordered = [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const prefix: OutboxEvent[] = [];
  for (const event of ordered) {
    const sessionId = event.payload.sessionId;
    if (typeof sessionId === 'string' && openSessionIds.has(sessionId)) break;
    prefix.push(event);
  }
  return prefix;
}

// Offline, an edition's annotation list is the last server snapshot with
// this device's not-yet-synced changes replayed on top, so what the
// reader made offline survives a reload.
export function applyPendingAnnotations(snapshot: Annotation[], events: OutboxEvent[], editionId: string): Annotation[] {
  let list = [...snapshot];
  for (const event of [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    const p = event.payload;
    if (event.type === 'ANNOTATION_CREATED' && p.editionId === editionId) {
      list = [
        {
          id: String(p.annotationId),
          copyId: String(p.copyId ?? ''),
          sessionId: (p.sessionId as string | null | undefined) ?? null,
          kind: p.kind as Annotation['kind'],
          position: String(p.position),
          text: String(p.text),
          color: (p.color as string | null | undefined) ?? null,
          note: (p.note as string | null | undefined) ?? null,
          tags: (p.tags as string[] | undefined) ?? [],
          createdAt: event.createdAt,
          updatedAt: event.createdAt,
        },
        ...list.filter((annotation) => annotation.id !== p.annotationId),
      ];
    } else if (event.type === 'ANNOTATION_UPDATED') {
      list = list.map((annotation) =>
        annotation.id === p.annotationId
          ? {
              ...annotation,
              ...(p.note !== undefined ? { note: p.note as string | null } : {}),
              ...(p.color !== undefined ? { color: p.color as string | null } : {}),
              updatedAt: event.createdAt,
            }
          : annotation,
      );
    } else if (event.type === 'ANNOTATION_DELETED') {
      list = list.filter((annotation) => annotation.id !== p.annotationId);
    }
  }
  return list;
}

export function applyPendingBookmarks(snapshot: Bookmark[], events: OutboxEvent[], editionId: string): Bookmark[] {
  let list = [...snapshot];
  for (const event of [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    const p = event.payload;
    if (event.type === 'BOOKMARK_CREATED' && p.editionId === editionId) {
      list = [
        ...list.filter((bookmark) => bookmark.id !== p.bookmarkId),
        {
          id: String(p.bookmarkId),
          copyId: String(p.copyId ?? ''),
          position: String(p.position),
          label: String(p.label),
          createdAt: event.createdAt,
        },
      ];
    } else if (event.type === 'BOOKMARK_DELETED') {
      list = list.filter((bookmark) => bookmark.id !== p.bookmarkId);
    }
  }
  return list;
}
