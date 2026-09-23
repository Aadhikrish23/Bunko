import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
// StPageFlip's HTML render mode is DOM/CSS-positioned, not canvas-drawn —
// without its stylesheet every page stacks at (0,0) unstyled. The npm
// package ships this only under src/, not in its compiled dist/.
import 'page-flip/src/Style/stPageFlip.css';
import HTMLFlipBookImport from 'react-pageflip';

// react-pageflip's IProps extends IFlipSetting with every field required,
// even though its own README only ever passes width/height and relies on
// documented runtime defaults for the rest — so the strict typing doesn't
// match its actual usage contract. Loosened here rather than hand-listing
// every internal setting field just to satisfy the compiler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HTMLFlipBook = HTMLFlipBookImport as any;
import { ChevronLeft, ChevronRight, Info, ZoomIn, ZoomOut } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner, Spinner } from '../../components/ui/Spinner';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

import type { SearchMatch } from './InBookSearchDrawer';
import type { ReaderSettings } from './reader-settings';
import { THEME_STYLES } from './reader-settings';

interface PdfReaderProps {
  fileUrl: string;
  startPosition: string | null;
  jumpToPosition: string | null;
  settings?: ReaderSettings;
  onPositionChange: (position: string) => void;
  onRegisterSearch?: (searchFn: (query: string) => Promise<SearchMatch[]>) => void;
  onTextSelected?: (selection: { text: string; x: number; y: number; position: string }) => void;
  onPageCountLoaded?: (pageCount: number) => void;
}

// In-memory PDF document cache to eliminate repeated downloads and make loading instant
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfDocCache = new Map<string, Promise<any>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPdfDocument(fileUrl: string): Promise<any> {
  const cached = pdfDocCache.get(fileUrl);
  if (cached) return cached;
  const promise = (async () => {
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`Failed to load PDF file: ${res.status} ${res.statusText}`);
    }
    const data = await res.arrayBuffer();
    return pdfjsLib.getDocument({
      data,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/cmaps/',
      cMapPacked: true,
    }).promise;
  })();
  pdfDocCache.set(fileUrl, promise);
  return promise;
}

// Pages within this distance of the current one get their canvas + text
// layer actually rendered; the rest stay blank until scrolled near. The
// flip book still mounts one DOM node per page (StPageFlip's HTML mode
// needs them all present to compute the book), but the expensive pdf.js
// rendering work only happens for pages the reader could plausibly see.
const RENDER_WINDOW = 2;

interface PdfPageProps {
  pageNum: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist's PDFDocumentProxy
  doc: any;
  active: boolean;
  zoomScale: number;
  paperBg: string;
  isPaperTheme: boolean;
}

const PdfPage = forwardRef<HTMLDivElement, PdfPageProps>(function PdfPage(
  { pageNum, doc, active, zoomScale, paperBg, isPaperTheme },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskRef = useRef<any>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!active || rendered || !doc) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await doc.getPage(pageNum);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: zoomScale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        if (!context) return;

        const renderTask = page.render({ canvasContext: context, viewport });
        taskRef.current = renderTask;
        await renderTask.promise;
        if (cancelled) return;
        setRendered(true);

        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = '';
          textLayerRef.current.style.width = `${viewport.width}px`;
          textLayerRef.current.style.height = `${viewport.height}px`;
          const textContent = await page.getTextContent();
          if (cancelled) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const TextLayerClass = (pdfjsLib as any).TextLayer;
          if (TextLayerClass) {
            const textLayer = new TextLayerClass({
              textContentSource: textContent,
              container: textLayerRef.current,
              viewport,
            });
            await textLayer.render();
          }
        }
      } catch {
        // Ignore render/cancellation errors — a page that fails to render
        // just stays blank rather than crashing the book.
      }
    })();

    return () => {
      cancelled = true;
      if (taskRef.current) {
        try {
          taskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [active, doc, pageNum, rendered, zoomScale]);

  return (
    <div ref={ref} style={{ backgroundColor: paperBg }} className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} style={{ mixBlendMode: isPaperTheme ? 'multiply' : 'normal' }} className="max-h-full max-w-full object-contain" />
      <div ref={textLayerRef} className="textLayer absolute inset-0 select-text overflow-hidden" />
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
});

