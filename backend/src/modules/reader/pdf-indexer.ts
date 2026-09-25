import * as napiCanvas from '@napi-rs/canvas';
import { AppError } from '../../lib/app-error';
import { logger } from '../../lib/logger';
import { CURRENT_CHAPTER_GRAPH_VERSION, type ChapterGraph, type ChapterUnit } from './chapter-graph';
import { generateTextAnchors, normalizeText } from './text-anchor';

interface OutlineNode {
  title: string;
  dest: unknown;
  items: OutlineNode[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJsDocument = any;

// pdf.js's own TextItem shape (not exported as a usable type from the
// legacy build we dynamic-import) — the honest subset this file reads.
export interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  // [scaleX, skewX, skewY, scaleY, x, y] — the item's position/size matrix.
  transform: [number, number, number, number, number, number];
  width: number;
  height: number;
}

// pdf.js's getTextContent() returns items in the PDF's internal content-
// stream order, not reading order, and — critically — never guarantees
// correct spacing between them (mozilla/pdf.js#18201, #14493). Blindly
// joining item.str with a single space, which is what this file used to
// do, produces exactly the kind of garbling seen in practice: a footnote
// marker or drop-cap sitting between two runs of one real word comes out
// as "W 1 hat" instead of "What¹". This rebuilds spacing/line-breaks from
// each item's own geometry instead of trusting stream order:
//   - a real word boundary gets a space, judged by the horizontal gap
//     between one item's right edge and the next item's left edge,
//     scaled to that text's own font size (so it works across page
//     zoom/font-size variation, not a fixed pixel threshold);
//   - hasEOL (pdf.js's own line-break flag on the text item) becomes a
//     newline instead of a space, so paragraph structure survives;
//   - a short, purely-numeric item that's vertically offset from the
//     item before it and rendered in a noticeably smaller font — the
//     signature of a footnote marker or superscript reference number
//     wedged mid-sentence — is dropped rather than spliced into the
//     surrounding word. This is a heuristic, not a citation parser: it
//     only fires on the narrow "1-3 digit number, small, offset" shape,
//     so it won't eat real inline numbers written at body size.
export function joinTextItems(items: PdfTextItem[]): string {
  let result = '';
  // The last item actually emitted into `result` — used for hasEOL and
  // font-size comparisons. Kept separate from cursorEndX below because a
  // skipped footnote marker must still absorb its own horizontal span
  // (so the *next* real item's gap is measured from where the line
  // visually continues), without becoming the reference point for
  // hasEOL/font-size decisions itself.
  let prevItem: PdfTextItem | null = null;
  let cursorEndX: number | null = null;

  for (const item of items) {
    if (!item.str) continue;

    const fontSize = Math.hypot(item.transform[2], item.transform[3]) || Math.abs(item.transform[3]) || 1;
    const isFootnoteMarker =
      prevItem !== null &&
      /^\d{1,3}$/.test(item.str.trim()) &&
      item.transform[5] > prevItem.transform[5] + prevItem.height * 0.2 &&
      fontSize < Math.hypot(prevItem.transform[2], prevItem.transform[3]) * 0.85;

    if (isFootnoteMarker) {
      cursorEndX = item.transform[4] + item.width;
      continue;
    }

    if (prevItem) {
      if (prevItem.hasEOL) {
        result += '\n';
      } else {
        const gap = item.transform[4] - (cursorEndX ?? prevItem.transform[4] + prevItem.width);
        if (gap > fontSize * 0.15) result += ' ';
      }
    }

    result += item.str;
    prevItem = item;
    cursorEndX = item.transform[4] + item.width;
  }

  return result;
}

// Collapses runs of spaces/tabs (pdf.js's own habit of emitting multiple
// consecutive space items) without touching the newlines joinTextItems
// deliberately inserted — a blanket `\s+` -> ' ' collapse, which this
// file used to apply, would silently undo that paragraph structure right
// back into one wall of text.
export function normalizePageText(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Detects a real, well-known failure mode distinct from the spacing bug
// joinTextItems fixes: a PDF whose embedded font remaps glyph shapes onto
// arbitrary codepoints instead of true Unicode — common in Tamil (and
// other Indian-language) documents produced before Unicode fonts were
// standard tooling (TSCII, Bamini, Vanavil, and similar legacy 8-bit
// encodings). pdf.js decodes these faithfully; there's just no real
// Unicode text underneath to decode, so extraction comes out as real
// script letters interleaved with stray symbols the font's private
// encoding happened to reuse ("{", "}", "~", "²", "£", "¶", …) — visibly
// wrong to a reader, but not something hasTextLayer's plain non-empty
// check catches, since the string genuinely isn't empty.
//
// Exported so ensureIndexed-level code (and tests) can reuse the exact
// same judgment this file uses internally, rather than duplicating it.
export function looksLikeGarbledText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20) return false; // too short to judge reliably either way

