import {
  BookOpen,
  Bookmark as BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  List,
  MapPinOff,
  Search,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import HTMLFlipBookImport from 'react-pageflip';
import 'page-flip/src/Style/stPageFlip.css';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { ApiError } from '../../lib/api/client';
import { useChapters, useReaderManifest } from '../../lib/api/reader';
import { useEndSession, usePauseActiveSession, useReportProgress } from '../../lib/api/sessions';
import { addBookmark, getBookmarks, removeBookmark, type Bookmark } from '../../lib/bookmarks';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
  updateAnnotationNote,
  type HighlightAnnotation,
  type HighlightColor,
} from '../../lib/annotations';
import { errorMessage } from '../../lib/error-message';
import { useDebouncedCallback } from '../../lib/use-debounced-callback';
import { AnnotationsDrawer } from './AnnotationsDrawer';
import { CorrectPositionDialog } from './CorrectPositionDialog';
import { InBookSearchDrawer, type SearchMatch } from './InBookSearchDrawer';
import { ReaderProgressScrubber } from './ReaderProgressScrubber';
import { ReaderSettingsDrawer } from './ReaderSettingsDrawer';
import { ReflectionPrompt } from './ReflectionPrompt';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import {
  loadReaderSettings,
  saveReaderSettings,
  THEME_STYLES,
  type MarginSize,
  type ReaderFontFamily,
  type ReaderSettings,
} from './reader-settings';
import { estimateCharsPerPage, paginateText } from './paginate-text';

const PROGRESS_DEBOUNCE_MS = 4000;

// See react-pageflip's IProps note in PdfReader.tsx — its typings require
// every internal setting even though the library's own defaults cover
// them; loosened here for the same reason.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HTMLFlipBook = HTMLFlipBookImport as any;

const FONT_FAMILY_STACK: Record<ReaderFontFamily, string> = {
  serif: "'Lora', Georgia, 'Times New Roman', serif",
  sans: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'Courier New', Courier, monospace",
};

const MARGIN_SIZE_PADDING: Record<MarginSize, string> = {
  compact: '6%',
  standard: '8%',
  wide: '12%',
};

interface FlowPage {
  chapterOrder: number;
  chapterLabel: string;
  structuralId: string;
  isChapterStart: boolean;
  text: string;
  // True only for the book's very first unit when it has no extractable
  // text — an EPUB's image-only cover/front-matter spine item, almost
  // always. Chapter-text extraction strips all images (see epub-indexer.ts),
  // so that unit's text is always empty; without this, the reader's very
  // first page would just be blank instead of showing the cover art the
  // rest of the app already has (Work.coverImageUrl).
  isCoverPlaceholder: boolean;
}

