import { Bookmark as BookmarkIcon, Highlighter, List, MapPinOff, Search, Sliders, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { ApiError } from '../../lib/api/client';
import { useReaderManifest } from '../../lib/api/reader';
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
import { CorrectPositionDialog } from './CorrectPositionDialog';
import { EpubReader, type EpubTocItem } from './EpubReader';
import { PdfReader } from './PdfReader';
import { ReflectionPrompt } from './ReflectionPrompt';
import { BookFlipWrapper } from './BookFlipWrapper';
import { loadReaderSettings, saveReaderSettings, type ReaderSettings } from './reader-settings';
import { ReaderSettingsDrawer } from './ReaderSettingsDrawer';
import { InBookSearchDrawer, type SearchMatch } from './InBookSearchDrawer';
import { ReaderProgressScrubber } from './ReaderProgressScrubber';
import { AnnotationsDrawer } from './AnnotationsDrawer';
import { TextSelectionToolbar } from './TextSelectionToolbar';

const PROGRESS_DEBOUNCE_MS = 4000;

export function ReaderPage() {
  const { editionId } = useParams<{ editionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const journeyId = (location.state as { journeyId?: string | null } | null)?.journeyId ?? null;
  const manifest = useReaderManifest(editionId);
  const reportProgress = useReportProgress();
  const endSession = useEndSession();
  const pauseActiveSession = usePauseActiveSession();

  const currentPositionRef = useRef<string | null>(null);
  const searchFnRef = useRef<((query: string) => Promise<SearchMatch[]>) | null>(null);

  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => loadReaderSettings());
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showSearchDrawer, setShowSearchDrawer] = useState(false);
  const [showAnnotationsDrawer, setShowAnnotationsDrawer] = useState(false);
  const [annotations, setAnnotations] = useState<HighlightAnnotation[]>([]);
  const [activeSelection, setActiveSelection] = useState<{
    text: string;
    x: number;
    y: number;
    position: string;
  } | null>(null);

  const [savedPosition, setSavedPosition] = useState<string | null>(() => {
    if (editionId) {
      return localStorage.getItem(`bunko_pos_${editionId}`) ?? null;
    }
    return null;
  });

  const [currentProgressPercent, setCurrentProgressPercent] = useState(0);
  const [toc, setToc] = useState<EpubTocItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [endedSession, setEndedSession] = useState<{ durationSeconds: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev'>('next');
  const [isCover, setIsCover] = useState(() => {
    if (!savedPosition) return true;
    const num = Number(savedPosition);
    return num === 1 || num === 0;
  });

  const handleFlipStart = useCallback((direction: 'next' | 'prev') => {
    setFlipDirection(direction);
    setIsFlipping(true);
    const timer = setTimeout(() => setIsFlipping(false), 580);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (editionId) {
      setBookmarks(getBookmarks(editionId));
      setAnnotations(getAnnotations(editionId));
    }
  }, [editionId]);

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

  function handleSettingsChange(newSettings: ReaderSettings) {
    setReaderSettings(newSettings);
    saveReaderSettings(newSettings);
  }

  const handleRegisterSearch = useCallback((fn: (query: string) => Promise<SearchMatch[]>) => {
    searchFnRef.current = fn;
  }, []);

  useEffect(() => {
    if (editionId) setBookmarks(getBookmarks(editionId));
  }, [editionId]);

  const debouncedReportProgress = useDebouncedCallback((sessionId: string, position: string) => {
    reportProgress.mutate({ sessionId, position });
  }, PROGRESS_DEBOUNCE_MS);

  function handlePositionChange(position: string) {
    currentPositionRef.current = position;
    setSavedPosition(position);
    if (editionId) {
      try {
        localStorage.setItem(`bunko_pos_${editionId}`, position);
      } catch {
        // ignore
      }
    }
    if (manifest.data) {
      debouncedReportProgress(manifest.data.sessionId, position);
    }
    const numericPos = Number(position);
    if (Number.isFinite(numericPos) && numericPos > 0) {
      // Estimate percentage assuming numeric page numbers
      const total = toc.length > 0 ? toc.length : 100;
      const pct = Math.min(100, Math.max(0, (numericPos / total) * 100));
      setCurrentProgressPercent(pct);
    }
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
    const label = manifest.data?.format === 'PDF' ? `Page ${currentPositionRef.current}` : 'Bookmark';
    setBookmarks(addBookmark(editionId, currentPositionRef.current, label));
  }

  function handleRemoveBookmark(bookmarkId: string) {
    if (!editionId) return;
    setBookmarks(removeBookmark(editionId, bookmarkId));
  }

  if (manifest.isLoading) return <PageSpinner />;
  if (manifest.isError || !manifest.data || !editionId) {
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
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="text-sm text-paper-300 hover:text-paper-100 underline"
              >
                Go back
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="text-sm text-paper-200 hover:text-paper-50 underline"
              >
                Go back
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (endedSession) {
    return <ReflectionPrompt durationSeconds={endedSession.durationSeconds} onSubmit={handleReflectionSubmit} isSubmitting={endSession.isPending} />;
  }

  return (
    <div className="flex h-screen flex-col bg-paper-100">
      <header className="flex items-center justify-between border-b border-paper-200 bg-paper-50 px-4 py-2">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close reader"
          className="focus-visible:focus-ring rounded-md p-2 text-paper-600 hover:bg-paper-100"
        >
          <X className="h-4.5 w-4.5" />
        </button>

        <div className="flex items-center gap-1">
          {manifest.data.format === 'EPUB' && toc.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowToc((v) => !v);
                  setShowBookmarks(false);
                }}
                aria-label="Table of Contents"
                title="Table of Contents"
                className="focus-visible:focus-ring flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-paper-700 hover:bg-paper-100"
              >
                <List className="h-4 w-4 text-paper-600" />
                <span className="hidden sm:inline">Chapters</span>
              </button>

              {showToc && (
                <div className="absolute left-0 sm:right-0 sm:left-auto top-full z-30 mt-1 max-h-80 w-64 overflow-y-auto rounded-md border border-paper-200 bg-paper-50 p-2 shadow-lg">
                  <h4 className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-paper-500 border-b border-paper-200 mb-1">
                    Chapters / TOC
                  </h4>
                  <ul className="flex flex-col gap-0.5">
                    {toc.map((item, idx) => (
                      <li key={`${item.href}-${idx}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setJumpTo(item.idref || item.href);
                            setShowToc(false);
                          }}
                          className="focus-visible:focus-ring w-full rounded px-2 py-1.5 text-left text-xs font-medium text-paper-700 hover:bg-moss-50 hover:text-moss-900 transition-colors truncate"
                        >
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setShowAnnotationsDrawer((v) => !v);
              setShowSearchDrawer(false);
              setShowSettingsDrawer(false);
              setShowToc(false);
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
              setShowToc(false);
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
              setShowToc(false);
              setShowBookmarks(false);
            }}
            aria-label="Reader appearance & settings"
            title="Appearance & 3D Reader"
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

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowBookmarks((v) => !v);
                setShowToc(false);
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
                            setJumpTo(bookmark.position);
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

      {showCorrection && journeyId && (
        <CorrectPositionDialog journeyId={journeyId} onClose={() => setShowCorrection(false)} />
      )}

      {showSettingsDrawer && (
        <ReaderSettingsDrawer
          settings={readerSettings}
          onChange={handleSettingsChange}
          onClose={() => setShowSettingsDrawer(false)}
        />
      )}

      {showSearchDrawer && (
        <InBookSearchDrawer
          onSearch={async (query) => {
            if (searchFnRef.current) return searchFnRef.current(query);
            return [];
          }}
          onSelectResult={(target) => setJumpTo(target)}
          onClose={() => setShowSearchDrawer(false)}
        />
      )}

      {showAnnotationsDrawer && (
        <AnnotationsDrawer
          annotations={annotations}
          onSelectAnnotation={(target) => setJumpTo(target)}
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

      <div className="flex-1 overflow-hidden">
        <BookFlipWrapper
          settings={readerSettings}
          isFlipping={isFlipping}
          flipDirection={flipDirection}
          isCover={isCover}
        >
          {manifest.data.format === 'EPUB' ? (
            <EpubReader
              fileUrl={manifest.data.fileUrl}
              startPosition={
                savedPosition && /^\d+$/.test(savedPosition) ? manifest.data.startPosition : (savedPosition ?? manifest.data.startPosition)
              }
              jumpToPosition={jumpTo}
              settings={readerSettings}
              onPositionChange={handlePositionChange}
              onTocLoaded={(items) => setToc(items)}
              onRegisterSearch={handleRegisterSearch}
              onTextSelected={(sel) => setActiveSelection(sel)}
              onFlipStart={handleFlipStart}
              onCoverChange={setIsCover}
            />
          ) : (
            <PdfReader
              fileUrl={manifest.data.fileUrl}
              startPosition={savedPosition ?? manifest.data.startPosition}
              jumpToPosition={jumpTo}
              settings={readerSettings}
              onPositionChange={handlePositionChange}
              onRegisterSearch={handleRegisterSearch}
              onTextSelected={(sel) => setActiveSelection(sel)}
              onFlipStart={handleFlipStart}
              onCoverChange={setIsCover}
            />
          )}
        </BookFlipWrapper>
      </div>


      <ReaderProgressScrubber
        currentProgressPercent={currentProgressPercent}
        locationLabel={manifest.data.format === 'PDF' ? `Page ${currentPositionRef.current || 1}` : undefined}
        totalChaptersOrPages={toc.length > 0 ? toc.length : 20}
        onSeekPercent={(pct) => {
          setCurrentProgressPercent(pct);
          if (manifest.data.format === 'PDF') {
            const targetPage = Math.max(1, Math.ceil((pct / 100) * 20));
            setJumpTo(String(targetPage));
          }
        }}
      />
    </div>
  );
}
