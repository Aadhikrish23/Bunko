import {
  BookOpen,
  Bookmark as BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Languages,
  List,
  MapPinOff,
  MoreHorizontal,
  Music,
  NotebookPen,
  Search,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import HTMLFlipBookImport from 'react-pageflip';
import 'page-flip/src/Style/stPageFlip.css';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { ApiError, api } from '../../lib/api/client';
import { useChapters, useReaderManifest } from '../../lib/api/reader';
import { useEndSession, usePauseActiveSession, useReportProgress } from '../../lib/api/sessions';
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
  useUpdateAnnotation,
} from '../../lib/api/annotations';
import { useCreateNote } from '../../lib/api/notes';
import type { NoteScope, ReadingSession } from '../../lib/api/types';
import { useAddBookmark, useBookmarks, useRemoveBookmark } from '../../lib/api/bookmarks';
import { useAiStatus, useTranslations } from '../../lib/api/ai';
import { COLOR_HEX_MAP, type HighlightColor } from '../../lib/annotation-colors';
import { errorMessage } from '../../lib/error-message';
import { isOfflineSessionId } from '../../lib/offline/local-sessions';
import { useDebouncedCallback } from '../../lib/use-debounced-callback';
import { usePrefersReducedMotion } from '../../lib/use-reduced-motion';
import { TranslatePanel } from '../ai/TranslatePanel';
import { applyTranslations, isRtl, translationsKey, usableTranslations } from '../ai/translation-view';
import { NoteComposerModal } from '../notes/NoteComposerModal';
import { ReaderSoundtrack } from '../soundtrack/ReaderSoundtrack';
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
import {
  createMeasurer,
  findPassage,
  pageForOffset,
  segmentFragment,
  splitParagraphs,
  type Mark,
  type PageFragment,
} from './flow-layout';

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

// Page padding as a fraction of the page's width (CSS resolves a percentage padding on all
// four sides against the width), so the measured text box matches the rendered one.
const MARGIN_SIZE_FRACTION: Record<MarginSize, number> = {
  compact: 0.06,
  standard: 0.08,
  wide: 0.12,
};

// Shared by the rendered page and the offscreen measurer: they must lay out identically.
const HEADING_CLASS = 'mb-4 font-display text-lg';
const TRANSLATION_LABEL_CLASS = 'mb-3 text-xs italic opacity-70';
const PARAGRAPH_GAP = '0.7em';

// About 230 words a minute.
const READING_CHARS_PER_MINUTE = 1400;
// Below this width the book is one page at a time, filling the screen.
const SINGLE_PAGE_BELOW_PX = 768;

interface FlowPage {
  chapterOrder: number;
  chapterLabel: string;
  structuralId: string;
  isChapterStart: boolean;
  fragments: PageFragment[];
  /** Chapter offset where the page starts. */
  start: number;
  // True only for the book's very first unit when it has no extractable
  // text — an EPUB's image-only cover/front-matter spine item, almost
  // always. Chapter-text extraction strips all images (see epub-indexer.ts),
  // so that unit's text is always empty; without this, the reader's very
  // first page would just be blank instead of showing the cover art the
  // rest of the app already has (Work.coverImageUrl).
  isCoverPlaceholder: boolean;
  // A machine translation is shown instead of the book's text (Phase 11).
  translated: boolean;
}

