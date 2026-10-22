// Splits a chapter into pieces small enough to translate in one request
// (T-090), cutting at the most natural boundary available: a blank line
// (paragraph), then a line break (PDF text often has no blank lines), then
// the end of a sentence, then any space. Only a run with no break at all
// (e.g. a very long unpunctuated CJK passage) is cut mid-text.
//
// `separatorAfter` is the whitespace removed at the cut, so the translated
// pieces can be joined back with the same paragraph structure.

export interface Segment {
  text: string;
  separatorAfter: string;
}

export const SEGMENT_TARGET_CHARS = 6_000;

interface Break {
  index: number;
  separator: string;
}

const BREAKS: Array<{ pattern: RegExp; separator: string; cutAfterMatch: boolean }> = [
  { pattern: /\n[ \t]*\n/g, separator: '\n\n', cutAfterMatch: false },
  { pattern: /\n/g, separator: '\n', cutAfterMatch: false },
  // Sentence end (with any closing quotes/brackets) followed by a space.
  { pattern: /[.!?…]["'”’»)\]]*(?=\s)/g, separator: ' ', cutAfterMatch: true },
  // CJK sentence ends need no following space.
  { pattern: /[。！？]["'”’」』）]*/g, separator: '', cutAfterMatch: true },
  { pattern: /\s/g, separator: ' ', cutAfterMatch: false },
];

function lastBreak(window: string, floor: number): Break | null {
  for (const { pattern, separator, cutAfterMatch } of BREAKS) {
    let best = -1;
    for (const match of window.matchAll(pattern)) {
      const index = cutAfterMatch ? match.index + match[0].length : match.index;
      if (index >= floor && index < window.length) best = index;
    }
    if (best > 0) return { index: best, separator };
  }
  return null;
}

export function segmentText(text: string, targetChars = SEGMENT_TARGET_CHARS): Segment[] {
  const segments: Segment[] = [];
  let rest = text.trim();
  // Don't cut absurdly early just because a break exists: a piece is at
  // least half the target unless the text runs out.
  const floor = Math.floor(targetChars / 2);

  while (rest.length > targetChars) {
    const window = rest.slice(0, targetChars);
    const found = lastBreak(window, floor);
    let index = found?.index ?? targetChars;
    // Never split a surrogate pair (emoji, rare CJK) on a hard cut.
    const code = rest.charCodeAt(index - 1);
    if (!found && code >= 0xd800 && code <= 0xdbff) index -= 1;

    segments.push({ text: rest.slice(0, index).trimEnd(), separatorAfter: found?.separator ?? '' });
    rest = rest.slice(index).trimStart();
  }
  if (rest.length > 0) segments.push({ text: rest, separatorAfter: '' });
  return segments;
}

// Rejoins translated pieces using each original piece's separator.
export function joinSegments(translated: string[], segments: Segment[]): string {
  return translated
    .map((text, i) => text.trim() + (segments[i]?.separatorAfter ?? ''))
    .join('')
    .trim();
}
