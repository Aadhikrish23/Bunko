import type { Work } from '../../lib/api/types';
import { BookSpine } from './BookSpine';

interface ShelfRowProps {
  label: string;
  works: Work[];
  onOpen: (workId: string) => void;
  onRemove?: (workId: string) => void;
}

// One compartment of the bookcase: a label plaque, a row of upright
// spines standing on a wood plank, with a dark recessed "shelf back"
// behind them for depth.
export function ShelfRow({ label, works, onOpen, onRemove }: ShelfRowProps) {
  return (
    <div className="flex flex-col">
      <p className="mb-1 px-3 font-display text-sm italic text-wood-200">{label}</p>
      <div className="bg-shelf-back flex items-end gap-1.5 overflow-x-auto rounded-t-sm px-3 pb-0 pt-4">
        {works.map((work) => (
          <BookSpine key={work.id} workId={work.id} title={work.title} onOpen={onOpen} onRemove={onRemove} />
        ))}
      </div>
      <div className="bg-wood-plank h-3.5 w-full rounded-b-sm shadow-plank" />
    </div>
  );
}
