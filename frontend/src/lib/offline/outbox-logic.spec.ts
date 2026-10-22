import { test, expect } from '@playwright/test';
import type { Annotation } from '../api/types';
import { applyPendingAnnotations, applyPendingBookmarks, flushablePrefix, type OutboxEvent } from './outbox-logic';

function event(seq: number, type: OutboxEvent['type'], payload: Record<string, unknown>): OutboxEvent {
  return { seq, id: `e${seq}`, type, createdAt: `2026-10-22T10:0${seq}:00.000Z`, payload };
}

const annotation: Annotation = {
  id: 'a1',
  copyId: 'c1',
  sessionId: null,
  kind: 'HIGHLIGHT',
  position: 'ch1',
  text: 'synced',
  color: 'yellow',
  note: null,
  tags: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

test.describe('flushablePrefix', () => {
  test('sends everything, in sequence order, when no offline session is open', () => {
    const events = [event(2, 'NOTE_DELETED', { noteId: 'n' }), event(1, 'BOOKMARK_DELETED', { bookmarkId: 'b' })];
    expect(flushablePrefix(events, new Set()).map((e) => e.seq)).toEqual([1, 2]);
  });

  test('stops at the first event tied to an open session, holding back everything after it', () => {
    const events = [
      event(1, 'PREFERENCE_SET', { key: 'reader-settings', value: {} }),
      event(2, 'ANNOTATION_CREATED', { annotationId: 'a', sessionId: 'open' }),
      event(3, 'ANNOTATION_UPDATED', { annotationId: 'a', note: 'x' }),
    ];
    expect(flushablePrefix(events, new Set(['open'])).map((e) => e.seq)).toEqual([1]);
    expect(flushablePrefix(events, new Set()).map((e) => e.seq)).toEqual([1, 2, 3]);
  });
});

test.describe('applyPendingAnnotations', () => {
  test('replays creates, edits, and deletes for this edition onto the snapshot', () => {
    const result = applyPendingAnnotations(
      [annotation],
      [
        event(1, 'ANNOTATION_CREATED', { annotationId: 'a2', editionId: 'ed1', kind: 'QUOTE', position: 'ch2', text: 'offline' }),
        event(2, 'ANNOTATION_UPDATED', { annotationId: 'a1', note: 'edited offline' }),
        event(3, 'ANNOTATION_CREATED', { annotationId: 'a3', editionId: 'other', kind: 'HIGHLIGHT', position: 'x', text: 'x' }),
        event(4, 'ANNOTATION_DELETED', { annotationId: 'a2' }),
      ],
      'ed1',
    );
    expect(result.map((a) => a.id)).toEqual(['a1']);
    expect(result[0]!.note).toBe('edited offline');
  });

  test('an offline create shows newest first, like the server list', () => {
    const result = applyPendingAnnotations(
      [annotation],
      [event(1, 'ANNOTATION_CREATED', { annotationId: 'a2', editionId: 'ed1', kind: 'HIGHLIGHT', position: 'ch2', text: 'new' })],
      'ed1',
    );
    expect(result.map((a) => a.id)).toEqual(['a2', 'a1']);
  });
});

test.describe('applyPendingBookmarks', () => {
  test('adds offline bookmarks for this edition and drops deleted ones', () => {
    const result = applyPendingBookmarks(
      [{ id: 'b1', copyId: 'c1', position: 'ch1', label: 'One', createdAt: '2026-10-01T00:00:00.000Z' }],
      [
        event(1, 'BOOKMARK_CREATED', { bookmarkId: 'b2', editionId: 'ed1', position: 'ch4', label: 'Four' }),
        event(2, 'BOOKMARK_DELETED', { bookmarkId: 'b1' }),
      ],
      'ed1',
    );
    expect(result.map((b) => `${b.id}:${b.label}`)).toEqual(['b2:Four']);
  });
});
