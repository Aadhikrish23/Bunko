// "Pages read" estimation for statistics (T-053) and reading pace (T-056).
//
// A session's progress is (end point − start point), where a "point" is
// how far into the book a position string sits, measured in pages:
//   - PDF / physical: the literal page number ("12", "p. 12", "page 12").
//     PDF outline ids ("outline-3") resolve through the chapter graph.
//   - EPUB (reflowable, SRS §19.3): estimated-equivalent pages — the text
//     length of every chapter before the position's chapter, divided by
//     ESTIMATED_CHARS_PER_PAGE. EPUB positions are chapter-granular (spine
//     idref, or a CFI's spine step), so reading that stays within one
//     chapter registers as 0 pages until the chapter boundary is crossed.
// Anything unresolvable (e.g. a physical "Chapter 10") is null — unknown,
// not zero — and is left out of page totals and pace rather than guessed.

// A typical printed page holds ~250-300 words; ~1,800 characters is the
// usual equivalent including spaces.
export const ESTIMATED_CHARS_PER_PAGE = 1_800;

export interface UnitInfo {
  structuralId: string;
  order: number;
  pageNumber: number | null;
  textLength: number;
}

export interface EditionIndex {
  format: 'EPUB' | 'PDF' | 'PHYSICAL';
  byStructuralId: Map<string, UnitInfo & { charsBefore: number }>;
  byOrder: Map<number, UnitInfo & { charsBefore: number }>;
}

export function buildEditionIndex(format: EditionIndex['format'], units: UnitInfo[]): EditionIndex {
  const sorted = [...units].sort((a, b) => a.order - b.order);
  const byStructuralId = new Map<string, UnitInfo & { charsBefore: number }>();
  const byOrder = new Map<number, UnitInfo & { charsBefore: number }>();
  let charsBefore = 0;
  for (const unit of sorted) {
    const entry = { ...unit, charsBefore };
    byStructuralId.set(unit.structuralId, entry);
    byOrder.set(unit.order, entry);
    charsBefore += unit.textLength;
  }
  return { format, byStructuralId, byOrder };
}

const PAGE_NUMBER = /^\s*(?:p(?:age)?\.?\s*)?(\d{1,6})\s*$/i;

export function parsePageNumber(position: string): number | null {
  const match = PAGE_NUMBER.exec(position);
  return match ? Number(match[1]) : null;
}

// epubcfi(/6/14!/4/2:0) -> spine step 14 -> spine index 6 (CFI steps are
// even-numbered, 1-based: index = step / 2 - 1).
export function cfiSpineIndex(position: string): number | null {
  const match = /^epubcfi\(\/6\/(\d+)/.exec(position.trim());
  if (!match) return null;
  const step = Number(match[1]);
  return step >= 2 && step % 2 === 0 ? step / 2 - 1 : null;
}

export function positionToPagePoint(position: string, index: EditionIndex | null): number | null {
  if (index?.format === 'EPUB') {
    const spineIndex = cfiSpineIndex(position);
    const unit =
      index.byStructuralId.get(position) ?? (spineIndex !== null ? index.byOrder.get(spineIndex) : undefined);
    return unit ? unit.charsBefore / ESTIMATED_CHARS_PER_PAGE : null;
  }

  const page = parsePageNumber(position);
  if (page !== null) return page;

  const unit = index?.byStructuralId.get(position);
  return unit?.pageNumber ?? null;
}

// Where a digital book "starts" when a session has no recorded start
// position and no earlier session on the same copy: the reader opens a
// never-read book at its beginning. Physical copies have no such
// guarantee (the reader may have been halfway through before logging),
// so they stay unknown.
function beginningPoint(index: EditionIndex | null): number | null {
  if (!index || index.format === 'PHYSICAL') return null;
  return index.format === 'EPUB' ? 0 : 1;
}

export interface SessionForProgress {
  id: string;
  copyId: string;
  startTime: Date;
  startPosition: string | null;
  endPosition: string | null;
}

// Returns estimated pages per session id (null = unknown). Moving
// backwards (re-reading earlier pages) counts as 0, not negative.
export function estimatePagesBySession(
  sessions: SessionForProgress[],
  indexByCopyId: Map<string, EditionIndex | null>,
): Map<string, number | null> {
  const result = new Map<string, number | null>();
  const lastEndByCopy = new Map<string, string>();
  const chronological = [...sessions].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  for (const session of chronological) {
    const index = indexByCopyId.get(session.copyId) ?? null;
    const previousEnd = lastEndByCopy.get(session.copyId);
    const startPosition = session.startPosition ?? previousEnd ?? null;

    const startPoint = startPosition !== null ? positionToPagePoint(startPosition, index) : beginningPoint(index);
    const endPoint = session.endPosition !== null ? positionToPagePoint(session.endPosition, index) : null;

    result.set(
      session.id,
      startPoint !== null && endPoint !== null ? Math.max(0, endPoint - startPoint) : null,
    );
    if (session.endPosition !== null) lastEndByCopy.set(session.copyId, session.endPosition);
  }
  return result;
}
