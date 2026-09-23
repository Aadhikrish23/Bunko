import * as napiCanvas from '@napi-rs/canvas';
import { AppError } from '../../lib/app-error';
import { logger } from '../../lib/logger';
import type { ChapterGraph, ChapterUnit } from './chapter-graph';
import { generateTextAnchors, normalizeText } from './text-anchor';

interface OutlineNode {
  title: string;
  dest: unknown;
  items: OutlineNode[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJsDocument = any;

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

  let hasTextLayer = false;
  for (let pageNum = 1; pageNum <= pageCount && !hasTextLayer; pageNum += 1) {
    // Sequential by design — bails out on the first page with real text.
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    if (content.items.some((item: { str?: string }) => (item.str ?? '').trim().length > 0)) {
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
      return content.items.map((item: { str?: string }) => item.str ?? '').join(' ');
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
        text: text.replace(/\s+/g, ' ').trim(),
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
        text: text.replace(/\s+/g, ' ').trim(),
      });
    }
  }

  return { format: 'PDF', units, hasTextLayer };
}
