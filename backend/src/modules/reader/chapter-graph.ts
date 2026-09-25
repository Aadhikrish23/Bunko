import type { TextAnchor } from './text-anchor';

// The canonical chapter graph (SRS §11.6 step 2), stored on
// Edition.chapterGraph. Shared shape across EPUB and PDF so the
// continuity module (Phase 5) can compare across formats without
// format-specific branching.
export interface ChapterUnit {
  structuralId: string;
  label: string;
  order: number;
  pageNumber: number | null;
  textAnchors: TextAnchor[];
  // Full readable chapter text (not the normalized anchor form) — powers
  // the flow-reader UI and, later, chapter-level AI features. Empty for a
  // scanned PDF page with no extractable text layer (SRS §38.2); OCR
  // backfill is a separate, not-yet-built step.
  text: string;
}

// Bump whenever the shape or content of a ChapterGraph produced by the
// indexers changes (e.g. adding the `text` field for T-037a) — ensureIndexed
// (reader.service.ts) re-indexes any edition whose stored graph doesn't
// carry this version, instead of treating "chapterGraph is non-null" as
// "chapterGraph is up to date". A graph saved before this field existed has
// `version === undefined`, which never matches, so it re-indexes too.
//
// 3: the extraction algorithms themselves changed for the same input --
// PDF text-layer joining now reconstructs real spacing/line-breaks
// instead of blindly space-joining stream-order items (previously
// produced things like "W 1 hat" for "What"), a garbled legacy-font
// text layer (e.g. pre-Unicode Tamil fonts) is now detected and routed
// through OCR instead of shipped as unreadable text, and EPUB3 books
// with no NCX now get real chapter titles from nav.xhtml instead of
// falling back to the raw manifest id. Editions already indexed under
// version 2 have none of this until they're re-indexed.
export const CURRENT_CHAPTER_GRAPH_VERSION = 3;

export interface ChapterGraph {
  version: number;
  format: 'EPUB' | 'PDF';
  units: ChapterUnit[];
  // False for a scanned PDF with no extractable text layer (SRS §38.2) —
  // mapping capability for that edition is limited to the page-fallback
  // table (T-026).
  hasTextLayer: boolean;
}

export function findUnitByStructuralId(graph: ChapterGraph, structuralId: string): ChapterUnit | null {
  return graph.units.find((unit) => unit.structuralId === structuralId) ?? null;
}

// For a PDF with an outline, a reported page number rarely matches a
// unit's structuralId exactly (outline units are "outline-N", not page
// numbers) — this finds which outline entry a given page falls under,
// by nearest pageNumber. Used to capture a portable chapterLabel for the
// canonical position even when the exact-id lookup above misses.
export function findUnitByClosestPage(graph: ChapterGraph, pageNumber: number): ChapterUnit | null {
  const withPages = graph.units.filter((unit) => unit.pageNumber != null);
  if (withPages.length === 0) return null;
  return withPages.reduce((closest, candidate) =>
    Math.abs(candidate.pageNumber! - pageNumber) < Math.abs(closest.pageNumber! - pageNumber) ? candidate : closest,
  );
}
