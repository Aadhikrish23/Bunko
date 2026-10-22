import type { SyncConflictPosition } from '../../lib/api/types';

// The most human-readable thing known about a position: its chapter, else
// its page, else the raw id.
export function describePosition(position: Pick<SyncConflictPosition, 'chapterLabel' | 'pageNumber' | 'structuralId'>): string {
  if (position.chapterLabel) return position.chapterLabel;
  if (position.pageNumber !== null) return `Page ${position.pageNumber}`;
  return position.structuralId ?? 'An unknown position';
}