  let flagged = 0;
  let total = 0;
  for (const ch of trimmed) {
    if (/\s/.test(ch)) continue;
    total += 1;
    // Any script's letters/digits, plus ordinary prose punctuation, are
    // fine. \p{M} (combining marks) matters for real Tamil/Hindi/etc.
    // prose specifically — dependent vowel signs and virama (redundant
    // consonant marker) are Unicode Mark characters, not Letters, and a
    // real sentence in these scripts uses them constantly; without this
    // the check flagged perfectly clean Tamil as "garbled" just for
    // being written in Tamil. What's NOT fine at any real density: stray
    // symbol/currency/superscript characters a legacy font's private
    // encoding tends to surface in place of real letters.
    if (/[\p{L}\p{M}\p{N}.,;:!?'"()\-–—…/&@%*+=]/u.test(ch)) continue;
    flagged += 1;
  }
  if (total === 0) return false;
  // Real prose in any language essentially never puts "{", "¶", "²", "£"
  // etc. at more than a token rate — 10%+ is a strong, deliberately
  // conservative signal of encoding corruption rather than normal text.
  return flagged / total > 0.1;
}

// Renders one page to a PNG buffer via @napi-rs/canvas — the same
// library pdfjs-dist's own package.json declares as an optional
// dependency (pinned to the exact range it expects; see the commit
// that added this comment for why that pin matters — a newer major
// version crashes the process on page.render()). Only used for OCR
// (T-037a); the default (non-OCR) indexing path never touches this.
async function renderPageToPng(doc: PdfJsDocument, pageNumber: number): Promise<Buffer> {
  // DOMMatrix/ImageData/Path2D are DOM types Node doesn't declare —
  // `any` here is the honest type for polyfilling browser globals pdf.js
  // expects, same rationale as the pdfjs-dist dynamic import above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (!g.DOMMatrix) g.DOMMatrix = napiCanvas.DOMMatrix;
  if (typeof g.ImageData === 'undefined') g.ImageData = napiCanvas.ImageData;
  if (typeof g.Path2D === 'undefined') g.Path2D = napiCanvas.Path2D;

  const page = await doc.getPage(pageNumber);
  // Scale 2 balances OCR accuracy against render/recognition time — a
  // scanned page rendered too small loses enough detail to hurt
  // Tesseract's accuracy; much larger has diminishing returns for cost.
  const viewport = page.getViewport({ scale: 2 });
  const canvas = napiCanvas.createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toBuffer('image/png');
}

// PDF structural units come from the outline/bookmarks (SRS §11.6 step 1)
// when present — each entry is inherently page-anchored, which doubles as
// the page-fallback table (SRS §11.6 step 5) for this format. Handles
// SRS §38.2 (scanned pages, missing text layer) with graceful
// degradation rather than failing the import.
//
// `options.ocrWorker`: when provided, a scanned page (no text layer)
// is OCR'd through it instead of left as empty text (T-037a). Passing
// this is the caller's job — this function never creates a Tesseract
// worker itself, since spinning one up per call would be wasteful for
// the background job that OCRs every page of a document; the caller
// (ocr-backfill.job.ts) creates one worker and reuses it across all
// pages. The default (no worker passed) is the original, fast,
// OCR-free path used by the synchronous request/response indexing.
export async function indexPdf(
  buffer: Buffer,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: { ocrWorker?: any }
): Promise<ChapterGraph> {
  // pdfjs-dist v4 ships ESM only (no CJS build) — dynamic import is the
  // standard CJS->ESM interop, since this project's backend targets
  // commonjs. `any` is the honest type: there's no usable static type for
  // an arbitrary-subpath dynamic import under this tsconfig's module
  // resolution.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let doc: PdfJsDocument;
  try {
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
    doc = await loadingTask.promise;
  } catch {
    throw new AppError('UNSUPPORTED_FILE', 'File is not a valid or readable PDF');
  }

  const pageCount: number = doc.numPages;

  // Non-empty alone isn't enough — a legacy non-Unicode font (see
  // looksLikeGarbledText) produces plenty of non-empty, entirely unusable
  // text. Sample up to a handful of pages that actually have text and
  // require at least one to look like real prose before trusting the
  // layer; if every sampled page is garbled, treat this the same as "no
  // text layer" so the OCR fallback (which doesn't care what encoding
  // produced the glyph shapes on screen) picks it up instead. Bounded
  // rather than scanning the whole document — a book's font choice is
  // essentially always uniform throughout.
  const MAX_PAGES_TO_SAMPLE_FOR_TEXT_LAYER = 5;
  let hasTextLayer = false;
  let sampledNonEmptyPages = 0;
  for (
    let pageNum = 1;
    pageNum <= pageCount && !hasTextLayer && sampledNonEmptyPages < MAX_PAGES_TO_SAMPLE_FOR_TEXT_LAYER;
    pageNum += 1
  ) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items as PdfTextItem[];
    if (!items.some((item) => (item.str ?? '').trim().length > 0)) continue;
    sampledNonEmptyPages += 1;
    if (!looksLikeGarbledText(joinTextItems(items))) {
      hasTextLayer = true;
    }
  }

  const outline: OutlineNode[] | null = await doc.getOutline();

  async function resolvePageNumber(dest: unknown): Promise<number | null> {
    try {
      const explicitDest = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(explicitDest) || !explicitDest[0]) return null;
      const pageIndex = await doc.getPageIndex(explicitDest[0]);
      return pageIndex + 1;
    } catch {
      return null;
    }
  }

