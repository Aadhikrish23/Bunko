import { Info, Play, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Modal } from '../../components/ui/Modal';
import { usePauseActiveSession, useStartSession } from '../../lib/api/sessions';
import { useWork } from '../../lib/api/works';
import { ApiError } from '../../lib/api/client';
import { errorMessage } from '../../lib/error-message';
import { SessionConflict } from './SessionConflict';
import { AddEditionDialog } from './AddEditionDialog';
import { BookCover } from './BookCover';
import { ContinueReadingButton } from './ContinueReadingButton';
import { StatusBadge } from './StatusBadge';

interface BookQuickActionModalProps {
  workId: string;
  onClose: () => void;
}

/**
 * Quick actions for a book from the library grid. Every button does what it says: reading
 * needs a digital copy and a session needs a paper copy, so when one is missing the modal says
 * so and offers to add it, instead of quietly opening the book page.
 */
export function BookQuickActionModal({ workId, onClose }: BookQuickActionModalProps) {
  const navigate = useNavigate();
  const workQuery = useWork(workId);
  const startSession = useStartSession();
  const pauseActiveSession = usePauseActiveSession();
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const work = workQuery.data;
  const digitalEdition = work?.editions.find((e) => (e.format === 'EPUB' || e.format === 'PDF') && Boolean(e.copyId));
  const physicalEdition = work?.editions.find((e) => e.format === 'PHYSICAL' && Boolean(e.copyId));

  async function handleStartSession(takeOver = false) {
    if (!physicalEdition?.copyId) return;
    setError(null);
    setConflict(null);
    try {
      if (takeOver) await pauseActiveSession.mutateAsync();
      await startSession.mutateAsync({ copyId: physicalEdition.copyId });
      onClose();
      // The session timer and "end session" live on the book page.
      navigate(`/library/${workId}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflict(err.message);
      else setError(errorMessage(err, 'Could not start a reading session.'));
    }
  }

  function handleViewDetails() {
    onClose();
    navigate(`/library/${workId}`);
  }

  if (adding && work) {
    return <AddEditionDialog workId={work.id} onClose={() => setAdding(false)} onAdded={() => setAdding(false)} />;
  }

  return (
    <Modal title={work?.title ?? 'Book'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {workQuery.isLoading && (
          <div className="flex gap-4" aria-label="Loading the book">
            <div className="h-40 w-28 shrink-0 rounded-md bg-paper-100 motion-safe:animate-pulse" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <div className="h-4 w-3/4 rounded bg-paper-100 motion-safe:animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-paper-100 motion-safe:animate-pulse" />
            </div>
          </div>
        )}
        {workQuery.isError && <ErrorBanner message={errorMessage(workQuery.error, 'Could not load book details.')} />}

        {work && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="mx-auto w-28 shrink-0 overflow-hidden rounded-md shadow-md sm:mx-0">
              <BookCover title={work.title} coverImageUrl={work.coverImageUrl} />
            </div>

            <div className="flex flex-1 flex-col gap-3">
              <div>
                <p className="text-sm text-paper-700">{work.authors.join(', ') || 'Unknown author'}</p>
                {work.seriesName && <p className="mt-0.5 text-xs italic text-paper-700">{work.seriesName}</p>}
                <div className="mt-2">
                  <StatusBadge status={work.status} />
                </div>
              </div>

              {error && <ErrorBanner message={error} />}
              {conflict && (
                <SessionConflict
                  message={conflict}
                  onTakeOver={() => handleStartSession(true)}
                  isLoading={pauseActiveSession.isPending || startSession.isPending}
                />
              )}

              <div className="mt-1 flex flex-col gap-2">
                {digitalEdition && (
                  <ContinueReadingButton journeyId={work.journeyId} edition={digitalEdition} coverImageUrl={work.coverImageUrl} />
                )}
                {physicalEdition && (
                  <Button variant={digitalEdition ? 'secondary' : 'primary'} onClick={() => handleStartSession()} isLoading={startSession.isPending}>
                    <Play className="h-4 w-4" /> Start a reading session
                  </Button>
                )}
                {!digitalEdition && !physicalEdition && (
                  <p className="text-sm leading-relaxed text-paper-700">
                    Add a copy to read it here or time your reading: upload an EPUB or PDF, or add your paper copy.
                  </p>
                )}
                {!digitalEdition && (
                  <Button variant="secondary" onClick={() => setAdding(true)}>
                    <Plus className="h-4 w-4" /> {physicalEdition ? 'Add a digital copy' : 'Add a copy'}
                  </Button>
                )}
                <Button variant="ghost" onClick={handleViewDetails}>
                  <Info className="h-4 w-4" /> View book details
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
