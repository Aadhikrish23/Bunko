import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

interface PdfReaderProps {
  fileUrl: string;
  startPosition: string | null;
  jumpToPosition: string | null;
  onPositionChange: (position: string) => void;
}

// T-029: renders PDF content via pdf.js with page navigation. Our
// canonical position for a PDF is always a bare page number (see
// backend pdf-indexer.ts) — no CFI-style bridging needed.
export function PdfReader({ fileUrl, startPosition, jumpToPosition, onPositionChange }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist's PDFDocumentProxy isn't worth importing just for this ref
  const docRef = useRef<any>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    pdfjsLib
      .getDocument(fileUrl)
      .promise.then((doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setPageCount(doc.numPages);
        const initialPage = startPosition ? Number(startPosition) : 1;
        setCurrentPage(Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1);
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
  }, [fileUrl, startPosition]);

  useEffect(() => {
    if (jumpToPosition) {
      const page = Number(jumpToPosition);
      if (Number.isFinite(page) && page > 0) setCurrentPage(page);
    }
  }, [jumpToPosition]);

  useEffect(() => {
    if (!docRef.current || !canvasRef.current) return;
    let cancelled = false;
    docRef.current.getPage(currentPage).then((page: { getViewport: (o: { scale: number }) => unknown; render: (o: unknown) => { promise: Promise<void> } }) => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale: 1.4 }) as { width: number; height: number };
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      page.render({ canvasContext: context, viewport }).promise.then(() => {
        if (!cancelled) onPositionChange(String(currentPage));
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPositionChange is stable enough per render cycle here
  }, [currentPage]);

  if (isLoading) return <PageSpinner />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="flex h-full flex-col items-center gap-3 overflow-y-auto py-6">
      <canvas ref={canvasRef} className="rounded shadow-card" />
      <div className="flex items-center gap-3 text-sm text-paper-700">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          className="focus-visible:focus-ring rounded-md p-1.5 hover:bg-paper-100 disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span>
          Page {currentPage} of {pageCount}
        </span>
        <button
          type="button"
          disabled={currentPage >= pageCount}
          onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
          className="focus-visible:focus-ring rounded-md p-1.5 hover:bg-paper-100 disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
