import { Highlighter, NotebookPen, Quote, StickyNote } from 'lucide-react';
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
              <div className="w-20 flex-shrink-0 pt-0.5 text-xs font-medium text-paper-700">
                {formatDate(entry.startTime)}
              </div>
              <div className="flex-1">
                <p className="text-sm text-paper-800">
                  <span className="font-medium">{formatDuration(entry.durationSeconds)}</span>
                  {entry.startPosition && entry.endPosition && (
                    <span className="text-paper-700"> · {entry.startPosition} → {entry.endPosition}</span>
                  )}
                </p>
                {entry.reflection && <p className="mt-1 text-sm italic text-paper-600">“{entry.reflection}”</p>}

                {(entry.annotations.length > 0 || entry.notes.length > 0) && (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {entry.annotations.map((annotation) => (
                      <li
                        key={annotation.id}
                        className="flex items-start gap-1.5 rounded-md border border-paper-200 bg-paper-100/60 p-2 text-xs text-paper-800"
                      >
                        {annotation.kind === 'QUOTE' ? (
                          <Quote className="mt-0.5 h-3 w-3 shrink-0 text-paper-500" />
                        ) : (
                          <Highlighter className="mt-0.5 h-3 w-3 shrink-0 text-paper-500" />
                        )}
                        <span className="italic">&quot;{annotation.text}&quot;</span>
                        {annotation.note && <span className="text-paper-600"> — {annotation.note}</span>}
                      </li>
                    ))}
                    {entry.notes.map((note) => (
                      <li
                        key={note.id}
                        className="flex items-start gap-1.5 rounded-md border border-moss-200 bg-moss-50/60 p-2 text-xs text-paper-800"
                      >
                        <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-moss-600" />
                        <span>{note.body}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
