import { Trash2 } from 'lucide-react';
import type { Work } from '../../lib/api/types';
import { BookSpine } from './BookSpine';

interface ShelfRowProps {
  label: string;
  works: Work[];
  onOpen: (workId: string) => void;
  onRemove?: (workId: string) => void;
  onDeleteShelf?: () => void;
}

// One compartment of the (single, continuous) bookcase: a label plaque,
// a row of upright spines standing on a wood plank, with a dark
// recessed "shelf back" behind them for depth. Multiple of these stack
// inside one shared wood-frame (ShelvesPage) rather than each shelf
// getting its own separate boxed card.
export function ShelfRow({ label, works, onOpen, onRemove, onDeleteShelf }: ShelfRowProps) {
  if (works.length === 0 && !onDeleteShelf) return null;

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-center justify-between px-3">
        <p className="font-display text-sm italic text-wood-200">{label}</p>
        {onDeleteShelf && (
          <button
            type="button"
            onClick={onDeleteShelf}
            aria-label={`Delete ${label} shelf`}
            className="focus-visible:focus-ring rounded p-1 text-wood-200 hover:bg-black/20 hover:text-paper-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="bg-shelf-back flex min-h-[100px] items-end gap-1.5 overflow-x-auto rounded-t-sm px-3 pb-0 pt-4">
        {works.length === 0 ? (
          <p className="pb-3 text-xs text-wood-200/70">No books on this shelf yet.</p>
        ) : (
          works.map((work) => (
            <BookSpine key={work.id} workId={work.id} title={work.title} onOpen={onOpen} onRemove={onRemove} />
          ))
        )}
      </div>
      <div className="bg-wood-plank h-3.5 w-full rounded-b-sm shadow-plank" />
    </div>
  );
}
