import { ArrowLeft, List } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import HTMLFlipBookImport from 'react-pageflip';
import 'page-flip/src/Style/stPageFlip.css';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { useChapters } from '../../lib/api/reader';
import { loadReaderSettings, THEME_STYLES } from './reader-settings';
import { estimateCharsPerPage, paginateText } from './paginate-text';

// See react-pageflip's IProps note in PdfReader.tsx — its typings require
// every internal setting even though the library's own defaults cover
// them; loosened here for the same reason.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HTMLFlipBook = HTMLFlipBookImport as any;

interface FlowPage {
  chapterIndex: number;
  chapterLabel: string;
  isChapterStart: boolean;
  text: string;
}

// The unified "personalized book" template for reading extracted
// chapter text — the same template regardless of whether the source was
// a PDF or an EPUB, since both feed it the same shape (Chapter[] from
// GET /editions/:id/chapters). Deliberately a separate, additional
// entry point from the primary /read/:editionId flow for now: it does
// not yet auto-start/track a reading session or feed the continuity
// engine's canonical position — see the memory note on this plan for
// what's still deferred (OCR backfill for scanned PDFs, session/
// position integration, AI translation).
export function FlowReaderPage() {
  const { editionId } = useParams<{ editionId: string }>();
  const navigate = useNavigate();
  const chapters = useChapters(editionId);
  const settings = useMemo(() => loadReaderSettings(), []);
  const theme = THEME_STYLES[settings.theme];

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 600, height: 800 });
  const committedSizeRef = useRef({ width: 600, height: 800 });
  const [showChapterList, setShowChapterList] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pageflip's ref exposes an untyped pageFlip() instance
  const flipBookRef = useRef<any>(null);
  // Tracks the current page across natural flips (via onFlip below) so
  // a resize-triggered remount (bookWidth/height changing) reopens at
  // wherever the reader actually is, not back at page 0.
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  // A chapter-list jump forces a remount by bumping this — the library's
  // own flip()/turnToPage() APIs proved unreliable for a non-adjacent
  // target in this configuration (flip() only ever animates one
  // spread-step from wherever it currently is, and turnToPage() didn't
  // visibly move the displayed spread at all). Remounting with a fresh
  // startPage is the same mechanism already used to open the book at
  // the right position on first load, so it's known to work — the
  // tradeoff is losing the flip animation for a jump, which most
  // readers treat as instant anyway for TOC navigation. Kept separate
  // from currentPageIndex so a *natural* flip (which also updates that
  // state) never itself forces a remount.
  const [jumpNonce, setJumpNonce] = useState(0);

  const handleFlip = useCallback((e: { data?: unknown }) => {
    const idx = Number(e?.data);
    if (Number.isFinite(idx)) setCurrentPageIndex(idx);
  }, []);

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

  const bookWidth = Math.round(Math.min(480, Math.max(220, containerSize.width / 2 - 24)));
  const bookHeight = Math.round(Math.min(700, Math.max(300, containerSize.height - 40)));

  const pages = useMemo<FlowPage[]>(() => {
    const list = chapters.data?.chapters;
    if (!list || list.length === 0) return [];
    const charsPerPage = estimateCharsPerPage(bookWidth, bookHeight, settings.fontScale);
    const result: FlowPage[] = [];
    for (const chapter of [...list].sort((a, b) => a.order - b.order)) {
      const chunks = paginateText(chapter.text, charsPerPage);
      chunks.forEach((chunk, i) => {
        result.push({ chapterIndex: chapter.order, chapterLabel: chapter.label, isChapterStart: i === 0, text: chunk });
      });
    }
    return result;
  }, [chapters.data, bookWidth, bookHeight, settings.fontScale]);

  const chapterStartPageIndex = useMemo(() => {
    const map = new Map<number, number>();
    pages.forEach((page, i) => {
      if (page.isChapterStart && !map.has(page.chapterIndex)) map.set(page.chapterIndex, i);
    });
    return map;
  }, [pages]);

  if (!editionId) return <ErrorBanner message="No edition specified." />;
  if (chapters.isLoading) return <PageSpinner />;
  if (chapters.isError || !chapters.data) {
    return <ErrorBanner message="Could not load this book's chapters." />;
  }
  if (pages.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-paper-900 p-6 text-center text-paper-100">
        <p>No extractable text was found for this edition yet.</p>
        <button type="button" onClick={() => navigate(-1)} className="underline">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: theme.bg }} className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-paper-200 bg-paper-50 px-4 py-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="focus-visible:focus-ring flex items-center gap-1.5 rounded-md p-2 text-sm text-paper-600 hover:bg-paper-100"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button
          type="button"
          onClick={() => setShowChapterList((v) => !v)}
          className="focus-visible:focus-ring flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-paper-700 hover:bg-paper-100"
        >
          <List className="h-4 w-4" /> Chapters
        </button>
      </header>

      {showChapterList && (
        <div className="max-h-60 overflow-y-auto border-b border-paper-200 bg-paper-50 p-2">
          <ul className="flex flex-col gap-0.5">
            {chapters.data.chapters
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((chapter) => (
                <li key={chapter.structuralId}>
                  <button
                    type="button"
                    onClick={() => {
                      const target = chapterStartPageIndex.get(chapter.order);
                      if (target != null) {
                        setCurrentPageIndex(target);
                        setJumpNonce((n) => n + 1);
                      }
                      setShowChapterList(false);
                    }}
                    className="focus-visible:focus-ring w-full rounded-md px-2 py-1.5 text-left text-sm text-paper-700 hover:bg-paper-100"
                  >
                    {chapter.label}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div
        ref={containerRef}
        style={{ backgroundImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.06) 0%, transparent 70%)' }}
        className="flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-4"
      >
        <HTMLFlipBook
          key={`${pages.length}-${bookWidth}-${bookHeight}-${jumpNonce}`}
          ref={flipBookRef}
          width={bookWidth}
          height={bookHeight}
          size="fixed"
          startPage={currentPageIndex}
          showCover
          drawShadow
          flippingTime={700}
          maxShadowOpacity={0.5}
          showPageCorners={false}
          disableFlipByClick
          className="rounded-sm shadow-[0_25px_60px_rgba(0,0,0,0.35)]"
          style={{}}
          onFlip={handleFlip}
        >
          {pages.map((page, i) => (
            <div
              key={i}
              style={{ backgroundColor: theme.paperBg, color: theme.text }}
              className="flex h-full w-full flex-col overflow-hidden p-[8%]"
            >
              {page.isChapterStart && (
                <h2 className="mb-4 font-display text-lg" style={{ color: theme.text }}>
                  {page.chapterLabel}
                </h2>
              )}
              <p className="whitespace-pre-line overflow-hidden text-sm leading-relaxed" style={{ fontSize: `${0.95 * settings.fontScale}rem` }}>
                {page.text}
              </p>
            </div>
          ))}
        </HTMLFlipBook>
      </div>
    </div>
  );
}
