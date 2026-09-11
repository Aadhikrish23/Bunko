import { createHash } from 'crypto';

export interface TextAnchor {
  hash: string;
  offset: number;
}

const NGRAM_WINDOW_WORDS = 12;
// Half-window stride keeps the anchor count proportional to book length
// rather than word count, while still giving good coverage for the
// text-anchor search step of continuity mapping (SRS §11.7 step 3).
const NGRAM_STRIDE_WORDS = 6;

// Text normalization per SRS §11.6 step 3: strip whitespace/formatting,
// lowercase, collapse punctuation, to produce a comparable text stream.
// Reused as-is by the continuity module (Phase 5) so a source anchor and
// a target anchor are always computed the same way.
export function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(normalized: string): string[] {
  return normalized.length > 0 ? normalized.split(' ') : [];
}

function hashWindow(words: string[]): string {
  return createHash('sha1').update(words.join(' ')).digest('hex');
}

// Rolling n-gram fingerprints (SRS §11.6 step 4).
export function generateTextAnchors(normalized: string): TextAnchor[] {
  const words = tokenize(normalized);
  const anchors: TextAnchor[] = [];
  for (let offset = 0; offset + NGRAM_WINDOW_WORDS <= words.length; offset += NGRAM_STRIDE_WORDS) {
    anchors.push({ hash: hashWindow(words.slice(offset, offset + NGRAM_WINDOW_WORDS)), offset });
  }
  return anchors;
}
