import { Trash2 } from 'lucide-react';
import type { Work } from '../../lib/api/types';
import { groupWorksForShelf } from './group-works';
import { ShelfRow } from './ShelfRow';

interface ShelfCaseProps {
  title: string;
  works: Work[];
  onOpenBook: (workId: string) => void;
  onRemoveBook?: (workId: string) => void;
  onDeleteShelf?: () => void;
}

// One wooden bookcase — a titled shelf, containing one ShelfRow per
// series/genre group, framed in a wood-toned card so it reads as
// physical furniture rather than a settings list.
export function ShelfCase({ title, works, onOpenBook, onRemoveBook, onDeleteShelf }: ShelfCaseProps) {
  const groups = groupWorksForShelf(works);

  return (
    <div className="bg-wood-frame overflow-hidden rounded-xl border border-wood-900/40 p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="font-display text-lg text-paper-50">{title}</h2>
        {onDeleteShelf && (
          <button
            type="button"
            onClick={onDeleteShelf}
            aria-label={`Delete ${title} shelf`}
            className="focus-visible:focus-ring rounded-md p-1.5 text-wood-200 hover:bg-black/20 hover:text-paper-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {works.length === 0 ? (
        <p className="px-2 pb-2 text-sm text-wood-200">No books on this shelf yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <ShelfRow key={group.label} label={group.label} works={group.works} onOpen={onOpenBook} onRemove={onRemoveBook} />
          ))}
        </div>
      )}
    </div>
  );
}
