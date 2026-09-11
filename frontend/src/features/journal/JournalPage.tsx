import { NotebookPen } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { useJournal } from '../../lib/api/journal';
import { errorMessage } from '../../lib/error-message';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

export function JournalPage() {
  const journal = useJournal();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-paper-900">Journal</h1>
        <p className="mt-1 text-sm text-paper-600">A chronological record of your reading activity.</p>
      </div>

      {journal.isLoading && <PageSpinner />}
      {journal.isError && <ErrorBanner message={errorMessage(journal.error, 'Could not load your journal.')} />}

      {journal.data && journal.data.items.length === 0 && (
        <EmptyState icon={NotebookPen} title="No sessions yet" description="Finish a reading session to see it here." />
      )}

      {journal.data && journal.data.items.length > 0 && (
        <ol className="flex flex-col gap-4">
          {journal.data.items.map((entry) => (
            <li key={entry.id} className="flex gap-4 border-b border-paper-200 pb-4 last:border-0">
              <div className="w-20 flex-shrink-0 pt-0.5 text-xs font-medium text-paper-500">
                {formatDate(entry.startTime)}
              </div>
              <div className="flex-1">
                <p className="text-sm text-paper-800">
                  <span className="font-medium">{formatDuration(entry.durationSeconds)}</span>
                  {entry.startPosition && entry.endPosition && (
                    <span className="text-paper-500"> · {entry.startPosition} → {entry.endPosition}</span>
                  )}
                </p>
                {entry.reflection && <p className="mt-1 text-sm italic text-paper-600">“{entry.reflection}”</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
