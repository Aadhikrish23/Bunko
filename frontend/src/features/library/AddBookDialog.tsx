import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { useMetadataSearch } from '../../lib/api/metadata';
import { useCreateWork } from '../../lib/api/works';
import { errorMessage } from '../../lib/error-message';
import { BookCover } from './BookCover';

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

export function AddBookDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (workId: string) => void }) {
  const [query, setQuery] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [showManual, setShowManual] = useState(false);
  // Shared across both flows — Open Library's search has no series data
  // at all (confirmed by hand: a known 5-part series comes back as
  // inconsistent, unlinked duplicates, not clean parts), so this is how
  // a user builds one themselves: tag each part with the same series
  // name as they add it, and SeriesPanel links them on each book's page.
  const [seriesName, setSeriesName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 350);

  const search = useMetadataSearch(debouncedQuery);
  const createWork = useCreateWork();

  async function addFromCandidate(candidate: {
    title: string;
    authors: string[];
    coverImageUrl: string | null;
    externalSource: string;
    externalId: string;
  }) {
    setError(null);
    try {
      const work = await createWork.mutateAsync({
        title: candidate.title,
        authors: candidate.authors,
        coverImageUrl: candidate.coverImageUrl,
        externalSource: candidate.externalSource,
        externalId: candidate.externalId,
        seriesName: seriesName.trim() || null,
      });
      onAdded(work.id);
    } catch (err) {
      setError(errorMessage(err, 'Could not add this book.'));
    }
  }

  async function handleManualSubmit() {
    if (!manualTitle.trim()) return;
    setError(null);
    try {
      const work = await createWork.mutateAsync({
        title: manualTitle.trim(),
        seriesName: seriesName.trim() || null,
      });
      onAdded(work.id);
    } catch (err) {
      setError(errorMessage(err, 'Could not add this book.'));
    }
  }

  return (
    <Modal title="Add a book" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <ErrorBanner message={error} />}

        <Input
          label="Series (optional)"
          placeholder="e.g. Ponniyin Selvan — tag each part the same way"
          value={seriesName}
          onChange={(e) => setSeriesName(e.target.value)}
        />

        {!showManual ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
              <input
                autoFocus
                placeholder="Search by title or author…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="focus-visible:focus-ring w-full rounded-md border border-paper-300 bg-paper-50 py-2 pl-9 pr-3 text-sm text-paper-900 placeholder:text-paper-400"
              />
            </div>

            <div className="max-h-80 overflow-y-auto">
              {search.isFetching && (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              )}
              {!search.isFetching && debouncedQuery && search.data?.length === 0 && (
                <p className="py-6 text-center text-sm text-paper-500">No matches. Try a different search.</p>
              )}
              <ul className="flex flex-col gap-2">
                {search.data?.map((candidate) => (
                  <li key={candidate.externalId}>
                    <button
                      type="button"
                      disabled={createWork.isPending}
                      onClick={() => addFromCandidate(candidate as Parameters<typeof addFromCandidate>[0])}
                      className="focus-visible:focus-ring flex w-full items-center gap-3 rounded-md border border-paper-200 p-2 text-left hover:border-moss-300 hover:bg-moss-50 disabled:opacity-50"
                    >
                      <div className="w-10 flex-shrink-0">
                        <BookCover title={candidate.title} coverImageUrl={candidate.coverImageUrl} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-paper-900">{candidate.title}</p>
                        <p className="truncate text-xs text-paper-500">
                          {candidate.authors.join(', ') || 'Unknown author'}
                          {candidate.firstPublishYear ? ` · ${candidate.firstPublishYear}` : ''}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="focus-visible:focus-ring self-start text-sm text-moss-600 hover:underline"
            >
              Can&rsquo;t find it? Add manually
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              autoFocus
              label="Title"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="e.g. Ponniyin Selvan Part 1: The First Floods"
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowManual(false)}>
                Back to search
              </Button>
              <Button onClick={handleManualSubmit} isLoading={createWork.isPending} disabled={!manualTitle.trim()}>
                Add book
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
