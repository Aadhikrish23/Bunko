import { AppError } from '../../lib/app-error';
import type { ChapterGraph, ChapterUnit } from './chapter-graph';
import { generateTextAnchors, normalizeText } from './text-anchor';

interface OutlineNode {
  title: string;
  dest: unknown;
  items: OutlineNode[];
}

// PDF structural units come from the outline/bookmarks (SRS §11.6 step 1)
// when present — each entry is inherently page-anchored, which doubles as
// the page-fallback table (SRS §11.6 step 5) for this format. Handles
// SRS §38.2 (scanned pages, missing text layer) with graceful
// degradation rather than failing the import.
export async function indexPdf(buffer: Buffer): Promise<ChapterGraph> {
  // pdfjs-dist v4 ships ESM only (no CJS build) — dynamic import is the
  // standard CJS->ESM interop, since this project's backend targets
  // commonjs. `any` is the honest type: there's no usable static type for
  // an arbitrary-subpath dynamic import under this tsconfig's module
  // resolution.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;
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

  async function extractPageText(pageNumber: number): Promise<string> {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    return content.items.map((item: { str?: string }) => item.str ?? '').join(' ');
  }

  const units: ChapterUnit[] = [];

  if (outline && outline.length > 0) {
    let order = 0;
    async function flatten(nodes: OutlineNode[]): Promise<void> {
      for (const node of nodes) {
        const pageNumber = await resolvePageNumber(node.dest);
        const text = hasTextLayer && pageNumber ? await extractPageText(pageNumber) : '';
        units.push({
          structuralId: `outline-${order}`,
          label: node.title,
          order,
          pageNumber,
          textAnchors: generateTextAnchors(normalizeText(text)),
        });
        order += 1;
        if (node.items?.length) {
          await flatten(node.items);
        }
      }
    }
    await flatten(outline);
  } else {
    // No bookmarks at all (common for scanned PDFs) — one unit per page,
    // page number is the only signal available for mapping.
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const text = hasTextLayer ? await extractPageText(pageNumber) : '';
      units.push({
        structuralId: `page-${pageNumber}`,
        label: `Page ${pageNumber}`,
        order: pageNumber - 1,
        pageNumber,
        textAnchors: generateTextAnchors(normalizeText(text)),
      });
    }
  }

  return { format: 'PDF', units, hasTextLayer };
}