function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the server-side position still works.
  }
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
// Position is a chapter (structuralId, what the server and the continuity
// engine key on) plus a character offset inside it (kept on this device),
// so a change of font size or window lands on the same passage.
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
  // SRS §31 — OS reduce-motion preference. Treated the same as Paginated
  // mode everywhere a page turn would otherwise animate: instant index
  // jump instead of react-pageflip's curl.
  const reducedMotion = usePrefersReducedMotion();
  const useInstantPageTurns = isContinuous ? false : settings.pageTurnMode === 'paginated' || reducedMotion;

  const currentPositionRef = useRef<string | null>(null);
  const currentOffsetRef = useRef(0);
  const hasResolvedInitialPosition = useRef(false);
  const [positionResolved, setPositionResolved] = useState(false);
  const [displayPositionLabel, setDisplayPositionLabel] = useState('');

  // The live session can change under the page: a tab left in the background is paused and
  // resumed (or replaced, once the grace window has passed).
  const sessionIdRef = useRef<string | null>(null);
  const closedRef = useRef(false);
  useEffect(() => {
    if (manifest.data) sessionIdRef.current = manifest.data.sessionId;
  }, [manifest.data?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showSearchDrawer, setShowSearchDrawer] = useState(false);
  const [showAnnotationsDrawer, setShowAnnotationsDrawer] = useState(false);
  const [showChapterList, setShowChapterList] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [showSoundtrack, setShowSoundtrack] = useState(false);
  const [showTranslatePanel, setShowTranslatePanel] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [currentStructuralId, setCurrentStructuralId] = useState<string | null>(null);

  // Chapter translation (SRS §20.5, T-091): the chosen language is
  // remembered per edition on this device; the translations themselves
  // come from the server.
  const [translationLanguage, setTranslationLanguage] = useState<string | null>(() =>
    editionId ? readLocal(`bunko_translate_lang_${editionId}`) : null,
  );
  const [showTranslated, setShowTranslated] = useState(true);
  const aiStatus = useAiStatus();
  const translations = useTranslations(editionId, translationLanguage);
  const usable = usableTranslations(translations.data);
  const usableKey = translationsKey(usable);
  const translationRtl = isRtl(aiStatus.data?.translationLanguages, translationLanguage);
  const translationLanguageName = aiStatus.data?.translationLanguages.find((l) => l.code === translationLanguage)?.name;
  const translationLabelText = `Machine translation${translationLanguageName ? ` into ${translationLanguageName}` : ''} — may contain mistakes.`;

  function changeTranslationLanguage(code: string | null) {
    setTranslationLanguage(code);
    setShowTranslated(true);
    if (!editionId) return;
    try {
      if (code) localStorage.setItem(`bunko_translate_lang_${editionId}`, code);
      else localStorage.removeItem(`bunko_translate_lang_${editionId}`);
    } catch {
      // ignore
    }
  }
  const annotationsQuery = useAnnotations(editionId);
  const annotations = useMemo(() => annotationsQuery.data ?? [], [annotationsQuery.data]);
  const createAnnotation = useCreateAnnotation(editionId);
  const updateAnnotation = useUpdateAnnotation(editionId);
  const deleteAnnotation = useDeleteAnnotation(editionId);
  const createNote = useCreateNote(manifest.data?.workId);
  const bookmarks = useBookmarks(editionId).data ?? [];
  const addBookmark = useAddBookmark(editionId);
  const removeBookmark = useRemoveBookmark(editionId);
  const [activeSelection, setActiveSelection] = useState<{ text: string; x: number; y: number; position: string } | null>(
    null
  );
  const [endedSession, setEndedSession] = useState<{ durationSeconds: number | null } | null>(null);
  const [reflectionError, setReflectionError] = useState<string | null>(null);

  const [containerSize, setContainerSize] = useState({ width: 600, height: 800 });
  const committedSizeRef = useRef({ width: 600, height: 800 });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pageflip's ref exposes an untyped pageFlip() instance
  const flipBookRef = useRef<any>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  // A non-adjacent jump (TOC, bookmark, search, scrubber, re-layout) forces
  // a remount by bumping this: react-pageflip's flip()/turnToPage() proved
  // unreliable for a non-adjacent target, so a remount with a fresh
  // startPage is used instead.
  const [jumpNonce, setJumpNonce] = useState(0);

  // The cover is shown as its own full-bleed "closed book" screen rather
  // than inside the flipbook's two-page spread; coverOpened flips true once
  // the reader taps through it.
  const [coverOpened, setCoverOpened] = useState(false);

  // Continuous ("Scroll") mode renders every chapter's full text in one
  // scrollable column instead of the flipbook.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chapterSectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const scrollRafRef = useRef<number | null>(null);
  const [scrollProgressPercent, setScrollProgressPercent] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Pages are measured with the real fonts; re-measure once they've loaded.
  const [fontsVersion, setFontsVersion] = useState(0);
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    let alive = true;
    const bump = () => {
      if (alive) setFontsVersion((v) => v + 1);
    };
    void fonts.ready.then(bump);
    fonts.addEventListener?.('loadingdone', bump);
    return () => {
      alive = false;
      fonts.removeEventListener?.('loadingdone', bump);
    };
  }, []);

  const debouncedReportProgress = useDebouncedCallback((sessionId: string, position: string) => {
    reportProgress.mutate({ sessionId, position });
  }, PROGRESS_DEBOUNCE_MS);

  function handlePositionChange(structuralId: string, offset = 0) {
    currentPositionRef.current = structuralId;
    currentOffsetRef.current = offset;
    setCurrentStructuralId(structuralId);
    const chapter = chapters.data?.chapters.find((c) => c.structuralId === structuralId);
    if (chapter) setDisplayPositionLabel(chapter.label);
    if (editionId) {
      writeLocal(`bunko_flow_pos_${editionId}`, structuralId);
      writeLocal(`bunko_flow_off_${editionId}`, String(offset));
    }
    if (sessionIdRef.current) debouncedReportProgress(sessionIdRef.current, structuralId);
  }

  // A callback ref, because the container only mounts after the loading
  // renders; a plain ref + mount effect would never see it.
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

  // Time away from the book isn't reading time (SRS §12.8): a hidden tab pauses the session
  // and coming back resumes it. Leaving the reader without closing it pauses it too, so it
  // never blocks a session on another book.
  const copyId = manifest.data?.copyId;
  useEffect(() => {
    if (!copyId) return;
    const live = () => {
      const id = sessionIdRef.current;
      return id && !isOfflineSessionId(id) && !closedRef.current ? id : null;
    };
    function onVisibility() {
      const id = live();
      if (!id) return;
      if (document.visibilityState === 'hidden') {
        api.post(`/reading-sessions/${id}/pause`).catch(() => undefined);
      } else {
        api
          .post<ReadingSession>('/reading-sessions', { copyId })
          .then((session) => {
            sessionIdRef.current = session.id;
          })
          .catch(() => undefined);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      const id = live();
      if (id) api.post(`/reading-sessions/${id}/pause`).catch(() => undefined);
    };
  }, [copyId]);

  // Two pages side by side in A4 proportions on a wide screen; one page
  // filling the screen on a phone.
  const isSinglePage = containerSize.width < SINGLE_PAGE_BELOW_PX;
  const CANVAS_MARGIN = isSinglePage ? 8 : 48;
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

  const spreadFit = isSinglePage
    ? { width: Math.round(Math.min(availW, 640)), height: Math.round(availH) }
    : fitA4(Math.min(availW / 2, 560));
  const bookWidth = Math.max(200, spreadFit.width);
  const bookHeight = Math.max(300, spreadFit.height);

  const coverFit = fitA4(Math.min(availW, 640));
  const coverWidth = Math.max(220, coverFit.width);
  const coverHeight = Math.max(320, coverFit.height);

  const brightnessFilter = `brightness(${settings.brightness}%)`;
  const warmthFilter = settings.temperature > 0 ? ` sepia(${(settings.temperature / 100) * 0.5})` : '';
  const pageFilterStyle = { filter: `${brightnessFilter}${warmthFilter}` };

  const pageTextStyle: CSSProperties = {
    fontSize: `${0.95 * settings.fontScale}rem`,
    fontFamily: FONT_FAMILY_STACK[settings.fontFamily],
    lineHeight: settings.lineHeight,
  };

  // Keyed on usableKey, not the query data: progress polling returns new
  // objects every few seconds, and re-paginating on each would keep
  // throwing the reader back to the chapter start.
  const displayChapters = useMemo(
    () =>
      applyTranslations(chapters.data?.chapters ?? [], usable, showTranslated && translationLanguage !== null)
        .slice()
        .sort((a, b) => a.order - b.order),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapters.data, usableKey, showTranslated, translationLanguage],
  );

  const pages = useMemo<FlowPage[]>(() => {
    if (displayChapters.length === 0) return [];
    const pad = bookWidth * MARGIN_SIZE_FRACTION[settings.marginSize];
    const measurer = createMeasurer({
      width: bookWidth - 2 * pad,
      height: bookHeight - 2 * pad - 1,
      fontFamily: FONT_FAMILY_STACK[settings.fontFamily],
      fontSize: `${0.95 * settings.fontScale}rem`,
      lineHeight: settings.lineHeight,
      gap: PARAGRAPH_GAP,
    });
    const result: FlowPage[] = [];
    try {
      displayChapters.forEach((chapter, chapterIndex) => {
        const isCoverPlaceholder = chapterIndex === 0 && chapter.text.trim().length === 0;
        const heading = () => {
          const h = document.createElement('h2');
          h.className = HEADING_CLASS;
          h.style.fontFamily = FONT_FAMILY_STACK[settings.fontFamily];
          h.textContent = chapter.label;
          if (!chapter.translated) return [h];
          const label = document.createElement('p');
          label.className = TRANSLATION_LABEL_CLASS;
          label.textContent = translationLabelText;
          return [h, label];
        };
        const laidOut = isCoverPlaceholder ? [{ fragments: [], start: 0 }] : measurer.layoutChapter(chapter.text, heading);
        laidOut.forEach((page, i) => {
          result.push({
            chapterOrder: chapter.order,
            chapterLabel: chapter.label,
            structuralId: chapter.structuralId,
            isChapterStart: i === 0,
            fragments: page.fragments,
            start: page.start,
            isCoverPlaceholder,
            translated: chapter.translated,
          });
        });
      });
    } finally {
      measurer.dispose();
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayChapters, bookWidth, bookHeight, settings.fontScale, settings.lineHeight, settings.marginSize, settings.fontFamily, fontsVersion, translationLabelText]);

  const pagesRef = useRef<FlowPage[]>([]);
  pagesRef.current = pages;

  // Each chapter's first page index and where each of its pages starts.
  const chapterPages = useMemo(() => {
    const map = new Map<string, { first: number; starts: number[] }>();
    pages.forEach((page, i) => {
      const entry = map.get(page.structuralId);
      if (entry) entry.starts.push(page.start);
      else map.set(page.structuralId, { first: i, starts: [page.start] });
    });
    return map;
  }, [pages]);

  function pageIndexFor(structuralId: string, offset: number): number | null {
    const entry = chapterPages.get(structuralId);
    return entry ? entry.first + pageForOffset(entry.starts, offset) : null;
  }

  // Character totals behind the progress bar and the time-left estimate, so neither depends
  // on font size or window size (R2-16).
  const charIndex = useMemo(() => {
    const before = new Map<string, number>();
    let total = 0;
    for (const chapter of displayChapters) {
      before.set(chapter.structuralId, total);
      total += chapter.text.length;
    }
    return { before, total };
  }, [displayChapters]);

  // Highlights and quotes, located in their chapter's text (R2-01).
  const marksByChapter = useMemo(() => {
    const texts = new Map((chapters.data?.chapters ?? []).map((c) => [c.structuralId, c.text]));
    const map = new Map<string, Mark[]>();
    for (const annotation of annotations) {
      const text = texts.get(annotation.position);
      const range = text ? findPassage(text, annotation.text) : null;
      if (!range) continue;
      const mark = { ...range, color: annotation.color ?? 'yellow', id: annotation.id };
      map.set(annotation.position, [...(map.get(annotation.position) ?? []), mark]);
    }
    return map;
  }, [annotations, chapters.data]);

  const hasCoverPage = Boolean(pages[0]?.isCoverPlaceholder);
  const showCoverSplash = positionResolved && !coverOpened && !isContinuous && hasCoverPage && currentPageIndex === 0;
  const pagesPerView = isSinglePage ? 1 : 2;

  // The first page index of the view (spread) holding page i.
  function viewStart(i: number): number {
    if (pagesPerView === 1) return i;
    if (hasCoverPage) return i === 0 ? 0 : i - ((i - 1) % 2);
    return i - (i % 2);
  }

  function adjacentView(delta: 1 | -1): number {
    const start = viewStart(currentPageIndex);
    if (pagesPerView === 1) return start + delta;
    if (delta === 1) return hasCoverPage && start === 0 ? 1 : start + 2;
    return hasCoverPage && start <= 1 ? 0 : start - 2;
  }

  function scrollToChapter(structuralId: string) {
    chapterSectionRefs.current.get(structuralId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    handlePositionChange(structuralId);
  }

  function showPage(target: number) {
    if (target !== 0) setCoverOpened(true);
    setCurrentPageIndex(target);
    setJumpNonce((n) => n + 1);
    const page = pagesRef.current[target];
    if (page) handlePositionChange(page.structuralId, page.start);
  }

  // Not memoized: it closes over handlePositionChange and the current pages.
  function jumpToStructuralId(structuralId: string, offset = 0) {
    if (isContinuous) {
      scrollToChapter(structuralId);
      return;
    }
    const target = pageIndexFor(structuralId, offset);
    if (target == null) return;
    if (target !== 0) setCoverOpened(true);
    setCurrentPageIndex(target);
    setJumpNonce((n) => n + 1);
    // A jump never fires onFlip, so position tracking is updated here.
    handlePositionChange(structuralId, offset);
  }

  // Where to open: this device's saved chapter and offset, else the
  // server-resolved startPosition (last session, or a continuity mapping).
  useEffect(() => {
    if (hasResolvedInitialPosition.current) return;
    if (pages.length === 0 || !chapters.data || manifest.isLoading) return;
    hasResolvedInitialPosition.current = true;

    const saved = editionId ? readLocal(`bunko_flow_pos_${editionId}`) : null;
    const savedOffset = editionId ? Number(readLocal(`bunko_flow_off_${editionId}`)) || 0 : 0;
    const target = saved ?? manifest.data?.startPosition ?? null;
    if (target) jumpToStructuralId(target, saved ? savedOffset : 0);
    setPositionResolved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, chapters.data, manifest.isLoading, manifest.data, editionId]);

  // A re-layout (font size, margins, window size, fonts loading, a
  // translation) changes every page's contents: stay on the page holding
  // the same passage (R2-12).
  useEffect(() => {
    if (!positionResolved || pages.length === 0) return;
    const sid = currentPositionRef.current;
    const target = sid ? pageIndexFor(sid, currentOffsetRef.current) : null;
    setCurrentPageIndex((idx) => target ?? Math.min(idx, pages.length - 1));
    setJumpNonce((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  // Switching between the book and continuous scroll mid-session.
  const prevModeRef = useRef(settings.pageTurnMode);
  useEffect(() => {
    if (prevModeRef.current === settings.pageTurnMode) return;
    prevModeRef.current = settings.pageTurnMode;
    if (!positionResolved) return;
    const pos = currentPositionRef.current ?? pages[currentPageIndex]?.structuralId;
    if (!pos) return;
    const offset = currentOffsetRef.current;
    const timer = setTimeout(() => jumpToStructuralId(pos, offset), 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.pageTurnMode]);

  const handleFlip = useCallback((e: { data?: unknown }) => {
    const idx = Number(e?.data);
    if (!Number.isFinite(idx)) return;
    setCurrentPageIndex(idx);
    if (idx > 0) setCoverOpened(true);
    const page = pagesRef.current[idx];
    if (page) handlePositionChange(page.structuralId, page.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGoBack = viewStart(currentPageIndex) > 0;
  const canGoForward = adjacentView(1) < pages.length;

  // Paginated mode turns instantly (react-pageflip always animates
  // flipPrev/flipNext, so this jumps to the target view instead).
  function handlePrevPage() {
    if (!canGoBack) return;
    if (useInstantPageTurns) showPage(Math.max(0, adjacentView(-1)));
    else flipBookRef.current?.pageFlip()?.flipPrev();
  }

  function handleNextPage() {
    if (!canGoForward) return;
    if (useInstantPageTurns) showPage(adjacentView(1));
    else flipBookRef.current?.pageFlip()?.flipNext();
  }

  // Arrow keys and Page Up/Down turn pages (R2-17) unless something else has the keyboard.
  const turnRef = useRef({ prev: handlePrevPage, next: handleNextPage });
  turnRef.current = { prev: handlePrevPage, next: handleNextPage };
  const keysEnabled = !isContinuous && !showCoverSplash && !showNoteComposer && !endedSession && !activeSelection;
  useEffect(() => {
    if (!keysEnabled) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        turnRef.current.next();
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        turnRef.current.prev();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keysEnabled]);

  function handleOpenCover() {
    showPage(pages.length > 1 ? 1 : 0);
    setCoverOpened(true);
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

      // "Current" section is whichever one's heading has scrolled past the
      // top edge most recently.
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
      const targetId = currentId ?? earliestId;
      if (targetId) handlePositionChange(targetId);
    });
  }

  const bookPath = manifest.data?.workId ? `/library/${manifest.data.workId}` : '/library';

  async function handleClose() {
    const sessionId = sessionIdRef.current;
    if (!manifest.data || !sessionId) {
      navigate(bookPath);
      return;
    }
    closedRef.current = true;
    try {
      const session = await endSession.mutateAsync({
        sessionId,
        endPosition: currentPositionRef.current ?? undefined,
      });
      setEndedSession({ durationSeconds: session.durationSeconds });
    } catch {
      navigate(bookPath);
    }
  }

  // The reflection is added to the session that just ended (SRS §12.10), then back to the book.
  async function handleReflectionSubmit(reflection: string | null) {
    const sessionId = sessionIdRef.current;
    if (sessionId && reflection) {
      setReflectionError(null);
      try {
        await endSession.mutateAsync({ sessionId, endPosition: currentPositionRef.current ?? undefined, reflection });
      } catch (err) {
        setReflectionError(errorMessage(err, 'Your reflection could not be saved.'));
        return;
      }
    }
    navigate(bookPath, { replace: true });
  }

  function handleAddBookmark() {
    if (!editionId || !currentPositionRef.current) return;
    const chapter = chapters.data?.chapters.find((c) => c.structuralId === currentPositionRef.current);
    addBookmark.mutate({ position: currentPositionRef.current, label: chapter?.label ?? 'Bookmark' });
  }

  function handleRemoveBookmark(bookmarkId: string) {
    removeBookmark.mutate(bookmarkId);
  }

  function handleSaveHighlight(color: HighlightColor, note?: string, isQuote?: boolean) {
    if (!editionId || !activeSelection) return;
    createAnnotation.mutate({
      kind: isQuote ? 'QUOTE' : 'HIGHLIGHT',
      position: activeSelection.position,
      text: activeSelection.text,
      color,
      note,
      sessionId: sessionIdRef.current ?? undefined,
    });
  }

  function handleSaveNote(body: string, scope: NoteScope) {
    if (!manifest.data) return;
    const position = currentPositionRef.current ?? pagesRef.current[currentPageIndex]?.structuralId;
    createNote.mutate(
      {
        scope,
        body,
        position: scope === 'CHAPTER' ? position ?? undefined : undefined,
        copyId: scope === 'CHAPTER' ? manifest.data.copyId : undefined,
        sessionId: sessionIdRef.current ?? undefined,
      },
      { onSuccess: () => setShowNoteComposer(false) },
    );
  }

  function handleMouseUp() {
    const selection = window.getSelection();
    const text = selection?.toString()?.trim();
    if (!selection || !text) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    // The chapter the selection is in (on a spread the two pages can be different chapters).
    const node = selection.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const position =
      element?.closest('[data-sid]')?.getAttribute('data-sid') ??
      currentPositionRef.current ??
      pagesRef.current[currentPageIndex]?.structuralId ??
      '';
    if (!position) return;
    // Highlights and quotes anchor to the book's own text; a selection in a
    // translated chapter would save words that aren't in the book.
    if (displayChapters.find((c) => c.structuralId === position)?.translated) return;
    setActiveSelection({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top,
      position,
    });
  }

  // Swipe to turn on touch screens; the flipbook's own drag is off so text can be selected.
  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function handleTouchEnd(event: TouchEvent) {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch || window.getSelection()?.toString()) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) handleNextPage();
    else handlePrevPage();
  }

  async function handleSearch(query: string): Promise<SearchMatch[]> {
    const q = query.toLowerCase();
    const results: SearchMatch[] = [];
    for (const chapter of chapters.data?.chapters ?? []) {
      const text = chapter.text || '';
      let pos = text.toLowerCase().indexOf(q);
      let count = 0;
      while (pos !== -1 && count < 5) {
        const start = Math.max(0, pos - 40);
        const end = Math.min(text.length, pos + q.length + 40);
        const snippet = text.slice(start, end).replace(/\s+/g, ' ');
        results.push({
          id: `${chapter.structuralId}-${pos}`,
          // The chapter and the match's offset, so the jump lands on the right page.
          target: `${chapter.structuralId}#${pos}`,
          snippet: `...${snippet}...`,
          chapterLabel: chapter.label,
        });
        pos = text.toLowerCase().indexOf(q, pos + q.length);
        count += 1;
      }
    }
    return results;
  }

  function jumpToSearchResult(target: string) {
    const cut = target.lastIndexOf('#');
    if (cut === -1) jumpToStructuralId(target);
    else jumpToStructuralId(target.slice(0, cut), Number(target.slice(cut + 1)) || 0);
  }

  function jumpToAnnotation(position: string) {
    const annotation = annotations.find((a) => a.position === position);
    const text = chapters.data?.chapters.find((c) => c.structuralId === position)?.text;
    const found = annotation && text ? findPassage(text, annotation.text) : null;
    jumpToStructuralId(position, found?.start ?? 0);
  }

  function handleSettingsChange(newSettings: ReaderSettings) {
    setSettings(newSettings);
    saveReaderSettings(newSettings);
  }

  const currentPage = pages[currentPageIndex];
  const charsRead = isContinuous
    ? (scrollProgressPercent / 100) * charIndex.total
    : currentPage
      ? (charIndex.before.get(currentPage.structuralId) ?? 0) + currentPage.start
      : 0;
  const atLastView = !isContinuous && pages.length > 0 && !canGoForward;
  const currentProgressPercent = atLastView
    ? 100
    : isContinuous
      ? scrollProgressPercent
      : charIndex.total > 0
        ? (charsRead / charIndex.total) * 100
        : 0;
  const minutesLeft = charIndex.total > 0 ? Math.max(atLastView ? 0 : 1, Math.ceil((charIndex.total - charsRead) / READING_CHARS_PER_MINUTE)) : null;

  function seekPercent(pct: number) {
    if (isContinuous) {
      const container = scrollContainerRef.current;
      if (!container) return;
      container.scrollTo({ top: (pct / 100) * (container.scrollHeight - container.clientHeight), behavior: 'smooth' });
      return;
    }
    const targetChar = (pct / 100) * charIndex.total;
    let chosen = displayChapters[0];
    for (const chapter of displayChapters) {
      if ((charIndex.before.get(chapter.structuralId) ?? 0) <= targetChar) chosen = chapter;
    }
    if (!chosen) return;
    const offset = Math.max(0, targetChar - (charIndex.before.get(chosen.structuralId) ?? 0));
    const target = pageIndexFor(chosen.structuralId, offset);
    if (target != null) showPage(target);
  }

  const isLoading = manifest.isLoading || chapters.isLoading;

  if (!editionId) return <ErrorBanner message="No edition specified." />;
  if (isLoading) return <PageSpinner />;

  if (manifest.isError || !manifest.data) {
    const errorMsg = errorMessage(manifest.error, 'This book could not be opened.');
    const isConflict = manifest.error instanceof ApiError && manifest.error.status === 409;

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
                Pause that session and read here
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

  const currentChapter = chapters.data.chapters.find((c) => c.structuralId === currentStructuralId) ?? null;
  const isBookmarkedHere = currentStructuralId !== null && bookmarks.some((b) => b.position === currentStructuralId);
  const view = viewStart(currentPageIndex);
  const pageCountLabel =
    pagesPerView === 2 && view + 1 < pages.length && !(hasCoverPage && view === 0)
      ? `Pages ${view + 1}–${view + 2} of ${pages.length}`
      : `Page ${view + 1} of ${pages.length}`;

  const toolbarButton =
    'focus-visible:focus-ring flex items-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-medium hover:bg-paper-100 sm:px-2';
  // On a phone these live in the "More" menu so the toolbar fits.
  const wideOnlyButton = toolbarButton.replace('focus-ring flex', 'focus-ring hidden sm:flex');
  const openOriginal = () =>
    navigate(`/read/${editionId}`, {
      state: { journeyId, structuralId: currentPositionRef.current, fromReadingView: true },
    });

  // Strong enough to see on cream and sepia paper; gentler on a dark page, where light text sits on it.
  const isDarkPage = parseInt(theme.paperBg.slice(1, 3), 16) < 0x80;
  const highlightAlpha = isDarkPage ? 0.35 : 0.9;

  function renderRuns(fragment: PageFragment, marks: Mark[]) {
    return segmentFragment(fragment, marks).map((run, j) => {
      if (!run.mark) return <Fragment key={j}>{run.text}</Fragment>;
      const hex = COLOR_HEX_MAP[run.mark.color as HighlightColor]?.bg ?? COLOR_HEX_MAP.yellow.bg;
      return (
        <mark
          key={j}
          style={{ backgroundColor: tint(hex, highlightAlpha), color: 'inherit', borderRadius: 2, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}
        >
          {run.text}
        </mark>
      );
    });
  }

  function renderPageText(page: FlowPage) {
    const marks = page.translated ? [] : marksByChapter.get(page.structuralId) ?? [];
    return (
      <div data-sid={page.structuralId} className="flex flex-col" style={{ ...pageTextStyle, gap: PARAGRAPH_GAP }}>
        {page.isChapterStart && (
          <h2 className={HEADING_CLASS} style={{ color: theme.text, fontFamily: FONT_FAMILY_STACK[settings.fontFamily] }}>
            {page.chapterLabel}
          </h2>
        )}
        {page.isChapterStart && page.translated && <p className={TRANSLATION_LABEL_CLASS}>{translationLabelText}</p>}
        {page.fragments.map((fragment) => (
          <p key={fragment.start} className="whitespace-pre-line" dir={page.translated && translationRtl ? 'rtl' : undefined}>
            {renderRuns(fragment, marks)}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: theme.bg }} className="flex h-dvh flex-col">
      <header
        style={{ backgroundColor: theme.paperBg, borderColor: theme.border, color: theme.text }}
        className="flex items-center justify-between gap-1 border-b px-2 py-2 sm:px-4"
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close the book"
          title="Close the book"
          className="focus-visible:focus-ring flex items-center gap-1.5 rounded-md p-2 text-sm hover:bg-paper-100"
        >
          <X className="h-4.5 w-4.5" />
        </button>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={() => setShowChapterList((v) => !v)}
            aria-label="Chapters"
            aria-expanded={showChapterList}
            className={toolbarButton}
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
            className={toolbarButton}
          >
            <Highlighter className="h-4 w-4" />
            <span className="hidden sm:inline">Highlights</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNoteComposer(true)}
            aria-label="Add a note"
            title="Add a note"
            className={wideOnlyButton}
          >
            <NotebookPen className="h-4 w-4" />
            <span className="hidden sm:inline">Note</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSoundtrack((v) => !v)}
            aria-label="Reading soundtrack"
            aria-pressed={showSoundtrack}
            title="Soundtrack"
            className={wideOnlyButton}
          >
            <Music className="h-4 w-4" />
            <span className="hidden sm:inline">Music</span>
          </button>

          {!manifest.data.offline && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowTranslatePanel((v) => !v);
                  setShowBookmarks(false);
                  setShowChapterList(false);
                }}
                aria-label="Translate"
                aria-expanded={showTranslatePanel}
                title="Translate"
                className={wideOnlyButton}
              >
                <Languages className="h-4 w-4" />
                <span className="hidden sm:inline">Translate</span>
              </button>
              {showTranslatePanel && (
                <TranslatePanel
                  editionId={editionId}
                  chapter={
                    currentChapter
                      ? {
                          structuralId: currentChapter.structuralId,
                          label: currentChapter.label,
                          length: currentChapter.text.trim().length,
                        }
                      : null
                  }
                  language={translationLanguage}
                  onLanguageChange={changeTranslationLanguage}
                  showTranslated={showTranslated}
                  onShowTranslatedChange={setShowTranslated}
                  translations={translations.data}
                  onClose={() => setShowTranslatePanel(false)}
                />
              )}
            </div>
          )}

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
            className={toolbarButton}
          >
            <Search className="h-4 w-4" />
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
            className={toolbarButton}
          >
            <Sliders className="h-4 w-4" />
            <span className="hidden sm:inline">Appearance</span>
          </button>

          {journeyId && (
            <button
              type="button"
              onClick={() => setShowCorrection(true)}
              aria-label="Not where you left off?"
              title="Not where you left off?"
              className={wideOnlyButton}
            >
              <MapPinOff className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={openOriginal}
            aria-label="View original file"
            title="View original file (for textbooks or technical docs this reflowed view isn't built for)"
            className={wideOnlyButton}
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">View Original</span>
          </button>

          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              aria-label="More"
              aria-expanded={showMore}
              className={toolbarButton}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {showMore && (
              <div className="absolute right-0 top-full z-30 mt-1 flex w-56 flex-col rounded-md border border-paper-200 bg-paper-50 p-1 text-paper-800 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setShowNoteComposer(true);
                    setShowMore(false);
                  }}
                  className="focus-visible:focus-ring flex items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-paper-100"
                >
                  <NotebookPen className="h-4 w-4" aria-hidden="true" /> Add a note
                </button>
                {!manifest.data.offline && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowTranslatePanel(true);
                      setShowMore(false);
                    }}
                    className="focus-visible:focus-ring flex items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-paper-100"
                  >
                    <Languages className="h-4 w-4" aria-hidden="true" /> Translate
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowSoundtrack((v) => !v);
                    setShowMore(false);
                  }}
                  className="focus-visible:focus-ring flex items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-paper-100"
                >
                  <Music className="h-4 w-4" aria-hidden="true" /> Reading soundtrack
                </button>
                <button
                  type="button"
                  onClick={openOriginal}
                  className="focus-visible:focus-ring flex items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-paper-100"
                >
                  <BookOpen className="h-4 w-4" aria-hidden="true" /> View original file
                </button>
                {journeyId && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCorrection(true);
                      setShowMore(false);
                    }}
                    className="focus-visible:focus-ring flex items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-paper-100"
                  >
                    <MapPinOff className="h-4 w-4" aria-hidden="true" /> Not where you left off?
                  </button>
                )}
              </div>
            )}
          </div>

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
              aria-label={isBookmarkedHere ? 'Bookmarks (this chapter is bookmarked)' : 'Bookmarks'}
              aria-expanded={showBookmarks}
              title="Bookmarks"
              className={toolbarButton}
            >
              <BookmarkIcon className={`h-4 w-4 ${isBookmarkedHere ? 'fill-current' : ''}`} />
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
                  <p className="px-2 py-2 text-xs text-paper-700 text-center">No bookmarks yet.</p>
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
                          className="text-paper-400 hover:text-ember-600 p-1 rounded"
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


      {showCorrection && journeyId && <CorrectPositionDialog journeyId={journeyId} onClose={() => setShowCorrection(false)} />}

      {showSettingsDrawer && (
        <ReaderSettingsDrawer settings={settings} onChange={handleSettingsChange} onClose={() => setShowSettingsDrawer(false)} />
      )}

      {showSearchDrawer && (
        <InBookSearchDrawer
          onSearch={handleSearch}
          onSelectResult={jumpToSearchResult}
          onClose={() => setShowSearchDrawer(false)}
        />
      )}

      {showAnnotationsDrawer && (
        <AnnotationsDrawer
          editionId={editionId}
          annotations={annotations}
          isLoading={annotationsQuery.isLoading}
          isError={annotationsQuery.isError}
          onSelectAnnotation={jumpToAnnotation}
          onRemoveAnnotation={(id) => deleteAnnotation.mutate(id)}
          onUpdateNote={(id, note) => updateAnnotation.mutate({ id, note })}
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

      <ReaderSoundtrack
        workId={manifest.data?.workId}
        open={showSoundtrack}
        onOpen={() => setShowSoundtrack(true)}
        onClose={() => setShowSoundtrack(false)}
      />

      {showNoteComposer && (
        <NoteComposerModal
          title="Add a note"
          scopeOptions={[
            { value: 'CHAPTER', label: 'This chapter' },
            { value: 'BOOK', label: 'Whole book' },
          ]}
          isSaving={createNote.isPending}
          onSave={handleSaveNote}
          onClose={() => setShowNoteComposer(false)}
        />
      )}

      {endedSession && (
        <ReflectionPrompt
          durationSeconds={endedSession.durationSeconds}
          onSubmit={handleReflectionSubmit}
          isSubmitting={endSession.isPending}
          error={reflectionError}
        />
      )}

      {showChapterList && (
        <div className="max-h-60 overflow-y-auto border-b border-paper-200 bg-paper-50 p-2">
          <ul className="flex flex-col gap-0.5">
            {displayChapters.map((chapter) => (
              <li key={chapter.structuralId}>
                <button
                  type="button"
                  onClick={() => {
                    jumpToStructuralId(chapter.structuralId);
                    setShowChapterList(false);
                  }}
                  aria-current={chapter.structuralId === currentStructuralId ? 'true' : undefined}
                  className="focus-visible:focus-ring w-full rounded-md px-2 py-1.5 text-left text-sm text-paper-700 hover:bg-paper-100 aria-[current]:font-semibold aria-[current]:text-paper-900"
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
            {displayChapters.map((chapter, chapterIndex) => {
              const isCoverPlaceholder = chapterIndex === 0 && chapter.text.trim().length === 0;
              const marks = chapter.translated ? [] : marksByChapter.get(chapter.structuralId) ?? [];
              return (
                <section
                  key={chapter.structuralId}
                  data-sid={chapter.structuralId}
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
                      {chapter.translated && <p className={TRANSLATION_LABEL_CLASS}>{translationLabelText}</p>}
                      <div
                        dir={chapter.translated && translationRtl ? 'rtl' : undefined}
                        className="flex flex-col"
                        style={{ ...pageTextStyle, fontSize: `${settings.fontScale}rem`, gap: PARAGRAPH_GAP }}
                      >
                        {splitParagraphs(chapter.text).map((para) => (
                          <p key={para.start} className="whitespace-pre-line">
                            {renderRuns({ text: para.text, start: para.start, end: para.start + para.text.length, continued: false }, marks)}
                          </p>
                        ))}
                      </div>
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
            style={{
              width: coverWidth,
              height: coverHeight,
              backgroundColor: coverImageUrl ? undefined : theme.paperBg,
              ...pageFilterStyle,
            }}
            className="group focus-visible:focus-ring relative overflow-hidden rounded-sm shadow-[0_35px_70px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-1"
          >
            {coverImageUrl ? (
              <img src={coverImageUrl} alt="Book cover — tap to open" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-8 text-center">
                <span className="font-display text-xl" style={{ color: theme.text }}>
                  {pages[0]?.chapterLabel}
                </span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/40 to-transparent" />
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
              <span className="mb-6 rounded-full bg-paper-50/90 px-4 py-1.5 text-xs font-semibold text-paper-900 shadow">Tap to open</span>
            </div>
          </button>
        </div>
      ) : (
        <div
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ backgroundImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.06) 0%, transparent 70%)' }}
          className="flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-4"
        >
          <HTMLFlipBook
            key={`${pages.length}-${bookWidth}-${bookHeight}-${pagesPerView}-${jumpNonce}`}
            ref={flipBookRef}
            width={bookWidth}
            height={bookHeight}
            size="fixed"
            startPage={currentPageIndex}
            showCover={hasCoverPage}
            usePortrait={isSinglePage}
            drawShadow
            flippingTime={useInstantPageTurns ? 1 : 700}
            maxShadowOpacity={0.5}
            showPageCorners={false}
            disableFlipByClick
            // Mouse and touch go to the text (selecting, highlighting); pages
            // turn with the buttons, the arrow keys, or a swipe (R2-08).
            useMouseEvents={false}
            className="rounded-sm shadow-[0_25px_60px_rgba(0,0,0,0.35)]"
            style={{}}
            onFlip={handleFlip}
          >
            {/* react-pageflip rewrites the whole style attribute of each
                page element it's given, so theme, padding and filter live on
                an inner div it never touches. */}
            {pages.map((page, i) =>
              page.isCoverPlaceholder ? (
                <div key={i} className="h-full w-full overflow-hidden [backface-visibility:hidden]">
                  <div
                    style={{ backgroundColor: theme.paperBg, ...pageFilterStyle }}
                    className="flex h-full w-full items-center justify-center overflow-hidden p-6 text-center"
                  >
                    {coverImageUrl ? (
                      <img src={coverImageUrl} alt={page.chapterLabel} className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-display text-lg" style={{ color: theme.text }}>
                        {page.chapterLabel}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div key={i} className="h-full w-full overflow-hidden [backface-visibility:hidden]">
                  <div
                    style={{
                      backgroundColor: theme.paperBg,
                      color: theme.text,
                      padding: `${MARGIN_SIZE_FRACTION[settings.marginSize] * 100}%`,
                      ...pageFilterStyle,
                    }}
                    className="flex h-full w-full flex-col overflow-hidden select-text"
                  >
                    {renderPageText(page)}
                  </div>
                </div>
              )
            )}
          </HTMLFlipBook>
        </div>
      )}
      </div>

      {positionResolved && !isContinuous && !showCoverSplash && (
        <div
          style={{ backgroundColor: theme.paperBg, borderColor: theme.border, color: theme.text }}
          className="flex items-center justify-center gap-4 border-t py-1.5 text-xs"
        >
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={!canGoBack}
            aria-label="Previous page"
            className="focus-visible:focus-ring rounded-md p-1.5 hover:bg-paper-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-semibold tabular-nums">{pageCountLabel}</span>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={!canGoForward}
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
        minutesLeft={minutesLeft}
        onSeekPercent={seekPercent}
      />
    </div>
  );
}
