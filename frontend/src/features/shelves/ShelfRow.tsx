import { Trash2 } from 'lucide-react';
import type { Work } from '../../lib/api/types';
import { BookSpine } from './BookSpine';

interface ShelfRowProps {
  label?: string;
  works: Work[];
  viewMode?: 'cover' | 'spine';
  draggedWorkId?: string | null;
  dragOverTarget?: { workId: string; position: 'before' | 'after' } | null;
  onDragStartBook?: (workId: string) => void;
  onDragOverBook?: (workId: string, position: 'before' | 'after') => void;
  onDragLeaveBook?: (workId: string) => void;
  onDropBook?: (targetWorkId: string, position: 'before' | 'after') => void;
  onDropEndZone?: () => void;
  onDragEndBook?: () => void;
  onOpen: (workId: string) => void;
  onRemove?: (workId: string) => void;
  onDeleteShelf?: () => void;
}

// One tier/rack of the bookcase: an optional label plaque,
// a row of upright books standing on a solid wood plank, with a dark
// recessed "shelf back" behind them for depth. Multiple of these stack
// inside the active bookcase to display all books of a selected shelf.
export function ShelfRow({
  label,
  works,
  viewMode = 'cover',
  draggedWorkId,
  dragOverTarget,
  onDragStartBook,
  onDragOverBook,
  onDragLeaveBook,
  onDropBook,
  onDropEndZone,
  onDragEndBook,
  onOpen,
  onRemove,
  onDeleteShelf,
}: ShelfRowProps) {
  return (
    <div className="flex flex-col">
      {label && (
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
      )}
      <div
        onDragOver={(e) => {
          if (onDropEndZone) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
        }}
        onDrop={(e) => {
          if (onDropEndZone) {
            e.preventDefault();
            onDropEndZone();
          }
        }}
        className={`bg-shelf-back relative flex items-end overflow-x-auto rounded-t-sm pb-0 ${
          viewMode === 'cover' ? 'min-h-[164px] gap-3.5 px-4 pt-5' : 'min-h-[240px] gap-2 px-3 pt-5'
        }`}
      >
        {works.length === 0 ? (
          <div className="flex h-24 w-full items-center justify-center">
            <p className="font-display italic text-xs text-wood-200/60">No books on this rack yet. Drag volumes here.</p>
          </div>
        ) : (
          works.map((work) => (
            <BookSpine
              key={work.id}
              workId={work.id}
              title={work.title}
              coverImageUrl={work.coverImageUrl}
              authors={work.authors}
              originalLanguage={work.originalLanguage}
              language={work.language}
              partsCount={work.partsCount}
              chaptersCount={work.chaptersCount}
              viewMode={viewMode}
              isDragging={draggedWorkId === work.id}
              dragOverPosition={dragOverTarget?.workId === work.id ? dragOverTarget.position : null}
              onDragStart={() => onDragStartBook?.(work.id)}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const position = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
                onDragOverBook?.(work.id, position);
              }}
              onDragLeave={(e) => {
                e.stopPropagation();
                onDragLeaveBook?.(work.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropBook?.(work.id, dragOverTarget?.position ?? 'before');
              }}
              onDragEnd={() => onDragEndBook?.()}
              onOpen={onOpen}
              onRemove={onRemove}
            />
          ))
        )}

        {/* Empty shelf trailing drop zone */}
        {works.length > 0 && onDropEndZone && (
          <div
            className="flex-1 min-w-[24px] self-stretch"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDropEndZone();
            }}
          />
        )}
      </div>
      <div className="bg-wood-plank h-3.5 w-full rounded-b-sm shadow-plank" />
    </div>
  );
}
