import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAssignWorkToShelf, useCreateShelf, useRemoveWorkFromShelf, useShelves } from '../../lib/api/shelves';

// The other half of the shelf-assignment UI (T-016) — from a book's own
// page, toggle which shelves it belongs to. The Shelves page itself
// (features/shelves/ShelvesPage.tsx) is where those shelves are browsed
// as bookcases.
export function ShelfAssignmentPanel({ workId, shelfIds }: { workId: string; shelfIds: string[] }) {
  const shelves = useShelves();
  const assign = useAssignWorkToShelf();
  const remove = useRemoveWorkFromShelf();
  const createShelf = useCreateShelf();
  const [newShelfName, setNewShelfName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  function toggle(shelfId: string, isOn: boolean) {
    if (isOn) {
      remove.mutate({ shelfId, workId });
    } else {
      assign.mutate({ shelfId, workId });
    }
  }

  async function handleCreateAndAssign() {
    if (!newShelfName.trim()) return;
    const shelf = await createShelf.mutateAsync(newShelfName.trim());
    await assign.mutateAsync({ shelfId: shelf.id, workId });
    setNewShelfName('');
    setIsCreating(false);
  }

  if (shelves.isLoading || !shelves.data) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shelves.data.map((shelf) => {
        const isOn = shelfIds.includes(shelf.id);
        return (
          <button
            key={shelf.id}
            type="button"
            onClick={() => toggle(shelf.id, isOn)}
            className={`focus-visible:focus-ring flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              isOn
                ? 'border-moss-500 bg-moss-100 text-moss-700'
                : 'border-paper-300 bg-paper-50 text-paper-600 hover:border-moss-300'
            }`}
          >
            {isOn && <Check className="h-3 w-3" />}
            {shelf.name}
          </button>
        );
      })}

      {isCreating ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={newShelfName}
            onChange={(e) => setNewShelfName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateAndAssign()}
            placeholder="New shelf…"
            className="focus-visible:focus-ring w-28 rounded-full border border-paper-300 bg-paper-50 px-2.5 py-1 text-xs"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="focus-visible:focus-ring flex items-center gap-1 rounded-full border border-dashed border-paper-300 px-2.5 py-1 text-xs font-medium text-paper-500 hover:border-moss-300 hover:text-moss-600"
        >
          <Plus className="h-3 w-3" /> New shelf
        </button>
      )}
    </div>
  );
}
