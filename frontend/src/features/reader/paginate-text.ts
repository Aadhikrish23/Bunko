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

// Rough characters-per-page estimate from the page box size and font
// scale — smaller box or larger font means fewer characters fit.
export function estimateCharsPerPage(boxWidth: number, boxHeight: number, fontScale: number): number {
  const AVG_CHAR_WIDTH_PX = 8.5;
  const LINE_HEIGHT_PX = 26;
  const HORIZONTAL_PADDING_FRACTION = 0.82; // leaves room for page margins
  const VERTICAL_PADDING_FRACTION = 0.85;

  const usableWidth = boxWidth * HORIZONTAL_PADDING_FRACTION;
  const usableHeight = boxHeight * VERTICAL_PADDING_FRACTION;

  const charsPerLine = Math.max(10, Math.floor(usableWidth / (AVG_CHAR_WIDTH_PX * fontScale)));
  const linesPerPage = Math.max(3, Math.floor(usableHeight / (LINE_HEIGHT_PX * fontScale)));

  return charsPerLine * linesPerPage;
}
