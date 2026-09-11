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
}

export interface ChapterGraph {
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
