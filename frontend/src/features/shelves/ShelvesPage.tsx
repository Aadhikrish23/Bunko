import { Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Input } from '../../components/ui/Input';
import { PageSpinner } from '../../components/ui/Spinner';
import {
  useCreateShelf,
  useDeleteShelf,
  useRemoveWorkFromShelf,
  useSaveShelfArrangement,
  useShelfArrangement,
  useShelves,
} from '../../lib/api/shelves';
import { useWorks } from '../../lib/api/works';
import type { ReadingStatus, Work } from '../../lib/api/types';
import { errorMessage } from '../../lib/error-message';
import { getShelfOrder, saveShelfOrder, sortWorksByOrder } from './shelf-order';
import { groupWorksForShelf } from './group-works';
import { ShelfRow } from './ShelfRow';

import { BookQuickActionModal } from '../library/BookQuickActionModal';

const STATUS_RACKS: { status: ReadingStatus; label: string }[] = [
  { status: 'READING', label: 'Currently Reading' },
  { status: 'WANT_TO_READ', label: 'To Read' },
  { status: 'FINISHED', label: 'Finished' },
  { status: 'DID_NOT_FINISH', label: 'Did Not Finish' },
];

function chunkWorks(works: Work[], size: number): Work[][] {
  if (works.length === 0) return [[]];
  const chunks: Work[][] = [];
  for (let i = 0; i < works.length; i += size) {
    chunks.push(works.slice(i, i + size));
  }
  return chunks;
}

