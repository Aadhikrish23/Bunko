import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import { ChevronLeft, ChevronRight, Info, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

import type { SearchMatch } from './InBookSearchDrawer';
import type { ReaderSettings } from './reader-settings';

interface PdfReaderProps {
  fileUrl: string;
  startPosition: string | null;
  jumpToPosition: string | null;
  settings?: ReaderSettings;
  onPositionChange: (position: string) => void;
  onRegisterSearch?: (searchFn: (query: string) => Promise<SearchMatch[]>) => void;
  onTextSelected?: (selection: { text: string; x: number; y: number; position: string }) => void;
  onFlipStart?: (direction: 'next' | 'prev') => void;
  onCoverChange?: (isCover: boolean) => void;
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

export function PdfReader({

  fileUrl,
  startPosition,
  jumpToPosition,
  settings,
  onPositionChange,
  onRegisterSearch,
  onTextSelected,
  onFlipStart,
  onCoverChange,
}: PdfReaderProps) {
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const leftTextLayerRef = useRef<HTMLDivElement>(null);
  const rightTextLayerRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leftTaskRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rightTaskRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist's PDFDocumentProxy
  const docRef = useRef<any>(null);

  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(() => {
    const p = startPosition ? Number(startPosition) : 1;
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [zoomScale, setZoomScale] = useState(1.3);
  const [isScannedPdf, setIsScannedPdf] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024));

  const isDualPage = (settings?.pageTurnMode === '3d-flip' || !settings?.pageTurnMode) && windowWidth >= 768;
  const isCover = isDualPage && currentPage === 1;

  useEffect(() => {
    onCoverChange?.(isCover);
  }, [isCover, onCoverChange]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
        const initialPage = startPosition ? Number(startPosition) : 1;
        setCurrentPage(Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1);

        try {
          const firstPage = await doc.getPage(1);
          const textContent = await firstPage.getTextContent();
          if (!textContent.items || textContent.items.length === 0) {
            setIsScannedPdf(true);
          }
        } catch {
          // Ignore text check error
        }

        // Register PDF full-text search
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
  }, [fileUrl, onRegisterSearch, startPosition]);

  const handlePrev = useCallback(() => {
    if (currentPage <= 1) return;
    onFlipStart?.('prev');
    if (isDualPage) {
      if (currentPage === 2) {
        setCurrentPage(1);
      } else {
        setCurrentPage((p) => Math.max(1, p - 2));
      }
    } else {
      setCurrentPage((p) => Math.max(1, p - 1));
    }
  }, [currentPage, isDualPage, onFlipStart]);

  const handleNext = useCallback(() => {
    if (currentPage >= pageCount) return;
    onFlipStart?.('next');
    if (isDualPage) {
      if (currentPage === 1) {
        setCurrentPage(2);
      } else {
        setCurrentPage((p) => Math.min(pageCount > 0 ? pageCount : p, p + 2));
      }
    } else {
      setCurrentPage((p) => Math.min(pageCount > 0 ? pageCount : p, p + 1));
    }
  }, [currentPage, isDualPage, onFlipStart, pageCount]);

  // Keyboard Navigation Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        handlePrev();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        handleNext();
      } else if (e.key === 'Home') {
        onFlipStart?.('prev');
        setCurrentPage(1);
      } else if (e.key === 'End' && pageCount > 0) {
        onFlipStart?.('next');
        setCurrentPage(pageCount);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onFlipStart, pageCount]);

  useEffect(() => {
    if (jumpToPosition) {
      const page = Number(jumpToPosition);
      if (Number.isFinite(page) && page > 0) {
        if (isDualPage && page > 1) {
          const normalized = page % 2 === 0 ? page : page - 1;
          setCurrentPage(normalized);
        } else {
          setCurrentPage(page);
        }
      }
    }
  }, [isDualPage, jumpToPosition]);

  // Canvas and Text Layer Render Effect with Cancellation Safeguard
  useEffect(() => {
    if (!docRef.current) return;
    let cancelled = false;

    const renderPage = async (
      pageNum: number,
      canvas: HTMLCanvasElement | null,
      textLayerContainer: HTMLDivElement | null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      taskRef: React.MutableRefObject<any>
    ) => {
      if (!canvas || !docRef.current || pageNum < 1 || pageNum > docRef.current.numPages) return;

      // Safely cancel previous render task on this canvas if active
      if (taskRef.current) {
        try {
          taskRef.current.cancel();
        } catch {
          // ignore
        }
        taskRef.current = null;
      }

      try {
        const page = await docRef.current.getPage(pageNum);
        if (cancelled || !canvas) return;
        const viewport = page.getViewport({ scale: zoomScale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        if (!context) return;

        const renderTask = page.render({ canvasContext: context, viewport });
        taskRef.current = renderTask;
        await renderTask.promise;

        // Render transparent text layer overlay for native text selection
        if (textLayerContainer && !cancelled) {
          textLayerContainer.innerHTML = '';
          textLayerContainer.style.width = `${viewport.width}px`;
          textLayerContainer.style.height = `${viewport.height}px`;

          const textContent = await page.getTextContent();
          if (cancelled) return;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const TextLayerClass = (pdfjsLib as any).TextLayer;
          if (TextLayerClass) {
            const textLayer = new TextLayerClass({
              textContentSource: textContent,
              container: textLayerContainer,
              viewport: viewport,
            });
            await textLayer.render();
          }
        }
      } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((err as any)?.name !== 'RenderingCancelledException') {
          // Ignore cancellation exceptions
        }
      } finally {
        taskRef.current = null;
      }
    };

    const activeLeftTask = leftTaskRef;
    const activeRightTask = rightTaskRef;

    if (isDualPage) {
      if (currentPage === 1) {
        renderPage(1, leftCanvasRef.current, leftTextLayerRef.current, activeLeftTask);
      } else {
        renderPage(currentPage, leftCanvasRef.current, leftTextLayerRef.current, activeLeftTask);
        if (currentPage + 1 <= docRef.current.numPages) {
          renderPage(currentPage + 1, rightCanvasRef.current, rightTextLayerRef.current, activeRightTask);
        }
      }
    } else {
      renderPage(currentPage, leftCanvasRef.current, leftTextLayerRef.current, activeLeftTask);
    }

    onPositionChange(String(currentPage));

    return () => {
      cancelled = true;
      if (activeLeftTask.current) {
        try {
          activeLeftTask.current.cancel();
        } catch {
          // ignore
        }
      }
      if (activeRightTask.current) {
        try {
          activeRightTask.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [currentPage, isDualPage, onPositionChange, zoomScale]);

  if (isLoading) return <PageSpinner />;
  if (error) return <ErrorBanner message={error} />;

  const isPaperTheme = !settings?.theme || settings.theme === 'paper' || settings.theme === 'sepia';

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-between overflow-hidden p-2 select-none">
      {/* Scanned PDF Capability Notice */}
      {isScannedPdf && (
        <div className="absolute top-2 z-20 flex items-center gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-1 text-xs text-amber-900 shadow-sm">
          <Info className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Scanned image PDF — page-level navigation and fallback mapping active.</span>
        </div>
      )}

      {/* Main Dual-Page or Single-Page Full-Bleed Viewport */}
      <div className="flex flex-1 w-full items-center justify-center overflow-auto p-1 sm:p-2">
        {isDualPage && currentPage === 1 ? (
          /* Closed Book Single Cover Viewport (No blank right page!) */
          <div className="flex h-full w-full items-center justify-center overflow-hidden p-0 m-0">
            <div className="relative flex h-full w-full items-center justify-center">
              <canvas
                ref={leftCanvasRef}
                style={{ mixBlendMode: isPaperTheme ? 'multiply' : 'normal' }}
                className="h-full w-full object-fill block transition-opacity duration-300"
              />
              <div
                ref={leftTextLayerRef}
                className="textLayer absolute inset-0 pointer-events-auto select-text overflow-hidden"
              />
            </div>
          </div>
        ) : isDualPage ? (
          /* Dual-Page Open Book Spread */
          <div className="flex h-full w-full items-center justify-center gap-2 sm:gap-6 px-2">
            {/* Left Page Leaf */}
            <div className="flex flex-1 h-full w-1/2 items-center justify-center overflow-hidden">
              <div className="relative flex items-center justify-center max-h-full max-w-full">
                <canvas
                  ref={leftCanvasRef}
                  style={{ mixBlendMode: isPaperTheme ? 'multiply' : 'normal' }}
                  className="max-h-[78vh] max-w-full object-contain block transition-opacity duration-300"
                />
                <div
                  ref={leftTextLayerRef}
                  className="textLayer absolute inset-0 pointer-events-auto select-text overflow-hidden"
                />
              </div>
            </div>

            {/* Right Page Leaf */}
            <div className="flex flex-1 h-full w-1/2 items-center justify-center overflow-hidden">
              {currentPage + 1 <= pageCount ? (
                <div className="relative flex items-center justify-center max-h-full max-w-full">
                  <canvas
                    ref={rightCanvasRef}
                    style={{ mixBlendMode: isPaperTheme ? 'multiply' : 'normal' }}
                    className="max-h-[78vh] max-w-full object-contain block transition-opacity duration-300"
                  />
                  <div
                    ref={rightTextLayerRef}
                    className="textLayer absolute inset-0 pointer-events-auto select-text overflow-hidden"
                  />
                </div>
              ) : (
                <div className="flex h-[78vh] w-full items-center justify-center text-xs text-paper-400 font-medium">
                  End of Book
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Single-Page Viewport */
          <div className="flex h-full w-full items-center justify-center overflow-hidden">
            <div className="relative flex items-center justify-center max-h-full max-w-full">
              <canvas
                ref={leftCanvasRef}
                style={{ mixBlendMode: isPaperTheme ? 'multiply' : 'normal' }}
                className="max-h-[80vh] max-w-full object-contain block transition-opacity duration-300"
              />
              <div
                ref={leftTextLayerRef}
                className="textLayer absolute inset-0 pointer-events-auto select-text overflow-hidden"
              />
            </div>
          </div>
        )}
      </div>

      {/* PDF Controls Footer */}
      <div className="z-20 mt-1 flex flex-wrap items-center gap-3 rounded-xl border border-paper-300/80 bg-paper-50/95 px-3 py-1.5 shadow-lg backdrop-blur text-xs text-paper-700">
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
          {isDualPage && currentPage === 1
            ? `Cover (Page 1 of ${pageCount})`
            : isDualPage
            ? `Pages ${currentPage}${currentPage + 1 <= pageCount ? `–${currentPage + 1}` : ''} of ${pageCount}`
            : `Page ${currentPage} of ${pageCount}`}
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