export function PdfReader({
  fileUrl,
  startPosition,
  jumpToPosition,
  settings,
  onPositionChange,
  onRegisterSearch,
  onTextSelected,
  onPageCountLoaded,
}: PdfReaderProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist's PDFDocumentProxy
  const docRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pageflip's ref exposes an untyped pageFlip() instance
  const flipBookRef = useRef<any>(null);
  const isReadyRef = useRef(false);

  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(() => {
    const p = startPosition ? Number(startPosition) : 1;
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [zoomScale, setZoomScale] = useState(1.3);
  const [isScannedPdf, setIsScannedPdf] = useState(false);
  // width/height ratio of the actual PDF page — defaults to a
  // letter/A4-ish guess until the real document loads and reports it.
  const [pageAspect, setPageAspect] = useState(0.72);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 600, height: 800 });
  const containerRef = useRef<HTMLDivElement>(null);
  // The book remounts when this size changes meaningfully (its width/
  // height feed the key below). Threshold-gated so the ResizeObserver's
  // first real measurement — which always differs a little from the
  // placeholder default right after mount — doesn't force a remount in
  // the middle of the very first page turn a user makes.
  const committedSizeRef = useRef({ width: 600, height: 800 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const committed = committedSizeRef.current;
        if (Math.abs(width - committed.width) < 24 && Math.abs(height - committed.height) < 24) return;
        committedSizeRef.current = { width, height };
        setContainerSize({ width: Math.max(200, width), height: Math.max(200, height) });
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const handleMouseUp = () => {
      if (!onTextSelected) return;
      const selection = window.getSelection();
      const text = selection?.toString()?.trim();
      if (text && text.length > 0 && selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        onTextSelected({
          text,
          x: rect.left + rect.width / 2,
          y: Math.max(10, rect.top - 10),
          position: String(currentPage),
        });
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [currentPage, onTextSelected]);

  useEffect(() => {
    let cancelled = false;
    const resolvedUrl =
      typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
        ? fileUrl.replace('localhost:9000', `${window.location.hostname}:9000`).replace('127.0.0.1:9000', `${window.location.hostname}:9000`)
        : fileUrl;

    getPdfDocument(resolvedUrl)
      .then(async (doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setPageCount(doc.numPages);
        onPageCountLoaded?.(doc.numPages);
        const initialPage = startPosition ? Number(startPosition) : 1;
        setCurrentPage(Number.isFinite(initialPage) && initialPage > 0 ? Math.min(doc.numPages, initialPage) : 1);

        try {
          const firstPage = await doc.getPage(1);
          const textContent = await firstPage.getTextContent();
          if (!textContent.items || textContent.items.length === 0) {
            setIsScannedPdf(true);
          }
          const nativeViewport = firstPage.getViewport({ scale: 1 });
          if (nativeViewport.width > 0 && nativeViewport.height > 0) {
            setPageAspect(nativeViewport.width / nativeViewport.height);
          }
        } catch {
          // Ignore text check / aspect-ratio read error — falls back to
          // the default aspect below.
        }

        if (onRegisterSearch) {
          onRegisterSearch(async (query: string): Promise<SearchMatch[]> => {
            if (!docRef.current) return [];
            const results: SearchMatch[] = [];
            const q = query.toLowerCase();

            for (let pageNum = 1; pageNum <= docRef.current.numPages; pageNum++) {
              try {
                const page = await docRef.current.getPage(pageNum);
                const content = await page.getTextContent();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const text = content.items.map((item: any) => item.str ?? '').join(' ');
                const pos = text.toLowerCase().indexOf(q);
                if (pos !== -1) {
                  const start = Math.max(0, pos - 40);
                  const end = Math.min(text.length, pos + q.length + 40);
                  const snippet = text.slice(start, end).replace(/\s+/g, ' ');
                  results.push({
                    id: `pdf-${pageNum}-${pos}`,
                    target: String(pageNum),
                    snippet: `...${snippet}...`,
                    chapterLabel: `Page ${pageNum}`,
                  });
                }
              } catch {
                // Ignore page text extraction error
              }
            }
            return results;
          });
        }

        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('This PDF could not be opened. The file may be corrupted or in an unsupported format.');
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileUrl, onRegisterSearch, startPosition, onPageCountLoaded]);

  const handlePrev = useCallback(() => {
    flipBookRef.current?.pageFlip()?.flipPrev();
  }, []);

  const handleNext = useCallback(() => {
    flipBookRef.current?.pageFlip()?.flipNext();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        handlePrev();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        handleNext();
      } else if (e.key === 'Home') {
        flipBookRef.current?.pageFlip()?.turnToPage(0);
      } else if (e.key === 'End' && pageCount > 0) {
        flipBookRef.current?.pageFlip()?.turnToPage(pageCount - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, pageCount]);

  useEffect(() => {
    if (!jumpToPosition || !isReadyRef.current) return;
    const page = Number(jumpToPosition);
    if (Number.isFinite(page) && page > 0 && pageCount > 0) {
      // turnToPage(), not flip(): flip() only animates one adjacent
      // spread-step regardless of the target index (confirmed against
      // the library's own source — it's built for "next/prev toward a
      // known destination", not an arbitrary jump), so a seek-slider
      // drag to a distant page would silently only move one step.
      flipBookRef.current?.pageFlip()?.turnToPage(Math.min(pageCount - 1, Math.max(0, page - 1)));
    }
  }, [jumpToPosition, pageCount]);

  const handleFlip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      const newPage = Number(e?.data) + 1;
      if (!Number.isFinite(newPage) || newPage < 1) return;
      setCurrentPage(newPage);
      onPositionChange(String(newPage));
    },
    [onPositionChange]
  );

  const handleInit = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      isReadyRef.current = true;
      // onFlip only fires on a later page turn — without this, the
      // reader never reports its opening position (and the progress
      // scrubber stays frozen at whatever it showed before mount).
      const initPage = Number(e?.data?.page) + 1;
      if (Number.isFinite(initPage) && initPage >= 1) {
        setCurrentPage(initPage);
        onPositionChange(String(initPage));
      }
    },
    [onPositionChange]
  );

  if (isLoading) return <PageSpinner />;
  if (error) return <ErrorBanner message={error} />;

  const isPaperTheme = !settings?.theme || settings.theme === 'paper' || settings.theme === 'sepia';
  const theme = THEME_STYLES[settings?.theme ?? 'paper'];
  const warmth = settings?.temperature ?? 0;
  const initialPageIndex = Math.max(0, Math.min(Math.max(0, pageCount - 1), currentPage - 1));

  // Size each page slot to the PDF's own aspect ratio, fit within the
  // available space, so the rendered page fills its slot exactly
  // instead of being letterboxed inside a mismatched-proportion box.
  const maxSlotWidth = Math.max(180, containerSize.width / 2 - 24);
  const maxSlotHeight = Math.max(240, containerSize.height - 40);
  let bookHeight = Math.min(700, maxSlotHeight);
  let bookWidth = bookHeight * pageAspect;
  if (bookWidth > maxSlotWidth) {
    bookWidth = maxSlotWidth;
    bookHeight = bookWidth / pageAspect;
  }
  bookWidth = Math.round(bookWidth);
  bookHeight = Math.round(bookHeight);

  return (
    <div
      style={{ backgroundColor: theme.bg, filter: `brightness(${settings?.brightness ?? 100}%)` }}
      className="relative flex h-full w-full flex-col items-center justify-between overflow-hidden p-2 select-none transition-colors duration-300"
    >
      {isScannedPdf && (
        <div className="absolute top-2 z-20 flex items-center gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-1 text-xs text-amber-900 shadow-sm">
          <Info className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Scanned image PDF — page-level navigation and fallback mapping active.</span>
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          backgroundImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.06) 0%, transparent 70%)',
        }}
        className="flex flex-1 w-full items-center justify-center overflow-hidden p-1 sm:p-2"
      >
        {pageCount > 0 && (
          <HTMLFlipBook
            key={`${pageCount}-${bookWidth}-${bookHeight}`}
            ref={flipBookRef}
            width={bookWidth}
            height={bookHeight}
            size="fixed"
            showCover
            startPage={initialPageIndex}
            drawShadow
            flippingTime={700}
            maxShadowOpacity={0.5}
            // Only the bottom nav, an edge click, or an actual drag/swipe
            // should turn a page — not a passive mouse hover (the
            // library's default corner-fold preview) or a click anywhere
            // on the page body (which would fight text selection).
            showPageCorners={false}
            disableFlipByClick
            className="rounded-sm shadow-[0_25px_60px_rgba(0,0,0,0.35)]"
            style={{}}
            onFlip={handleFlip}
            onInit={handleInit}
          >
            {Array.from({ length: pageCount }, (_, i) => {
              const pageNum = i + 1;
              const active = Math.abs(pageNum - currentPage) <= RENDER_WINDOW;
              return (
                <PdfPage
                  key={`${pageNum}-${zoomScale}`}
                  pageNum={pageNum}
                  doc={docRef.current}
                  active={active}
                  zoomScale={zoomScale}
                  paperBg={theme.paperBg}
                  isPaperTheme={isPaperTheme}
                />
              );
            })}
          </HTMLFlipBook>
        )}
      </div>

      {warmth > 0 && (
        <div
          aria-hidden="true"
          style={{ backgroundColor: `rgba(255, 160, 40, ${(warmth / 100) * 0.35})`, mixBlendMode: 'multiply' }}
          className="pointer-events-none absolute inset-0 z-30 transition-opacity duration-300"
        />
      )}

      <div className="z-40 mt-1 flex flex-wrap items-center gap-3 rounded-xl border border-paper-300/80 bg-paper-50/95 px-3 py-1.5 shadow-lg backdrop-blur text-xs text-paper-700">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={handlePrev}
          className="focus-visible:focus-ring rounded-md p-1.5 hover:bg-paper-100 disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="font-semibold text-paper-800">
          Page {currentPage} of {pageCount}
        </span>

        <button
          type="button"
          disabled={currentPage >= pageCount}
          onClick={handleNext}
          className="focus-visible:focus-ring rounded-md p-1.5 hover:bg-paper-100 disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="h-4 w-[1px] bg-paper-300 mx-1" />

        <button
          type="button"
          onClick={() => setZoomScale((z) => Math.max(0.8, z - 0.2))}
          aria-label="Zoom out"
          title="Zoom out"
          className="focus-visible:focus-ring rounded-md p-1.5 hover:bg-paper-100"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11px] font-mono font-semibold text-paper-700 w-9 text-center">
          {Math.round((zoomScale / 1.3) * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoomScale((z) => Math.min(2.5, z + 0.2))}
          aria-label="Zoom in"
          title="Zoom in"
          className="focus-visible:focus-ring rounded-md p-1.5 hover:bg-paper-100"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