export function ShelvesPage() {
  const works = useWorks({ pageSize: 100 });
  const shelves = useShelves();
  const createShelf = useCreateShelf();
  const deleteShelf = useDeleteShelf();
  const removeFromShelf = useRemoveWorkFromShelf();
  const saveArrangement = useSaveShelfArrangement();

  // Active shelf filter: 'all' | 'status:<STATUS>' | 'shelf:<SHELF_ID>'
  const [activeTabId, setActiveTabId] = useState<string>('all');
  // The account's saved drag-order for the active view, synced so it
  // follows the reader across devices instead of staying stuck in one
  // browser's localStorage (shelf-order.ts stays as the instant-write
  // optimistic cache in front of this).
  const arrangementQuery = useShelfArrangement(activeTabId);
  const [viewMode, setViewMode] = useState<'cover' | 'spine'>('cover');
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newShelfName, setNewShelfName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [quickActionWorkId, setQuickActionWorkId] = useState<string | null>(null);
  const [showDeleteShelfConfirm, setShowDeleteShelfConfirm] = useState(false);

  // Drag and drop state
  const [draggedWorkId, setDraggedWorkId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    workId: string;
    position: 'before' | 'after';
  } | null>(null);

  // Local reordering memory to react immediately to drops
  const [reorderedMap, setReorderedMap] = useState<Record<string, string[]>>({});

  // Once the account's saved order for this view arrives, it's the source
  // of truth — seed it into both the in-memory map and the localStorage
  // cache. Skipped when reorderedMap already has a (more recent, possibly
  // not-yet-synced) local override for this exact tab, so a slow fetch
  // can't stomp on a reorder the reader just made.
  useEffect(() => {
    const workIds = arrangementQuery.data?.workIds;
    if (!workIds || workIds.length === 0) return;
    if (reorderedMap[activeTabId]) return;
    setReorderedMap((prev) => ({ ...prev, [activeTabId]: workIds }));
    saveShelfOrder(activeTabId, workIds);
    // reorderedMap is intentionally excluded: this effect reacts to the
    // query resolving for the current tab, not to every local reorder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrangementQuery.data, activeTabId]);

  // Persists a reorder both locally (instant) and to the account (so it
  // follows across devices) — best-effort: a failed sync just leaves this
  // tab's order device-local until the next successful reorder, same as
  // before this existed.
  function persistShelfOrder(tabKey: string, newOrder: string[]) {
    saveShelfOrder(tabKey, newOrder);
    saveArrangement.mutate({ tabKey, workIds: newOrder });
  }

  async function handleCreateShelf() {
    if (!newShelfName.trim()) return;
    setError(null);
    try {
      const created = await createShelf.mutateAsync(newShelfName.trim());
      setNewShelfName('');
      setIsCreating(false);
      if (created?.id) {
        setActiveTabId(`shelf:${created.id}`);
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not create this shelf.'));
    }
  }

  async function handleConfirmDeleteShelf() {
    if (!activeTab.shelfId) return;
    setError(null);
    try {
      await deleteShelf.mutateAsync(activeTab.shelfId);
      // Only leave the now-deleted tab once the delete actually succeeded —
      // switching first (the old behavior) meant a failed delete left the
      // user on "All Volumes" with no sign anything went wrong.
      setActiveTabId('all');
      setShowDeleteShelfConfirm(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not delete this shelf.'));
      setShowDeleteShelfConfirm(false);
    }
  }

  const allItems = useMemo(() => works.data?.items ?? [], [works.data?.items]);

  // Define tabs with book counts for our catalog card selector
  const shelfTabs = useMemo(() => {
    const tabs: { id: string; label: string; count: number; isCustom?: boolean; shelfId?: string }[] = [
      { id: 'all', label: 'All Volumes', count: allItems.length },
    ];

    // Status racks (only include DID_NOT_FINISH if it has books, always show Reading/To Read/Finished)
    for (const r of STATUS_RACKS) {
      const count = allItems.filter((w) => w.status === r.status).length;
      if (r.status !== 'DID_NOT_FINISH' || count > 0) {
        tabs.push({ id: `status:${r.status}`, label: r.label, count });
      }
    }

    // User's custom shelves
    for (const shelf of shelves.data ?? []) {
      const count = allItems.filter((w) => w.shelfIds.includes(shelf.id)).length;
      tabs.push({ id: `shelf:${shelf.id}`, label: shelf.name, count, isCustom: true, shelfId: shelf.id });
    }

    return tabs;
  }, [allItems, shelves.data]);

  // Find currently active shelf info
  const activeTab = shelfTabs.find((t) => t.id === activeTabId) ?? shelfTabs[0]!;

  // Filter works for active shelf
  const activeShelfWorks = useMemo(() => {
    let result = allItems;
    if (activeTab.id.startsWith('status:')) {
      const status = activeTab.id.replace('status:', '') as ReadingStatus;
      result = result.filter((w) => w.status === status);
    } else if (activeTab.id.startsWith('shelf:')) {
      const shelfId = activeTab.id.replace('shelf:', '');
      result = result.filter((w) => w.shelfIds.includes(shelfId));
    }

    // Sort by persisted custom order (or local optimistic reordering)
    const savedOrder = reorderedMap[activeTab.id] ?? getShelfOrder(activeTab.id);
    return sortWorksByOrder(result, savedOrder);
  }, [allItems, activeTab.id, reorderedMap]);

  // Apply search query filter
  const lowerQuery = query.trim().toLowerCase();
  const visibleWorks = useMemo(() => {
    if (!lowerQuery) return activeShelfWorks;
    return activeShelfWorks.filter(
      (work) =>
        work.title.toLowerCase().includes(lowerQuery) ||
        work.authors.some((a) => a.toLowerCase().includes(lowerQuery)),
    );
  }, [activeShelfWorks, lowerQuery]);

  // Split books into physical tiers/racks of the bookcase (~7 books per tier in cover mode)
  const booksPerRack = viewMode === 'cover' ? 7 : 14;
  // Group by series/genre first (groupWorksForShelf) so a big shelf reads
  // as organized sections instead of identical, unlabeled dark recesses —
  // but only when grouping actually disambiguates something. A shelf with
  // no series/genre metadata collapses to a single bucket; in that case
  // (or when the shelf is small) fall back to the old flat, unlabeled
  // chunking rather than slapping one "Books" label over everything.
  const racks = useMemo(() => {
    const groups = groupWorksForShelf(visibleWorks);
    if (groups.length <= 1) {
      return chunkWorks(visibleWorks, booksPerRack).map((rackWorks) => ({ label: null as string | null, works: rackWorks }));
    }
    return groups.flatMap((group) =>
      chunkWorks(group.works, booksPerRack).map((rackWorks, i) => ({
        label: i === 0 ? group.label : null,
        works: rackWorks,
      }))
    );
  }, [visibleWorks, booksPerRack]);

  // Drag and Drop handlers
  function handleDragStartBook(workId: string) {
    setDraggedWorkId(workId);
  }

  function handleDragOverBook(workId: string, position: 'before' | 'after') {
    if (draggedWorkId === workId) {
      setDragOverTarget(null);
      return;
    }
    setDragOverTarget({ workId, position });
  }

  function handleDragLeaveBook(workId: string) {
    if (dragOverTarget?.workId === workId) {
      setDragOverTarget(null);
    }
  }

  function handleDropBook(targetWorkId: string, position: 'before' | 'after') {
    if (!draggedWorkId || draggedWorkId === targetWorkId) {
      setDraggedWorkId(null);
      setDragOverTarget(null);
      return;
    }

    const currentOrder = activeShelfWorks.map((w) => w.id);
    const fromIndex = currentOrder.indexOf(draggedWorkId);
    const toIndex = currentOrder.indexOf(targetWorkId);

    if (fromIndex === -1 || toIndex === -1) return;

    // Remove from original spot
    const newOrder = [...currentOrder];
    newOrder.splice(fromIndex, 1);

    // Calculate insertion index
    const targetAdjustedIndex = newOrder.indexOf(targetWorkId);
    const insertIndex = position === 'before' ? targetAdjustedIndex : targetAdjustedIndex + 1;
    newOrder.splice(insertIndex, 0, draggedWorkId);

    // Persist and update local state
    persistShelfOrder(activeTab.id, newOrder);
    setReorderedMap((prev) => ({ ...prev, [activeTab.id]: newOrder }));

    setDraggedWorkId(null);
    setDragOverTarget(null);
  }

  function handleDropEndZone(rackIndex: number) {
    if (!draggedWorkId) return;

    const currentOrder = activeShelfWorks.map((w) => w.id);
    const fromIndex = currentOrder.indexOf(draggedWorkId);
    if (fromIndex === -1) return;

    // Move to the end of this rack's range or to the very end of the shelf
    const rackWorks = racks[rackIndex]?.works ?? [];
    const lastInRack = rackWorks[rackWorks.length - 1];

    const newOrder = [...currentOrder];
    newOrder.splice(fromIndex, 1);

    if (lastInRack && lastInRack.id !== draggedWorkId) {
      const targetIndex = newOrder.indexOf(lastInRack.id);
      newOrder.splice(targetIndex + 1, 0, draggedWorkId);
    } else {
      newOrder.push(draggedWorkId);
    }

    persistShelfOrder(activeTab.id, newOrder);
    setReorderedMap((prev) => ({ ...prev, [activeTab.id]: newOrder }));

    setDraggedWorkId(null);
    setDragOverTarget(null);
  }

  function handleDragEndBook() {
    setDraggedWorkId(null);
    setDragOverTarget(null);
  }

  // Keyboard/touch equivalent of dragging a book one slot over — native
  // HTML5 drag-and-drop (the only way to reorder before this) has no
  // keyboard path at all (WCAG 2.1.1) and doesn't work reliably via touch,
  // despite this page's own subtitle advertising reordering as a feature.
  // Swaps with the adjacent book in the shelf's full order, same as a
  // single-slot drag; crossing a rack boundary is just the same swap.
  function handleMoveBook(workId: string, direction: 'left' | 'right') {
    const currentOrder = activeShelfWorks.map((w) => w.id);
    const fromIndex = currentOrder.indexOf(workId);
    const toIndex = fromIndex + (direction === 'left' ? -1 : 1);
    if (fromIndex === -1 || toIndex < 0 || toIndex >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    [newOrder[fromIndex], newOrder[toIndex]] = [newOrder[toIndex]!, newOrder[fromIndex]!];

    persistShelfOrder(activeTab.id, newOrder);
    setReorderedMap((prev) => ({ ...prev, [activeTab.id]: newOrder }));
  }

  const openBook = (workId: string) => setQuickActionWorkId(workId);

  if (works.isLoading || shelves.isLoading) return <PageSpinner />;
  if (works.isError || shelves.isError) {
    return <ErrorBanner message={errorMessage(works.error ?? shelves.error, 'Could not load your shelves.')} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page Title & New Shelf Inline Creator */}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-paper-900">Shelves</h1>
          <p className="mt-1 text-sm text-paper-600">Your personal bookcase. Drag, or use the keyboard, to arrange your shelves.</p>
        </div>

        {isCreating && (
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Input
              autoFocus
              placeholder="Shelf name…"
              value={newShelfName}
              onChange={(e) => setNewShelfName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateShelf()}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleCreateShelf} isLoading={createShelf.isPending}>
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Library-Ambience Catalog Shelf Switcher */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-serif text-xs italic tracking-wider text-paper-600">
            Catalog Racks & Collections:
          </span>
          {!isCreating && (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="focus-visible:focus-ring inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-display text-xs text-paper-700 hover:bg-paper-200/60 hover:text-paper-900 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-wood-600" />
              <span>New Shelf</span>
            </button>
          )}
        </div>

        <div
          className="scrollbar-wood flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5"
          style={{ maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)' }}
        >
          {shelfTabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className={`group focus-visible:focus-ring relative flex flex-shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs transition-all duration-150 ${
                  isActive
                    ? 'bg-[#382315] text-wood-200 shadow-md ring-1 ring-wood-400/50'
                    : 'bg-paper-100/90 text-paper-700 hover:bg-paper-200/90 hover:text-paper-900 border border-paper-300/70'
                }`}
              >
                {/* Active stud marker */}
                {isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-wood-200 shadow-[0_0_6px_rgba(201,168,119,0.9)]" />
                )}
                <span className="font-display font-medium tracking-wide">{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-sans ${
                    isActive ? 'bg-wood-900/80 text-wood-200' : 'bg-paper-200 text-paper-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* The Physical Bookcase Cabinet */}
      <div className="bg-wood-frame flex flex-col gap-5 rounded-xl border border-wood-900/40 p-4 shadow-card">
        {/* Brass Header Plaque for the Active Shelf */}
        <div className="flex flex-col gap-3 rounded-lg border border-wood-900/30 bg-[#342214]/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-medium italic text-wood-200">{activeTab.label}</h2>
                {activeTab.isCustom && activeTab.shelfId && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteShelfConfirm(true)}
                    title="Delete shelf"
                    className="focus-visible:focus-ring rounded-p-1 text-wood-400 hover:bg-black/30 hover:text-wood-200 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-wood-200/85">
                {visibleWorks.length} {visibleWorks.length === 1 ? 'volume' : 'volumes'} on shelf · drag, or focus a book and use the move buttons, to rearrange
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Switcher: Covers vs Spines */}
            <div className="inline-flex rounded-lg border border-wood-900/50 bg-[#25180f] p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('cover')}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  viewMode === 'cover'
                    ? 'bg-wood-800 text-wood-100 shadow-sm font-semibold'
                    : 'text-wood-200/75 hover:text-wood-200'
                }`}
              >
                Covers
              </button>
              <button
                type="button"
                onClick={() => setViewMode('spine')}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  viewMode === 'spine'
                    ? 'bg-wood-800 text-wood-100 shadow-sm font-semibold'
                    : 'text-wood-200/75 hover:text-wood-200'
                }`}
              >
                Spines
              </button>
            </div>

            {/* In-Shelf Search */}
            <div className="relative w-48 sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-wood-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter this rack…"
                className="focus-visible:focus-ring w-full rounded-md border border-wood-900/60 bg-[#25180f] py-1.5 pl-8 pr-2.5 text-xs text-wood-100 placeholder:text-wood-200/75"
              />
            </div>
          </div>
        </div>

        {/* Bookcase Tiers / Racks */}
        {visibleWorks.length === 0 ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center rounded-lg bg-shelf-back p-8 text-center">
            <p className="font-display italic text-sm text-wood-200/85">
              {lowerQuery ? 'No books on this shelf match your search.' : 'This shelf is currently empty.'}
            </p>
            <p className="mt-1 text-xs text-wood-200/85">
              {lowerQuery
                ? 'Try a different title or author.'
                : 'Add books from your library or assign them to this collection.'}
            </p>
          </div>
        ) : (
          racks.map((rack, rackIdx) => (
            <ShelfRow
              key={`rack-${rackIdx}`}
              label={rack.label ?? undefined}
              works={rack.works}
              viewMode={viewMode}
              draggedWorkId={draggedWorkId}
              dragOverTarget={dragOverTarget}
              onDragStartBook={handleDragStartBook}
              onDragOverBook={handleDragOverBook}
              onDragLeaveBook={handleDragLeaveBook}
              onDropBook={handleDropBook}
              onDropEndZone={() => handleDropEndZone(rackIdx)}
              onDragEndBook={handleDragEndBook}
              onMoveBook={handleMoveBook}
              orderedWorkIds={activeShelfWorks.map((w) => w.id)}
              onOpen={openBook}
              onRemove={
                activeTab.isCustom && activeTab.shelfId
                  ? (workId) => removeFromShelf.mutate({ shelfId: activeTab.shelfId!, workId })
                  : undefined
              }
            />
          ))
        )}
      </div>

      {quickActionWorkId && (
        <BookQuickActionModal
          workId={quickActionWorkId}
          onClose={() => setQuickActionWorkId(null)}
        />
      )}

      {showDeleteShelfConfirm && (
        <ConfirmDialog
          title="Delete shelf"
          message={`Delete "${activeTab.label}" shelf? The books stay in your library.`}
          confirmLabel="Delete"
          isConfirming={deleteShelf.isPending}
          onConfirm={handleConfirmDeleteShelf}
          onClose={() => setShowDeleteShelfConfirm(false)}
        />
      )}
    </div>
  );
}

