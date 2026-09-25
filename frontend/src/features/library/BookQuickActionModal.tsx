import { BookOpenText, Info, Play } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import { useStartSession } from '../../lib/api/sessions';
import { useWork } from '../../lib/api/works';
import { errorMessage } from '../../lib/error-message';
import { BookCover } from './BookCover';
import { ContinueReadingButton } from './ContinueReadingButton';
import { StatusBadge } from './StatusBadge';

interface BookQuickActionModalProps {
  workId: string;
  onClose: () => void;
}

export function BookQuickActionModal({ workId, onClose }: BookQuickActionModalProps) {
  const navigate = useNavigate();
  const workQuery = useWork(workId);
  const startSession = useStartSession();
  const [error, setError] = useState<string | null>(null);

  const work = workQuery.data;

  // Find digital edition (EPUB or PDF) if available
  const digitalEdition = work?.editions.find(
    (e) => (e.format === 'EPUB' || e.format === 'PDF') && Boolean(e.copyId)
  );

  // Find first available edition with a copy for session
  const defaultEditionWithCopy = work?.editions.find((e) => Boolean(e.copyId));

  async function handleStartSession() {
    if (!defaultEditionWithCopy?.copyId) {
      navigate(`/library/${workId}`);
      return;
    }
    setError(null);
    try {
      await startSession.mutateAsync({ copyId: defaultEditionWithCopy.copyId });
      if (defaultEditionWithCopy.format === 'EPUB' || defaultEditionWithCopy.format === 'PDF') {
        navigate(`/read-chapters/${defaultEditionWithCopy.id}`, { state: { coverImageUrl: work?.coverImageUrl } });
      } else {
        navigate(`/library/${workId}`);
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not start reading session.'));
    }
  }

  function handleViewDetails() {
    onClose();
    navigate(`/library/${workId}`);
  }

  return (
    <Modal title="Book Options" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {workQuery.isLoading && <PageSpinner />}
        {workQuery.isError && <ErrorBanner message={errorMessage(workQuery.error, 'Could not load book details.')} />}

        {work && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* Book Cover Thumbnail */}
            <div className="w-28 shrink-0 mx-auto sm:mx-0 shadow-md rounded-md overflow-hidden">
              <BookCover title={work.title} coverImageUrl={work.coverImageUrl} />
            </div>

            {/* Book Meta & Quick Actions */}
            <div className="flex flex-1 flex-col gap-3">
              <div>
                <h3 className="text-base font-bold text-paper-900">{work.title}</h3>
                <p className="text-xs text-paper-600">{work.authors.join(', ') || 'Unknown Author'}</p>
                {work.seriesName && <p className="text-xs italic text-moss-800 mt-0.5">{work.seriesName}</p>}
                <div className="mt-2">
                  <StatusBadge status={work.status} />
                </div>
              </div>

              {error && <ErrorBanner message={error} />}

              {/* Action Buttons */}
              <div className="mt-2 flex flex-col gap-2">
                {digitalEdition ? (
                  <ContinueReadingButton journeyId={work.journeyId} edition={digitalEdition} coverImageUrl={work.coverImageUrl} />
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onClose();
                      navigate(`/library/${workId}`);
                    }}
                  >
                    <BookOpenText className="h-4 w-4" /> Open Digital Reader
                  </Button>
                )}

                <Button
                  variant="primary"
                  onClick={handleStartSession}
                  isLoading={startSession.isPending}
                >
                  <Play className="h-4 w-4" /> Start / Resume Reading Session
                </Button>

                <Button variant="ghost" onClick={handleViewDetails}>
                  <Info className="h-4 w-4" /> View Full Book Details
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