  async function ocrPageText(pageNumber: number): Promise<string> {
    if (!options?.ocrWorker) return '';
    try {
      const png = await renderPageToPng(doc, pageNumber);
      const { data } = await options.ocrWorker.recognize(png);
      return data.text ?? '';
    } catch (err) {
      // One page's OCR failing shouldn't sink the whole document —
      // leave that page's text empty and keep going (T-037a graceful
      // degradation).
      logger.warn({ err, pageNumber }, 'OCR failed for a page; leaving its text empty');
      return '';
    }
  }

  async function extractPageText(pageNumber: number): Promise<string> {
    if (hasTextLayer) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      return joinTextItems(content.items as PdfTextItem[]);
    }
    return ocrPageText(pageNumber);
  }

  // A chapter's readable text spans every page from where it starts up to
  // (not including) where the next chapter starts — a single page only
  // covers the chapter's opening, not the chapter.
  async function extractPageRangeText(startPage: number, endPageExclusive: number): Promise<string> {
    const parts: string[] = [];
    for (let pageNumber = startPage; pageNumber < endPageExclusive; pageNumber += 1) {
      parts.push(await extractPageText(pageNumber));
    }
    return parts.join('\n\n');
  }

  const units: ChapterUnit[] = [];

  if (outline && outline.length > 0) {
    let order = 0;
    const flatNodes: { title: string; dest: unknown }[] = [];
    function flattenNodes(nodes: OutlineNode[]): void {
      for (const node of nodes) {
        flatNodes.push({ title: node.title, dest: node.dest });
        if (node.items?.length) flattenNodes(node.items);
      }
    }
    flattenNodes(outline);

    const pageNumbers = await Promise.all(flatNodes.map((node) => resolvePageNumber(node.dest)));

    for (let i = 0; i < flatNodes.length; i += 1) {
      const pageNumber = pageNumbers[i] ?? null;
      // Next chapter's start page (skipping any unresolvable entries),
      // else end of document — the exclusive upper bound of this range.
      let endPageExclusive = pageCount + 1;
      for (let j = i + 1; j < flatNodes.length; j += 1) {
        if (pageNumbers[j] != null) {
          endPageExclusive = pageNumbers[j]!;
          break;
        }
      }
      const text = pageNumber && (hasTextLayer || options?.ocrWorker) ? await extractPageRangeText(pageNumber, endPageExclusive) : '';
      units.push({
        structuralId: `outline-${order}`,
        label: flatNodes[i]!.title,
        order,
        pageNumber,
        textAnchors: generateTextAnchors(normalizeText(text)),
        text: normalizePageText(text),
      });
      order += 1;
    }
  } else {
    // No bookmarks at all (common for scanned PDFs) — one unit per page,
    // page number is the only signal available for mapping. structuralId
    // is the bare page number (not "page-N") so it doubles as exactly
    // what the frontend PDF reader reports as its position (T-029/T-030)
    // — no separate id scheme to keep in sync. Each unit is a page, not a
    // true chapter, since there's no structural signal to group pages by.
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const text = hasTextLayer || options?.ocrWorker ? await extractPageText(pageNumber) : '';
      units.push({
        structuralId: String(pageNumber),
        label: `Page ${pageNumber}`,
        order: pageNumber - 1,
        pageNumber,
        textAnchors: generateTextAnchors(normalizeText(text)),
        text: normalizePageText(text),
      });
    }
  }

  return { version: CURRENT_CHAPTER_GRAPH_VERSION, format: 'PDF', units, hasTextLayer };
}
