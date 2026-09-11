import ePub from 'epubjs';
import { useEffect, useRef, useState } from 'react';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';

// epubjs ships no usable TypeScript types for Book/Rendition — `any` is
// the honest type here, matching the same pragmatic pattern used on the
// backend for pdfjs-dist.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EpubAny = any;

interface EpubReaderProps {
  fileUrl: string;
  startPosition: string | null;
  jumpToPosition: string | null;
  fontScale: number;
  onPositionChange: (position: string) => void;
}

// T-028: renders EPUB content via epub.js, supports location-based
// (chapter-level) navigation. Our canonical `structuralId` is the
// spine item's idref (see backend epub-indexer.ts), which epub.js's
// spine lookup resolves directly to an href — no CFI bridging needed.
export function EpubReader({ fileUrl, startPosition, jumpToPosition, fontScale, onPositionChange }: EpubReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubAny>(null);
  const renditionRef = useRef<EpubAny>(null);
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const book = ePub(fileUrl);
    bookRef.current = book;
    const rendition = book.renderTo(containerRef.current, { width: '100%', height: '100%', flow: 'paginated' });
    renditionRef.current = rendition;

    rendition.on('relocated', (location: EpubAny) => {
      const href: string = location?.start?.href;
      const spineItem = href ? book.spine.get(href) : null;
      if (spineItem?.idref) {
        onPositionChangeRef.current(spineItem.idref);
      }
    });

    book.ready
      .then(() => {
        const target = startPosition ? book.spine.get(startPosition)?.href : undefined;
        return rendition.display(target);
      })
      .then(() => setIsLoading(false))
      .catch(() => {
        setError('This EPUB could not be opened. The file may be corrupted or in an unsupported format.');
        setIsLoading(false);
      });

    return () => {
      rendition.destroy();
      book.destroy();
    };
    // startPosition is only meant to apply on initial open, not on every
    // change (e.g. after our own onPositionChange fires) — intentionally
    // excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  useEffect(() => {
    if (!jumpToPosition || !bookRef.current || !renditionRef.current) return;
    const spineItem = bookRef.current.spine.get(jumpToPosition);
    if (spineItem?.href) {
      renditionRef.current.display(spineItem.href);
    }
  }, [jumpToPosition]);

  useEffect(() => {
    renditionRef.current?.themes?.fontSize?.(`${Math.round(fontScale * 100)}%`);
  }, [fontScale]);

  return (
    <div className="relative h-full w-full">
      {isLoading && <PageSpinner />}
      {error && (
        <div className="absolute inset-x-0 top-4 mx-auto max-w-md">
          <ErrorBanner message={error} />
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
