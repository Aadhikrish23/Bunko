// Splits a chapter's flowed text into page-sized chunks at word
// boundaries. This is a heuristic (character-count based), not a true
// DOM-measured layout — good enough for a first working flow reader;
// swap for real measurement-based pagination if the heuristic proves
// visibly off in practice (e.g. lines running short/long at page ends).
export function paginateText(text: string, charsPerPage: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [''];
  if (trimmed.length <= charsPerPage) return [trimmed];

  const pages: string[] = [];
  let remaining = trimmed;

  while (remaining.length > charsPerPage) {
    let splitAt = remaining.lastIndexOf(' ', charsPerPage);
    if (splitAt <= 0) splitAt = charsPerPage; // no space found — hard split rather than loop forever
    pages.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining.length > 0) pages.push(remaining);

  return pages;
}

// A chapter's first page carries the chapter-title heading above the
// body text (see FlowReaderPage's isChapterStart branch), which eats
// into the same fixed-height box every other page gets — pack it with a
// smaller character budget than the rest of the chapter, or the first
// page systematically overflows and gets its last line(s) clipped.
export function paginateChapterText(text: string, firstPageChars: number, regularPageChars: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [''];
  if (trimmed.length <= firstPageChars) return [trimmed];

  let splitAt = trimmed.lastIndexOf(' ', firstPageChars);
  if (splitAt <= 0) splitAt = firstPageChars;
  const firstPage = trimmed.slice(0, splitAt).trim();
  const rest = trimmed.slice(splitAt).trim();

  return [firstPage, ...paginateText(rest, regularPageChars)];
}

export interface PageBoxOptions {
  // settings.lineHeight (1.2 - 2.0) — a taller line spacing fits fewer
  // lines in the same box; the old heuristic used a fixed line height
  // regardless of this setting, so changing it in Appearance silently
  // stopped matching the actual page-break points.
  lineHeightMultiplier: number;
  // Fraction of the page box's WIDTH reserved as padding on each side —
  // matches MARGIN_SIZE_PADDING in FlowReaderPage (e.g. 0.06/0.08/0.12).
  // CSS resolves a percentage `padding` (all four sides, including top
  // and bottom) against the containing block's *width*, never its
  // height — so vertical padding in px must be derived from boxWidth,
  // not boxHeight, to match what's actually rendered.
  marginFraction: number;
  // Extra vertical space to reserve for content above the body text on
  // this page (the chapter-title heading on a chapter's first page) — 0
  // for a plain continuation page.
  reservedTopPx?: number;
  // Multiplier on the average glyph width for the active font family —
  // a monospace face runs noticeably wider per character than the serif/
  // sans body faces AVG_CHAR_WIDTH_PX was calibrated against. Defaults to
  // 1 (no adjustment).
  charWidthFactor?: number;
}

// Rough characters-per-page estimate from the page box size and font
// scale — smaller box or larger font means fewer characters fit.
export function estimateCharsPerPage(
  boxWidth: number,
  boxHeight: number,
  fontScale: number,
  options: PageBoxOptions = { lineHeightMultiplier: 1.5, marginFraction: 0.08 }
): number {
  const AVG_CHAR_WIDTH_PX = 8.5;
  // Matches the page body text's font-size (`0.95rem * fontScale`,
  // FlowReaderPage) at a 16px root — line height is derived from this so
  // it tracks the lineHeight setting instead of a fixed px value.
  const BODY_FONT_SIZE_REM = 0.95;
  const REM_TO_PX = 16;
  // Extra headroom below what the math says fits, since AVG_CHAR_WIDTH_PX
  // is an average over a proportional font (real lines vary around it) —
  // without this, roughly half of all lines run slightly long and wrap,
  // pushing the last line(s) of the page past the box and clipping them.
  const SAFETY_FRACTION = 0.92;

  const verticalPaddingPx = boxWidth * options.marginFraction * 2; // top + bottom, both relative to width
  const horizontalPaddingPx = boxWidth * options.marginFraction * 2; // left + right

  const usableWidth = (boxWidth - horizontalPaddingPx) * SAFETY_FRACTION;
  const usableHeight = (boxHeight - verticalPaddingPx - (options.reservedTopPx ?? 0)) * SAFETY_FRACTION;

  const fontSizePx = BODY_FONT_SIZE_REM * fontScale * REM_TO_PX;
  const lineHeightPx = fontSizePx * options.lineHeightMultiplier;

  const charWidthPx = AVG_CHAR_WIDTH_PX * fontScale * (options.charWidthFactor ?? 1);
  const charsPerLine = Math.max(10, Math.floor(usableWidth / charWidthPx));
  const linesPerPage = Math.max(3, Math.floor(usableHeight / lineHeightPx));

  return charsPerLine * linesPerPage;
}
