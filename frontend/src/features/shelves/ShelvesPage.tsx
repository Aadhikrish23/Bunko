import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Input } from '../../components/ui/Input';
import { PageSpinner } from '../../components/ui/Spinner';
import { useCreateShelf, useDeleteShelf, useRemoveWorkFromShelf, useShelves } from '../../lib/api/shelves';
import { useWorks } from '../../lib/api/works';
import type { ReadingStatus, Work } from '../../lib/api/types';
import { errorMessage } from '../../lib/error-message';
import { STATUS_OPTIONS } from '../library/StatusBadge';
import { groupWorksForShelf } from './group-works';
import { ShelfRow } from './ShelfRow';

const FILTERS: { value: ReadingStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Books' },
  ...STATUS_OPTIONS,
];

// T-016 (frontend): one continuous bookcase, not a stack of separate
// boxes — each user shelf is a row that gets added to the *same* frame
// as the library grows, with library-style filters (status + search)
// narrowing what's visible across every row at once.
export function ShelvesPage() {
  const navigate = useNavigate();
  const works = useWorks({ pageSize: 100 });
  const shelves = useShelves();
  const createShelf = useCreateShelf();
  const deleteShelf = useDeleteShelf();
  const removeFromShelf = useRemoveWorkFromShelf();

  const [statusFilter, setStatusFilter] = useState<ReadingStatus | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newShelfName, setNewShelfName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleCreateShelf() {
    if (!newShelfName.trim()) return;
    setError(null);
    try {
      await createShelf.mutateAsync(newShelfName.trim());
      setNewShelfName('');
      setIsCreating(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not create this shelf.'));
    }
  }

  if (works.isLoading || shelves.isLoading) return <PageSpinner />;
  if (works.isError || shelves.isError) {
    return <ErrorBanner message={errorMessage(works.error ?? shelves.error, 'Could not load your shelves.')} />;
  }

  const lowerQuery = query.trim().toLowerCase();
  const matchesFilter = (work: Work): boolean => {
    if (statusFilter !== 'ALL' && work.status !== statusFilter) return false;
    if (lowerQuery && !work.title.toLowerCase().includes(lowerQuery) && !work.authors.some((a) => a.toLowerCase().includes(lowerQuery))) {
      return false;
    }
    return true;
  };

  const filteredWorks = (works.data?.items ?? []).filter(matchesFilter);
  const allBooksGroups = groupWorksForShelf(filteredWorks);
  const openBook = (workId: string) => navigate(`/library/${workId}`);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-paper-900">Shelves</h1>
          <p className="mt-1 text-sm text-paper-600">Your library, arranged like a real bookcase.</p>
        </div>
        {!isCreating ? (
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4" /> New shelf
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder="Shelf name…"
              value={newShelfName}
              onChange={(e) => setNewShelfName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateShelf()}
            />
            <Button size="sm" onClick={handleCreateShelf} isLoading={createShelf.isPending}>
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
          </div>
        )}
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

      {error && <ErrorBanner message={error} />}

      {/* One continuous bookcase — every row (the auto-grouped "All
          Books" pool, then one per named shelf) shares this single
          wood-frame rather than each getting its own separate card. */}
      <div className="bg-wood-frame flex flex-col gap-5 rounded-xl border border-wood-900/40 p-4 shadow-card">
        {filteredWorks.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-wood-200">No books match this filter.</p>
        ) : (
          allBooksGroups.map((group) => (
            <ShelfRow key={`all-${group.label}`} label={group.label} works={group.works} onOpen={openBook} />
          ))
        )}

        {shelves.data?.map((shelf) => (
          <ShelfRow
            key={shelf.id}
            label={shelf.name}
            works={filteredWorks.filter((work) => work.shelfIds.includes(shelf.id))}
            onOpen={openBook}
            onRemove={(workId) => removeFromShelf.mutate({ shelfId: shelf.id, workId })}
            onDeleteShelf={() => {
              if (confirm(`Delete "${shelf.name}"? The books stay in your library.`)) {
                deleteShelf.mutate(shelf.id);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
