import { Highlighter, NotebookPen, Plus, Quote, StickyNote, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { BookCover } from '../library/BookCover';
import { LogSessionDialog } from './LogSessionDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { useDeleteSession, useJournal } from '../../lib/api/journal';
import type { JournalEntry } from '../../lib/api/types';
import { errorMessage } from '../../lib/error-message';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Under a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'Under a minute';
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim() : `${minutes} min`;
}

const FORMAT = { PHYSICAL: 'Paper', EPUB: 'EPUB', PDF: 'PDF' } as const;

export function JournalPage() {
  const journal = useJournal();
  const [logging, setLogging] = useState(false);
  const deleteSession = useDeleteSession();
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-paper-900">Journal</h1>
          <p className="mt-1 text-sm text-paper-600">Every reading session, newest first.</p>
        </div>
        <Button size="sm" onClick={() => setLogging(true)}>
          <Plus className="h-4 w-4" /> Log reading
        </Button>
      </div>
      {logging && <LogSessionDialog onClose={() => setLogging(false)} />}
      {deleteSession.isError && <ErrorBanner message={errorMessage(deleteSession.error, 'Could not delete that session.')} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this session?"
          message={`${formatDuration(deleting.durationSeconds)} of ${deleting.book.title} on ${formatDate(deleting.startTime)} will be removed from your journal and statistics. Highlights and notes from it stay.`}
          confirmLabel="Delete"
          isConfirming={deleteSession.isPending}
          onConfirm={() => deleteSession.mutate(deleting.id, { onSettled: () => setDeleting(null) })}
          onClose={() => setDeleting(null)}
        />
      )}

      {journal.isLoading && <PageSpinner />}
      {journal.isError && <ErrorBanner message={errorMessage(journal.error, 'Could not load your journal.')} />}

      {journal.data && journal.data.items.length === 0 && (
        <EmptyState
          icon={NotebookPen}
          title="Your journal is empty"
          description="It fills itself as you read in Bunko or time a session with a paper book. Read something already? Log it."
          action={
            <Button size="sm" variant="secondary" onClick={() => setLogging(true)}>
              <Plus className="h-4 w-4" /> Log reading
            </Button>
          }
        />
      )}

      {journal.data && journal.data.items.length > 0 && (
        <ol className="flex flex-col gap-4">
          {journal.data.items.map((entry) => (
            <li key={entry.id} className="flex gap-4 border-b border-paper-200 pb-4 last:border-0">
              <div className="w-20 flex-shrink-0 pt-0.5 text-xs font-medium text-paper-700">
                {formatDate(entry.startTime)}
              </div>
              <Link to={`/library/${entry.book.workId}`} className="focus-visible:focus-ring w-10 shrink-0 rounded-md" aria-hidden="true" tabIndex={-1}>
                <BookCover title={entry.book.title} coverImageUrl={entry.book.coverImageUrl} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/library/${entry.book.workId}`}
                  className="focus-visible:focus-ring rounded font-display text-base text-paper-900 hover:text-moss-700"
                >
                  {entry.book.title}
                </Link>
                <p className="mt-0.5 text-sm text-paper-800">
                  <span className="font-medium">{formatDuration(entry.durationSeconds)}</span>
                  <span className="text-paper-700"> · {FORMAT[entry.book.format]}</span>
                  {entry.startLabel && entry.endLabel && entry.startLabel !== entry.endLabel ? (
                    <span className="text-paper-700"> · {entry.startLabel} → {entry.endLabel}</span>
                  ) : entry.endLabel ? (
                    <span className="text-paper-700"> · stopped at {entry.endLabel}</span>
                  ) : null}
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
              <button
                type="button"
                onClick={() => setDeleting(entry)}
                aria-label={`Delete this session of ${entry.book.title}`}
                title="Delete this session"
                className="focus-visible:focus-ring h-8 w-8 shrink-0 self-start rounded-md p-2 text-paper-500 hover:bg-paper-100 hover:text-ember-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
