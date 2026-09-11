import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Input } from '../../components/ui/Input';
import { PageSpinner } from '../../components/ui/Spinner';
import { useCreateShelf, useDeleteShelf, useRemoveWorkFromShelf, useShelves } from '../../lib/api/shelves';
import { useWorks } from '../../lib/api/works';
import { errorMessage } from '../../lib/error-message';
import { ShelfCase } from './ShelfCase';

// T-016 (frontend): shelves rendered as physical bookcases, with books
// arranged by series and genre within each one rather than a flat list.
export function ShelvesPage() {
  const navigate = useNavigate();
  const works = useWorks({ pageSize: 100 });
  const shelves = useShelves();
  const createShelf = useCreateShelf();
  const deleteShelf = useDeleteShelf();
  const removeFromShelf = useRemoveWorkFromShelf();

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

  const allWorks = works.data?.items ?? [];

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

      {error && <ErrorBanner message={error} />}

      <div className="flex flex-col gap-6">
        <ShelfCase title="All Books" works={allWorks} onOpenBook={(workId) => navigate(`/library/${workId}`)} />

        {shelves.data?.map((shelf) => (
          <ShelfCase
            key={shelf.id}
            title={shelf.name}
            works={allWorks.filter((work) => work.shelfIds.includes(shelf.id))}
            onOpenBook={(workId) => navigate(`/library/${workId}`)}
            onRemoveBook={(workId) => removeFromShelf.mutate({ shelfId: shelf.id, workId })}
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