// The unified "personalized book" template for reading extracted
// chapter text — the same template and page-turn animation regardless of
// whether the source was a PDF or an EPUB, since both feed it the same
// shape (Chapter[] from GET /editions/:id/chapters). This is the primary
// reading entry point; /read/:editionId (ReaderPage, format-specific
// PdfReader/EpubReader) is kept as the "View Original" escape hatch for
// books this template handles badly (textbooks, technical docs — see the
// chapter-extraction plan's documented scope).
//
// Position is tracked at chapter granularity (a ChapterUnit's
// structuralId) rather than a format-native CFI/page-number, since the
// pagination here is recomputed per viewport/font-size rather than fixed
// — structuralId is the one anchor that's actually stable, and it's the
// same identifier the continuity engine (mapping-algorithm.ts) already
// keys on.
export function FlowReaderPage() {
  const { editionId } = useParams<{ editionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const routerState = location.state as { journeyId?: string | null; coverImageUrl?: string | null } | null;
  const journeyId = routerState?.journeyId ?? null;
  const coverImageUrl = routerState?.coverImageUrl ?? null;

  const manifest = useReaderManifest(editionId);
  const chapters = useChapters(editionId);
  const reportProgress = useReportProgress();
  const endSession = useEndSession();
  const pauseActiveSession = usePauseActiveSession();

  const settingsInitial = useMemo(() => loadReaderSettings(), []);
  const [settings, setSettings] = useState<ReaderSettings>(settingsInitial);
  const theme = THEME_STYLES[settings.theme];
  const isContinuous = settings.pageTurnMode === 'continuous';

  const currentPositionRef = useRef<string | null>(null);
  const hasResolvedInitialPosition = useRef(false);
  const [positionResolved, setPositionResolved] = useState(false);
  const [displayPositionLabel, setDisplayPositionLabel] = useState('');

  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showSearchDrawer, setShowSearchDrawer] = useState(false);
  const [showAnnotationsDrawer, setShowAnnotationsDrawer] = useState(false);
  const [showChapterList, setShowChapterList] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [annotations, setAnnotations] = useState<HighlightAnnotation[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [activeSelection, setActiveSelection] = useState<{ text: string; x: number; y: number; position: string } | null>(
    null
  );
  const [endedSession, setEndedSession] = useState<{ durationSeconds: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [containerSize, setContainerSize] = useState({ width: 600, height: 800 });
  const committedSizeRef = useRef({ width: 600, height: 800 });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pageflip's ref exposes an untyped pageFlip() instance
  const flipBookRef = useRef<any>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  // A non-adjacent jump (TOC, bookmark, search, scrubber) forces a remount
  // by bumping this — see the original comment history on this component:
  // react-pageflip's flip()/turnToPage() proved unreliable for a
  // non-adjacent target, so a remount with a fresh startPage is used
  // instead, same mechanism as the initial-position resolution below.
  const [jumpNonce, setJumpNonce] = useState(0);

  // The cover is shown as its own full-bleed "closed book" screen (see
  // showCoverSplash below) rather than inside the flipbook's two-page
  // spread — react-pageflip always reserves spread-width space even for
  // a single unpaired cover page, which is what left half the canvas
  // blank next to the cover art. coverOpened flips true once the reader
  // taps through it; it only matters for a book that actually has one
  // (coverImageUrl set and the first unit textless) — anything else
  // never shows the splash, so this default is irrelevant there.
  const [coverOpened, setCoverOpened] = useState(false);

  // Continuous ("Scroll") mode renders every chapter's full text in one
  // scrollable column instead of the flipbook — a materially different
  // layout, not just a flipbook setting, so it's a separate render
  // branch below rather than a flipbook prop.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chapterSectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const scrollRafRef = useRef<number | null>(null);
  const [scrollProgressPercent, setScrollProgressPercent] = useState(0);

  useEffect(() => {
    if (editionId) {
      setBookmarks(getBookmarks(editionId));
      setAnnotations(getAnnotations(editionId));
    }
  }, [editionId]);

  const debouncedReportProgress = useDebouncedCallback((sessionId: string, position: string) => {
    reportProgress.mutate({ sessionId, position });
  }, PROGRESS_DEBOUNCE_MS);

  function handlePositionChange(structuralId: string) {
    currentPositionRef.current = structuralId;
    const chapter = chapters.data?.chapters.find((c) => c.structuralId === structuralId);
    if (chapter) setDisplayPositionLabel(chapter.label);
    if (editionId) {
      try {
        localStorage.setItem(`bunko_flow_pos_${editionId}`, structuralId);
      } catch {
        // ignore
      }
    }
    if (manifest.data) {
      debouncedReportProgress(manifest.data.sessionId, structuralId);
    }
  }

  // A plain ref + `useEffect(..., [])` would only ever attach once, tied
  // to this component's very FIRST render — and this component's first
  // render(s) are the isLoading early-return, before the container div
  // exists at all. That effect would then never re-run once the div
  // actually mounts later, leaving containerSize stuck at its fallback
  // default forever. A callback ref sidesteps that entirely: React calls
  // it with the real node the moment it's actually attached, whichever
  // render that turns out to be.
  const containerCallbackRef = useCallback((el: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const committed = committedSizeRef.current;
      if (Math.abs(width - committed.width) < 24 && Math.abs(height - committed.height) < 24) return;
      committedSizeRef.current = { width, height };
      setContainerSize({ width: Math.max(200, width), height: Math.max(200, height) });
    });
    observer.observe(el);
    resizeObserverRef.current = observer;
  }, []);

  useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

  useEffect(
    () => () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    },
    []
  );

  // A4 portrait proportions (1 : sqrt(2)) for a page — a real book's
  // shape, with genuine margin around it, instead of the previous
  // arbitrary box that left the book looking cramped and tiny against
  // the surrounding empty canvas. The flipbook shows two pages side by
  // side, so each page gets half the available width; the cover splash
  // gets the full width (capped, so it doesn't turn into a comically
  // wide "book" on an ultrawide monitor).
  const CANVAS_MARGIN = 48;
  const availW = Math.max(200, containerSize.width - CANVAS_MARGIN * 2);
  const availH = Math.max(200, containerSize.height - CANVAS_MARGIN * 2);

  function fitA4(maxWidth: number): { width: number; height: number } {
    let width = maxWidth;
    let height = width * Math.SQRT2;
    if (height > availH) {
      height = availH;
      width = height / Math.SQRT2;
    }
    return { width: Math.round(width), height: Math.round(height) };
  }

  const spreadFit = fitA4(Math.min(availW / 2, 560));
  const bookWidth = Math.max(240, spreadFit.width);
  const bookHeight = Math.max(340, spreadFit.height);

  const coverFit = fitA4(Math.min(availW, 640));
  const coverWidth = Math.max(260, coverFit.width);
  const coverHeight = Math.max(370, coverFit.height);

  const brightnessFilter = `brightness(${settings.brightness}%)`;
  const warmthFilter = settings.temperature > 0 ? ` sepia(${(settings.temperature / 100) * 0.5})` : '';
  const pageFilterStyle = { filter: `${brightnessFilter}${warmthFilter}` };

  const pages = useMemo<FlowPage[]>(() => {
    const list = chapters.data?.chapters;
    if (!list || list.length === 0) return [];
    const charsPerPage = estimateCharsPerPage(bookWidth, bookHeight, settings.fontScale);
    const result: FlowPage[] = [];
    const sorted = [...list].sort((a, b) => a.order - b.order);
    sorted.forEach((chapter, chapterIndex) => {
      const chunks = paginateText(chapter.text, charsPerPage);
      chunks.forEach((chunk, i) => {
        result.push({
          chapterOrder: chapter.order,
          chapterLabel: chapter.label,
          structuralId: chapter.structuralId,
          isChapterStart: i === 0,
          text: chunk,
          isCoverPlaceholder: chapterIndex === 0 && chapter.text.trim().length === 0,
        });
      });
    });
    return result;
  }, [chapters.data, bookWidth, bookHeight, settings.fontScale]);

  const pagesRef = useRef<FlowPage[]>([]);
  pagesRef.current = pages;

  const chapterStartPageIndex = useMemo(() => {
    const map = new Map<number, number>();
    pages.forEach((page, i) => {
      if (page.isChapterStart && !map.has(page.chapterOrder)) map.set(page.chapterOrder, i);
    });
    return map;
  }, [pages]);

  const showCoverSplash =
    positionResolved && !coverOpened && !isContinuous && Boolean(coverImageUrl) && pages[0]?.isCoverPlaceholder && currentPageIndex === 0;

  function scrollToChapter(structuralId: string) {
    const el = chapterSectionRefs.current.get(structuralId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    handlePositionChange(structuralId);
  }

  // Not memoized with useCallback: it closes over handlePositionChange,
  // which itself closes over manifest.data — a stale memoization here
  // would freeze that closure's manifest.data at whatever it was on the
  // render that (re-)created it (possibly still undefined, if chapters
  // resolved before the manifest did), silently breaking progress
  // reporting for the rest of the session. It's only ever called from
  // direct event handlers, so losing the memoized identity costs nothing.
  function jumpToStructuralId(structuralId: string) {
    if (isContinuous) {
      scrollToChapter(structuralId);
      return;
    }
    const chapter = chapters.data?.chapters.find((c) => c.structuralId === structuralId);
    if (!chapter) return;
    const target = chapterStartPageIndex.get(chapter.order);
    if (target != null) {
      // A jump only counts as "past the cover" if it doesn't land back on
      // the cover page itself — otherwise resuming exactly where a
      // previous session left off (the cover, page 0) would wrongly skip
      // the splash and fall through to the flipbook's own cover-in-spread
      // rendering instead.
      if (target !== 0) setCoverOpened(true);
      setCurrentPageIndex(target);
      setJumpNonce((n) => n + 1);
      // A jump (unlike a natural flip) never fires onFlip, so position
      // tracking has to be updated here explicitly — otherwise closing
      // right after a TOC/bookmark/search jump would report/save
      // whatever position the last natural flip left behind, not where
      // the reader actually is.
      handlePositionChange(structuralId);
    }
  }

  // Resolve where to open the book: a per-browser saved flow-reader
  // position takes priority (same pattern as ReaderPage's localStorage
  // resume), falling back to the server-resolved startPosition (last
  // session's raw position, or a continuity-mapped structuralId — see
  // resolveStartPosition in reader.service.ts). Runs once, when both the
  // chapter list and the manifest are ready.
  useEffect(() => {
    if (hasResolvedInitialPosition.current) return;
    if (pages.length === 0 || !chapters.data || manifest.isLoading) return;
    hasResolvedInitialPosition.current = true;

    let saved: string | null = null;
    if (editionId) {
      try {
        saved = localStorage.getItem(`bunko_flow_pos_${editionId}`);
      } catch {
        saved = null;
      }
    }
    const target = saved ?? manifest.data?.startPosition ?? null;
    if (target) jumpToStructuralId(target);
    setPositionResolved(true);
    // jumpToStructuralId is intentionally omitted: it's a plain function
    // recreated every render (see its own comment), and the
    // hasResolvedInitialPosition guard above means this must run at most
    // once regardless — depending on it would only add pointless re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, chapters.data, manifest.isLoading, manifest.data, editionId]);

  // Re-sync position when the reader switches between flipbook and
  // continuous scroll mid-session (the two modes track position through
  // entirely different mechanisms) — best-effort, lands on the current
  // chapter's start rather than the exact scroll offset/page.
  const prevModeRef = useRef(settings.pageTurnMode);
  useEffect(() => {
    if (prevModeRef.current === settings.pageTurnMode) return;
    prevModeRef.current = settings.pageTurnMode;
    if (!positionResolved) return;
    const pos = currentPositionRef.current ?? pages[currentPageIndex]?.structuralId;
    if (!pos) return;
    const timer = setTimeout(() => jumpToStructuralId(pos), 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.pageTurnMode]);

  const handleFlip = useCallback((e: { data?: unknown }) => {
    const idx = Number(e?.data);
    if (!Number.isFinite(idx)) return;
    setCurrentPageIndex(idx);
    if (idx > 0) setCoverOpened(true);
    const page = pagesRef.current[idx];
    if (page) handlePositionChange(page.structuralId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePrevPage() {
    flipBookRef.current?.pageFlip()?.flipPrev();
  }

  function handleNextPage() {
    flipBookRef.current?.pageFlip()?.flipNext();
  }

  function handleOpenCover() {
    setCoverOpened(true);
    const nextIdx = pages.length > 1 ? 1 : 0;
    setCurrentPageIndex(nextIdx);
    setJumpNonce((n) => n + 1);
    const nextPage = pages[nextIdx];
    if (nextPage) handlePositionChange(nextPage.structuralId);
  }

  function handleScrollContainerScroll() {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const container = scrollContainerRef.current;
      if (!container) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      const percent = scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0;
      setScrollProgressPercent(Math.max(0, Math.min(100, percent)));

      // "Current" section is whichever one's heading has scrolled past
      // the top edge most recently — nearest-by-absolute-distance would
      // (and did) pick a section the reader has already scrolled well
      // past, whenever some other, not-yet-reached section happened to
      // sit closer in raw pixel terms.
      const containerTop = container.getBoundingClientRect().top;
      let currentId: string | null = null;
      let bestTop = -Infinity;
      let earliestId: string | null = null;
      let earliestTop = Infinity;
      chapterSectionRefs.current.forEach((el, id) => {
        const top = el.getBoundingClientRect().top - containerTop;
        if (top <= 16 && top > bestTop) {
          bestTop = top;
          currentId = id;
        }
        if (top < earliestTop) {
          earliestTop = top;
          earliestId = id;
        }
      });
      // Above every section (scrolled to the very top) — fall back to
      // whichever section is nearest, i.e. the first one.
      const targetId = currentId ?? earliestId;
      if (targetId) handlePositionChange(targetId);
    });
  }

  async function handleClose() {
    if (!manifest.data) {
      navigate(-1);
      return;
    }
    try {
      const session = await endSession.mutateAsync({
        sessionId: manifest.data.sessionId,
        endPosition: currentPositionRef.current ?? undefined,
      });
      setEndedSession({ durationSeconds: session.durationSeconds });
    } catch (err) {
      setError(errorMessage(err, 'Could not end the session.'));
      navigate(-1);
    }
  }

  async function handleReflectionSubmit(reflection: string | null) {
    if (manifest.data && reflection) {
      await endSession.mutateAsync({
        sessionId: manifest.data.sessionId,
        endPosition: currentPositionRef.current ?? undefined,
        reflection,
      });
    }
    navigate(-1);
  }

  function handleAddBookmark() {
    if (!editionId || !currentPositionRef.current) return;
    const chapter = chapters.data?.chapters.find((c) => c.structuralId === currentPositionRef.current);
    setBookmarks(addBookmark(editionId, currentPositionRef.current, chapter?.label ?? 'Bookmark'));
  }

  function handleRemoveBookmark(bookmarkId: string) {
    if (!editionId) return;
    setBookmarks(removeBookmark(editionId, bookmarkId));
  }

  function handleSaveHighlight(color: HighlightColor, note?: string, isQuote?: boolean) {
    if (!editionId || !activeSelection) return;
    const updated = addAnnotation(editionId, {
      editionId,
      position: activeSelection.position,
      text: activeSelection.text,
      color,
      note,
      isQuote,
    });
    setAnnotations(updated);
  }

  function handleMouseUp() {
    const selection = window.getSelection();
    const text = selection?.toString()?.trim();
    if (!text || text.length === 0) return;
    const range = selection?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();
    const position = currentPositionRef.current ?? pagesRef.current[currentPageIndex]?.structuralId ?? '';
    if (!position) return;
    setActiveSelection({
      text,
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top : window.innerHeight / 2 - 40,
      position,
    });
  }

  async function handleSearch(query: string): Promise<SearchMatch[]> {
    const list = chapters.data?.chapters ?? [];
    const q = query.toLowerCase();
    const results: SearchMatch[] = [];
    for (const chapter of list) {
      const text = chapter.text || '';
      let pos = text.toLowerCase().indexOf(q);
      let count = 0;
      while (pos !== -1 && count < 5) {
        const start = Math.max(0, pos - 40);
        const end = Math.min(text.length, pos + q.length + 40);
        const snippet = text.slice(start, end).replace(/\s+/g, ' ');
        results.push({
          id: `${chapter.structuralId}-${pos}`,
          target: chapter.structuralId,
          snippet: `...${snippet}...`,
          chapterLabel: chapter.label,
        });
        pos = text.toLowerCase().indexOf(q, pos + q.length);
        count += 1;
      }
    }
    return results;
  }

  function handleSettingsChange(newSettings: ReaderSettings) {
    setSettings(newSettings);
    saveReaderSettings(newSettings);
  }

  const currentProgressPercent = isContinuous
    ? scrollProgressPercent
    : pages.length > 1
      ? (currentPageIndex / (pages.length - 1)) * 100
      : 0;

  const isLoading = manifest.isLoading || chapters.isLoading;

  if (!editionId) return <ErrorBanner message="No edition specified." />;
  if (isLoading) return <PageSpinner />;

  if (manifest.isError || !manifest.data) {
    const errorMsg = errorMessage(manifest.error, 'This book could not be opened.');
    const isConflict =
      (manifest.error instanceof ApiError && manifest.error.status === 409) ||
      errorMsg.toLowerCase().includes('another session');

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-paper-900 p-6 text-center">
        <div className="w-full max-w-md">
          <ErrorBanner message={errorMsg} />
          {isConflict ? (
            <div className="mt-4 flex flex-col gap-3">
              <Button
                variant="primary"
                onClick={async () => {
                  await pauseActiveSession.mutateAsync();
                  manifest.refetch();
                }}
                isLoading={pauseActiveSession.isPending}
              >
                Pause other session &amp; read here
              </Button>
              <button type="button" onClick={() => navigate(-1)} className="text-sm text-paper-300 hover:text-paper-100 underline">
                Go back
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <button type="button" onClick={() => navigate(-1)} className="text-sm text-paper-200 hover:text-paper-50 underline">
                Go back
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (chapters.isError || !chapters.data) {
    return <ErrorBanner message="Could not load this book's chapters." />;
  }

  if (endedSession) {
    return <ReflectionPrompt durationSeconds={endedSession.durationSeconds} onSubmit={handleReflectionSubmit} isSubmitting={endSession.isPending} />;
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

  const sortedChapters = chapters.data.chapters.slice().sort((a, b) => a.order - b.order);

  return (
    <div style={{ backgroundColor: theme.bg }} className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-paper-200 bg-paper-50 px-4 py-2">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close reader"
          className="focus-visible:focus-ring flex items-center gap-1.5 rounded-md p-2 text-sm text-paper-600 hover:bg-paper-100"
        >
          <X className="h-4.5 w-4.5" />
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowChapterList((v) => !v)}
            className="focus-visible:focus-ring flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-paper-700 hover:bg-paper-100"
          >
            <List className="h-4 w-4" /> <span className="hidden sm:inline">Chapters</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAnnotationsDrawer((v) => !v);
              setShowSearchDrawer(false);
              setShowSettingsDrawer(false);
              setShowChapterList(false);
              setShowBookmarks(false);
            }}
            aria-label="Highlights & Quotes"
            title="Highlights & Quotes"
            className="focus-visible:focus-ring flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-paper-700 hover:bg-paper-100"
          >
            <Highlighter className="h-4 w-4 text-paper-600" />
            <span className="hidden sm:inline">Highlights</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowSearchDrawer((v) => !v);
              setShowAnnotationsDrawer(false);
              setShowSettingsDrawer(false);
              setShowChapterList(false);
              setShowBookmarks(false);
            }}
            aria-label="Search in book"
            title="Search in book"
            className="focus-visible:focus-ring flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-paper-700 hover:bg-paper-100"
          >
            <Search className="h-4 w-4 text-paper-600" />
            <span className="hidden sm:inline">Search</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowSettingsDrawer((v) => !v);
              setShowAnnotationsDrawer(false);
              setShowSearchDrawer(false);
              setShowChapterList(false);
              setShowBookmarks(false);
            }}
            aria-label="Reader appearance & settings"
            title="Appearance"
            className="focus-visible:focus-ring flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-paper-700 hover:bg-paper-100"
          >
            <Sliders className="h-4 w-4 text-paper-600" />
            <span className="hidden sm:inline">Appearance</span>
          </button>

          {journeyId && (
            <button
              type="button"
              onClick={() => setShowCorrection(true)}
              aria-label="Not where you left off?"
              title="Not where you left off?"
              className="focus-visible:focus-ring rounded-md p-2 text-paper-600 hover:bg-paper-100"
            >
              <MapPinOff className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate(`/read/${editionId}`, { state: { journeyId } })}
            aria-label="View original file"
            title="View original file (for textbooks or technical docs this reflowed view isn't built for)"
            className="focus-visible:focus-ring flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-paper-700 hover:bg-paper-100"
          >
            <BookOpen className="h-4 w-4 text-paper-600" />
            <span className="hidden sm:inline">View Original</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowBookmarks((v) => !v);
                setShowChapterList(false);
                setShowSettingsDrawer(false);
                setShowSearchDrawer(false);
                setShowAnnotationsDrawer(false);
              }}
              aria-label="Bookmarks"
              title="Bookmarks"
              className="focus-visible:focus-ring rounded-md p-2 text-paper-600 hover:bg-paper-100"
            >
              <BookmarkIcon className="h-4 w-4" />
            </button>

            {showBookmarks && (
              <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-md border border-paper-200 bg-paper-50 p-2 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    handleAddBookmark();
                    setShowBookmarks(false);
                  }}
                  className="focus-visible:focus-ring w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-moss-700 hover:bg-moss-50 border border-moss-200/60 mb-1"
                >
                  + Bookmark this spot
                </button>

                {bookmarks.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-paper-500 text-center">No bookmarks yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                    {bookmarks.map((bookmark) => (
                      <li key={bookmark.id} className="flex items-center justify-between gap-1 rounded hover:bg-paper-100 p-1">
                        <button
                          type="button"
                          onClick={() => {
                            jumpToStructuralId(bookmark.position);
                            setShowBookmarks(false);
                          }}
                          className="focus-visible:focus-ring flex-1 text-left text-xs text-paper-700 truncate"
                        >
                          {bookmark.label}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveBookmark(bookmark.id);
                          }}
                          aria-label="Delete bookmark"
                          className="text-paper-400 hover:text-red-600 p-1 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="px-4 pt-2">
          <ErrorBanner message={error} />
        </div>
      )}

      {showCorrection && journeyId && <CorrectPositionDialog journeyId={journeyId} onClose={() => setShowCorrection(false)} />}

      {showSettingsDrawer && (
        <ReaderSettingsDrawer settings={settings} onChange={handleSettingsChange} onClose={() => setShowSettingsDrawer(false)} />
      )}

      {showSearchDrawer && (
        <InBookSearchDrawer
          onSearch={handleSearch}
          onSelectResult={(target) => jumpToStructuralId(target)}
          onClose={() => setShowSearchDrawer(false)}
        />
      )}

      {showAnnotationsDrawer && (
        <AnnotationsDrawer
          annotations={annotations}
          onSelectAnnotation={(target) => jumpToStructuralId(target)}
          onRemoveAnnotation={(id) => {
            if (editionId) setAnnotations(removeAnnotation(editionId, id));
          }}
          onUpdateNote={(id, note) => {
            if (editionId) setAnnotations(updateAnnotationNote(editionId, id, note));
          }}
          onClose={() => setShowAnnotationsDrawer(false)}
        />
      )}

      {activeSelection && (
        <TextSelectionToolbar
          selectedText={activeSelection.text}
          x={activeSelection.x}
          y={activeSelection.y}
          onSaveHighlight={handleSaveHighlight}
          onClose={() => setActiveSelection(null)}
        />
      )}

      {showChapterList && (
        <div className="max-h-60 overflow-y-auto border-b border-paper-200 bg-paper-50 p-2">
          <ul className="flex flex-col gap-0.5">
            {sortedChapters.map((chapter) => (
              <li key={chapter.structuralId}>
                <button
                  type="button"
                  onClick={() => {
                    jumpToStructuralId(chapter.structuralId);
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

      <div ref={containerCallbackRef} className="flex flex-1 flex-col overflow-hidden">
      {!positionResolved ? (
        <div className="flex flex-1 items-center justify-center">
          <PageSpinner />
        </div>
      ) : isContinuous ? (
        <div
          ref={scrollContainerRef}
          onScroll={handleScrollContainerScroll}
          onMouseUp={handleMouseUp}
          style={{ backgroundColor: theme.bg, ...pageFilterStyle }}
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto max-w-2xl px-6 py-12 sm:px-10" style={{ color: theme.text }}>
            {sortedChapters.map((chapter, chapterIndex) => {
              const isCoverPlaceholder = chapterIndex === 0 && chapter.text.trim().length === 0;
              return (
                <section
                  key={chapter.structuralId}
                  ref={(el) => {
                    if (el) chapterSectionRefs.current.set(chapter.structuralId, el);
                    else chapterSectionRefs.current.delete(chapter.structuralId);
                  }}
                  className="mb-16 scroll-mt-4"
                >
                  {isCoverPlaceholder && coverImageUrl ? (
                    <img
                      src={coverImageUrl}
                      alt={chapter.label}
                      className="mx-auto mb-4 max-h-[70vh] rounded-sm shadow-[0_25px_60px_rgba(0,0,0,0.35)]"
                    />
                  ) : (
                    <>
                      <h2
                        className="mb-6 font-display text-xl"
                        style={{ color: theme.text, fontFamily: FONT_FAMILY_STACK[settings.fontFamily] }}
                      >
                        {chapter.label}
                      </h2>
                      <p
                        className="whitespace-pre-line text-base"
                        style={{
                          fontFamily: FONT_FAMILY_STACK[settings.fontFamily],
                          lineHeight: settings.lineHeight,
                          fontSize: `${1 * settings.fontScale}rem`,
                        }}
                      >
                        {chapter.text}
                      </p>
                    </>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : showCoverSplash ? (
        <div
          style={{ backgroundImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.08) 0%, transparent 70%)' }}
          className="flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-4"
        >
          <button
            type="button"
            onClick={handleOpenCover}
            aria-label="Open book"
            style={{ width: coverWidth, height: coverHeight, ...pageFilterStyle }}
            className="group focus-visible:focus-ring relative overflow-hidden rounded-sm shadow-[0_35px_70px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-1"
          >
            <img src={coverImageUrl ?? ''} alt="Book cover — tap to open" className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/40 to-transparent" />
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
              <span className="mb-6 rounded-full bg-paper-50/90 px-4 py-1.5 text-xs font-semibold text-paper-900 shadow">Tap to open</span>
            </div>
          </button>
        </div>
      ) : (
        <div
          onMouseUp={handleMouseUp}
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
            flippingTime={settings.pageTurnMode === 'paginated' ? 1 : 700}
            maxShadowOpacity={0.5}
            showPageCorners={false}
            disableFlipByClick
            className="rounded-sm shadow-[0_25px_60px_rgba(0,0,0,0.35)]"
            style={{}}
            onFlip={handleFlip}
          >
            {/* react-pageflip's internal engine imperatively rewrites the
                *entire* style attribute of whatever element it's directly
                given (its own positioning: absolute/width/height/z-index),
                clobbering any custom inline style set there — confirmed
                live: backgroundColor/padding/filter were all silently gone
                from that element shortly after mount, even though React
                had just rendered them. Every page below is therefore just
                a plain flex box for react-pageflip to own; an inner div one
                level deeper (never touched by the library) carries
                background/padding/filter/theme instead. */}
            {pages.map((page, i) =>
              page.isCoverPlaceholder && coverImageUrl ? (
                <div key={i} className="h-full w-full overflow-hidden [backface-visibility:hidden]">
                  <div
                    style={{ backgroundColor: theme.paperBg, ...pageFilterStyle }}
                    className="flex h-full w-full items-center justify-center overflow-hidden"
                  >
                    <img src={coverImageUrl} alt={page.chapterLabel} className="h-full w-full object-cover" />
                  </div>
                </div>
              ) : (
                <div key={i} className="h-full w-full overflow-hidden [backface-visibility:hidden]">
                  <div
                    style={{
                      backgroundColor: theme.paperBg,
                      color: theme.text,
                      padding: MARGIN_SIZE_PADDING[settings.marginSize],
                      ...pageFilterStyle,
                    }}
                    className="flex h-full w-full flex-col overflow-hidden"
                  >
                    {page.isChapterStart && (
                      <h2
                        className="mb-4 font-display text-lg"
                        style={{ color: theme.text, fontFamily: FONT_FAMILY_STACK[settings.fontFamily] }}
                      >
                        {page.chapterLabel}
                      </h2>
                    )}
                    <p
                      className="whitespace-pre-line overflow-hidden text-sm"
                      style={{
                        fontSize: `${0.95 * settings.fontScale}rem`,
                        fontFamily: FONT_FAMILY_STACK[settings.fontFamily],
                        lineHeight: settings.lineHeight,
                      }}
                    >
                      {page.text}
                    </p>
                  </div>
                </div>
              )
            )}
          </HTMLFlipBook>
        </div>
      )}
      </div>

      {positionResolved && !isContinuous && !showCoverSplash && (
        <div className="flex items-center justify-center gap-4 border-t border-paper-200 bg-paper-50 py-1.5 text-xs text-paper-700">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPageIndex <= 0}
            aria-label="Previous page"
            className="focus-visible:focus-ring rounded-md p-1.5 hover:bg-paper-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-semibold text-paper-800">
            Page {currentPageIndex + 1} of {pages.length}
          </span>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPageIndex >= pages.length - 1}
            aria-label="Next page"
            className="focus-visible:focus-ring rounded-md p-1.5 hover:bg-paper-100 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <ReaderProgressScrubber
        currentProgressPercent={currentProgressPercent}
        locationLabel={displayPositionLabel || pages[0]?.chapterLabel}
        totalChaptersOrPages={pages.length}
        onSeekPercent={(pct) => {
          if (isContinuous) {
            const container = scrollContainerRef.current;
            if (!container) return;
            const target = (pct / 100) * (container.scrollHeight - container.clientHeight);
            container.scrollTo({ top: target, behavior: 'smooth' });
            return;
          }
          if (pages.length === 0) return;
          const targetIdx = Math.min(pages.length - 1, Math.max(0, Math.round((pct / 100) * (pages.length - 1))));
          setCoverOpened(true);
          setCurrentPageIndex(targetIdx);
          setJumpNonce((n) => n + 1);
          const target = pages[targetIdx];
          if (target) handlePositionChange(target.structuralId);
        }}
      />
    </div>
  );
}
