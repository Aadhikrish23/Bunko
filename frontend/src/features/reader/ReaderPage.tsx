import { Bookmark as BookmarkIcon, MapPinOff, Minus, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { useReaderManifest } from '../../lib/api/reader';
import { useEndSession, useReportProgress } from '../../lib/api/sessions';
import { addBookmark, getBookmarks, type Bookmark } from '../../lib/bookmarks';
import { errorMessage } from '../../lib/error-message';
import { useDebouncedCallback } from '../../lib/use-debounced-callback';
import { CorrectPositionDialog } from './CorrectPositionDialog';
import { EpubReader } from './EpubReader';
import { PdfReader } from './PdfReader';
import { ReflectionPrompt } from './ReflectionPrompt';

const PROGRESS_DEBOUNCE_MS = 4000;

export function ReaderPage() {
  const { editionId } = useParams<{ editionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const journeyId = (location.state as { journeyId?: string | null } | null)?.journeyId ?? null;
  const manifest = useReaderManifest(editionId);
  const reportProgress = useReportProgress();
  const endSession = useEndSession();

  const currentPositionRef = useRef<string | null>(null);
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const [fontScale, setFontScale] = useState(1);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [endedSession, setEndedSession] = useState<{ durationSeconds: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editionId) setBookmarks(getBookmarks(editionId));
  }, [editionId]);

  const debouncedReportProgress = useDebouncedCallback((sessionId: string, position: string) => {
    reportProgress.mutate({ sessionId, position });
  }, PROGRESS_DEBOUNCE_MS);

  function handlePositionChange(position: string) {
    currentPositionRef.current = position;
    if (manifest.data) {
      debouncedReportProgress(manifest.data.sessionId, position);
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

  if (manifest.isLoading) return <PageSpinner />;
  if (manifest.isError || !manifest.data || !editionId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-paper-900 p-6">
        <ErrorBanner message={errorMessage(manifest.error, 'This book could not be opened.')} />
        <button onClick={() => navigate(-1)} className="text-sm text-paper-200 underline">
          Go back
        </button>
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
          {manifest.data.format === 'EPUB' && (
            <>
              <button
                type="button"
                onClick={() => setFontScale((s) => Math.max(0.75, s - 0.1))}
                aria-label="Decrease font size"
                className="focus-visible:focus-ring rounded-md p-2 text-paper-600 hover:bg-paper-100"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setFontScale((s) => Math.min(1.6, s + 0.1))}
                aria-label="Increase font size"
                className="focus-visible:focus-ring rounded-md p-2 text-paper-600 hover:bg-paper-100"
              >
                <Plus className="h-4 w-4" />
              </button>
            </>
          )}
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
              onClick={() => setShowBookmarks((v) => !v)}
              aria-label="Bookmarks"
              className="focus-visible:focus-ring rounded-md p-2 text-paper-600 hover:bg-paper-100"
            >
              <BookmarkIcon className="h-4 w-4" />
            </button>
            {showBookmarks && (
              <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-paper-200 bg-paper-50 p-2 shadow-card">
                <button
                  type="button"
                  onClick={() => {
                    handleAddBookmark();
                    setShowBookmarks(false);
                  }}
                  className="focus-visible:focus-ring w-full rounded-md px-2 py-1.5 text-left text-sm text-moss-700 hover:bg-moss-50"
                >
                  + Bookmark this spot
                </button>
                {bookmarks.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-paper-500">No bookmarks yet.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {bookmarks.map((bookmark) => (
                      <li key={bookmark.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setJumpTo(bookmark.position);
                            setShowBookmarks(false);
                          }}
                          className="focus-visible:focus-ring w-full rounded-md px-2 py-1.5 text-left text-sm text-paper-700 hover:bg-paper-100"
                        >
                          {bookmark.label}
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

      <div className="flex-1 overflow-hidden">
        {manifest.data.format === 'EPUB' ? (
          <EpubReader
            fileUrl={manifest.data.fileUrl}
            startPosition={manifest.data.startPosition}
            jumpToPosition={jumpTo}
            fontScale={fontScale}
            onPositionChange={handlePositionChange}
          />
        ) : (
          <PdfReader
            fileUrl={manifest.data.fileUrl}
            startPosition={manifest.data.startPosition}
            jumpToPosition={jumpTo}
            onPositionChange={handlePositionChange}
          />
        )}
      </div>
    </div>
  );
}
