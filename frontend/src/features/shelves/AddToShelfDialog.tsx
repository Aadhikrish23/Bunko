import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Modal } from '../../components/ui/Modal';
import { useAssignWorkToShelf } from '../../lib/api/shelves';
import type { Work } from '../../lib/api/types';
import { errorMessage } from '../../lib/error-message';
import { BookCover } from '../library/BookCover';

/** Pick books from the library to put on a shelf (R2-24). */
export function AddToShelfDialog({
  shelfId,
  shelfName,
  works,
  onClose,
}: {
  shelfId: string;
  shelfName: string;
  works: Work[];
  onClose: () => void;
}) {
  const assign = useAssignWorkToShelf();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return works
      .filter((w) => !w.shelfIds.includes(shelfId))
      .filter((w) => !q || w.title.toLowerCase().includes(q) || w.authors.some((a) => a.toLowerCase().includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [works, shelfId, query]);

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    setSaving(true);
    setError(null);
    const results = await Promise.allSettled(
      Array.from(chosen).map((workId) => assign.mutateAsync({ shelfId, workId })),
    );
    setSaving(false);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) {
      setError(errorMessage(failed.reason, 'Some books could not be added.'));
      return;
    }
    onClose();
  }

  const everyBookIsOnIt = works.length > 0 && works.every((w) => w.shelfIds.includes(shelfId));

  return (
    <Modal title={`Add books to ${shelfName}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <ErrorBanner message={error} />}
        {everyBookIsOnIt ? (
          <p className="text-sm text-paper-700">Every book in your library is already on this shelf.</p>
        ) : works.length === 0 ? (
          <p className="text-sm text-paper-700">Your library is empty. Add a book first, then shelve it here.</p>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a book in your library…"
                aria-label="Find a book in your library"
                className="focus-visible:focus-ring w-full rounded-md border border-paper-300 bg-paper-50 py-2 pl-9 pr-3 text-sm text-paper-900 placeholder:text-paper-400"
              />
            </div>
            {candidates.length === 0 ? (
              <p className="py-4 text-center text-sm text-paper-700">No books match.</p>
            ) : (
              <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                {candidates.map((work) => (
                  <li key={work.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md p-1.5 hover:bg-paper-100">
                      <input
                        type="checkbox"
                        checked={chosen.has(work.id)}
                        onChange={() => toggle(work.id)}
                        className="h-4 w-4 accent-moss-600"
                      />
                      <div className="w-8 shrink-0">
                        <BookCover title={work.title} coverImageUrl={work.coverImageUrl} />
                      </div>
                      <span className="min-w-0">
                        <span className="block truncate font-display text-sm text-paper-900">{work.title}</span>
                        <span className="block truncate text-xs text-paper-700">{work.authors.join(', ') || 'Unknown author'}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleAdd} isLoading={saving} disabled={chosen.size === 0}>
            {chosen.size > 1 ? `Add ${chosen.size} books` : 'Add book'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
