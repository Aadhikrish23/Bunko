import type { ChapterGraph, ChapterUnit } from '../reader/chapter-graph';
import { normalizeText } from '../reader/text-anchor';

export interface SourcePosition {
  structuralId: string | null;
  chapterLabel: string | null;
  textAnchor: string | null;
  pageNumber: number | null;
}

export type MappingMethod = 'structural' | 'title' | 'anchor' | 'proportional' | 'none';

export interface MappingResult {
  unit: ChapterUnit | null;
  confidence: number;
  method: MappingMethod;
}

function levenshteinRatio(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) distances[i]![0] = i;
  for (let j = 0; j < cols; j += 1) distances[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      distances[i]![j] = Math.min(
        distances[i - 1]![j]! + 1,
        distances[i]![j - 1]! + 1,
        distances[i - 1]![j - 1]! + cost,
      );
    }
  }

  const distance = distances[rows - 1]![cols - 1]!;
  return 1 - distance / Math.max(left.length, right.length);
}

// Fuzzy title similarity for SRS §11.7 step 2. A recorded chapter label
// (e.g. a physical session's free-text "Chapter 10") is very often a
// short prefix/substring of a target edition's fuller title ("Chapter
// 10: The Reckoning") — plain edit-distance ratio penalizes that
// mismatch in length far too harshly, so containment is checked first
// and scored highly regardless of length difference; edit distance is
// the fallback for near-misses (typos, minor rewording).
function similarity(a: string, b: string): number {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (left === right) return 1;
  if (left.length === 0 || right.length === 0) return 0;

  if (right.includes(left) || left.includes(right)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    return 0.85 + 0.15 * (shorter / longer);
  }

  return levenshteinRatio(left, right);
}

const TITLE_MATCH_THRESHOLD = 0.5;
const ANCHOR_MATCH_SATURATION = 3; // 3+ matching windows counts as full-strength

// Implements the mapping priority from SRS §11.7: structural ID > title
// match > text anchor > proportional/page fallback. A stronger signal is
// never overridden by a weaker one — each step only runs if the previous
// one didn't find a usable match (T-032/T-033 acceptance).
export function runMappingAlgorithm(source: SourcePosition, target: ChapterGraph): MappingResult {
  if (source.structuralId) {
    const exact = target.units.find((unit) => unit.structuralId === source.structuralId);
    if (exact) {
      return { unit: exact, confidence: 0.95, method: 'structural' };
    }
  }

  if (source.chapterLabel) {
    let best: { unit: ChapterUnit; score: number } | null = null;
    for (const unit of target.units) {
      const score = similarity(source.chapterLabel, unit.label);
      if (!best || score > best.score) {
        best = { unit, score };
      }
    }
    if (best && best.score >= TITLE_MATCH_THRESHOLD) {
      // Scales similarity [0.5, 1.0] to confidence [0.7, 0.9] (SRS §11.7 step 2 band).
      const confidence = 0.7 + (best.score - TITLE_MATCH_THRESHOLD) * 0.4;
      return { unit: best.unit, confidence: Math.min(confidence, 0.9), method: 'title' };
    }
  }

  if (source.textAnchor) {
    let best: { unit: ChapterUnit; matches: number } | null = null;
    for (const unit of target.units) {
      const matches = unit.textAnchors.filter((anchor) => anchor.hash === source.textAnchor).length;
      if (matches > 0 && (!best || matches > best.matches)) {
        best = { unit, matches };
      }
    }
    if (best) {
      const strength = Math.min(best.matches / ANCHOR_MATCH_SATURATION, 1);
      const confidence = 0.4 + strength * 0.45; // [0.4, 0.85] band (SRS §11.7 step 3)
      return { unit: best.unit, confidence, method: 'anchor' };
    }
  }

  if (source.pageNumber != null) {
    const withPages = target.units.filter((unit) => unit.pageNumber != null);
    if (withPages.length > 0) {
      const closest = withPages.reduce((a, b) =>
        Math.abs(a.pageNumber! - source.pageNumber!) <= Math.abs(b.pageNumber! - source.pageNumber!) ? a : b,
      );
      return { unit: closest, confidence: 0.3, method: 'proportional' }; // [0.2, 0.4] band (SRS §11.7 step 4)
    }
  }

  return { unit: null, confidence: 0, method: 'none' };
}
