import { LibraryBig, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { useWorks } from '../../lib/api/works';
import type { ReadingStatus } from '../../lib/api/types';
import { errorMessage } from '../../lib/error-message';
import { AddBookDialog } from './AddBookDialog';
import { BookCover } from './BookCover';
import { BookQuickActionModal } from './BookQuickActionModal';
import { STATUS_OPTIONS, StatusBadge } from './StatusBadge';

const FILTERS: { value: ReadingStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Books' },
  ...STATUS_OPTIONS,
];

export function LibraryPage() {
  const [statusFilter, setStatusFilter] = useState<ReadingStatus | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [quickActionWorkId, setQuickActionWorkId] = useState<string | null>(null);

  const works = useWorks({ status: statusFilter === 'ALL' ? undefined : statusFilter, q: query || undefined });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-paper-900">Library</h1>
          <p className="mt-1 text-sm text-paper-600">Your books, physical and digital, in one place.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add a book
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`focus-visible:focus-ring rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === filter.value
                  ? 'bg-moss-600 text-paper-50'
                  : 'bg-paper-100 text-paper-700 hover:bg-paper-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or author…"
            className="focus-visible:focus-ring w-full rounded-md border border-paper-300 bg-paper-50 py-2 pl-9 pr-3 text-sm text-paper-900 placeholder:text-paper-400"
          />
        </div>
      </div>

      {works.isLoading && <PageSpinner />}
      {works.isError && <ErrorBanner message={errorMessage(works.error, 'Could not load your library.')} />}

      {works.data && works.data.items.length === 0 && (
        <EmptyState
          icon={LibraryBig}
          title={query || statusFilter !== 'ALL' ? 'No books match' : 'Your library is empty'}
          description={
            query || statusFilter !== 'ALL'
              ? 'Try a different search or filter.'
              : 'Add the first book you’re reading, physical or digital.'
          }
          action={
            !query && statusFilter === 'ALL' ? (
              <Button onClick={() => setIsAddOpen(true)} size="sm">
                <Plus className="h-4 w-4" /> Add a book
              </Button>
            ) : undefined
          }
        />
      )}

      {works.data && works.data.items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 3xl:grid-cols-10">
          {works.data.items.map((work) => (
            <button
              key={work.id}
              type="button"
              onClick={() => setQuickActionWorkId(work.id)}
              className="focus-visible:focus-ring group flex flex-col gap-2 text-left"
            >
              <BookCover
                title={work.title}
                coverImageUrl={work.coverImageUrl}
                className="transition-transform group-hover:-translate-y-0.5"
              />
              <div>
                <p className="line-clamp-2 text-sm font-medium text-paper-900">{work.title}</p>
                <p className="truncate text-xs text-paper-500">{work.authors.join(', ') || 'Unknown author'}</p>
                <div className="mt-1">
                  <StatusBadge status={work.status} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isAddOpen && (
        <AddBookDialog
          onClose={() => setIsAddOpen(false)}
          onAdded={(workId) => {
            setIsAddOpen(false);
            setQuickActionWorkId(workId);
          }}
        />
      )}

      {quickActionWorkId && (
        <BookQuickActionModal
          workId={quickActionWorkId}
          onClose={() => setQuickActionWorkId(null)}
        />
      )}
    </div>
  );
}
