import { useState } from 'react';
import { X } from 'lucide-react';
import { getSpineStyle } from './spine-style';

interface BookSpineProps {
  workId: string;
  title: string;
  coverImageUrl?: string | null;
  authors?: string[];
  originalLanguage?: string | null;
  language?: string | null;
  partsCount?: number | null;
  chaptersCount?: number | null;
  viewMode?: 'cover' | 'spine';
  isDragging?: boolean;
  dragOverPosition?: 'before' | 'after' | null;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  onOpen: (workId: string) => void;
  onRemove?: (workId: string) => void;
}

// Renders an upright book standing on the shelf plank.
// In 'cover' mode (default): displays front cover art with authentic book geometry
// (spine hinge crease, page edge hint, contact shadow, smooth hover lift), or an
// elegant cloth hardcover fallback with serif typography.
// In 'spine' mode: renders a custom generated aesthetic spine graphic with vertical
// title in user preference, author, original language indicator, and part/chapter badges.
export function BookSpine({
  workId,
  title,
  coverImageUrl,
  authors,
  originalLanguage,
  language,
  partsCount,
  chaptersCount,
  viewMode = 'cover',
  isDragging,
  dragOverPosition,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onOpen,
  onRemove,
}: BookSpineProps) {
  const style = getSpineStyle(workId);
  const [imgError, setImgError] = useState(false);
  const hasCover = Boolean(coverImageUrl) && !imgError;

  const displayAuthor = authors && authors.length > 0 ? authors[0] : null;

  if (viewMode === 'cover') {
    return (
      <div
        draggable={Boolean(onDragStart)}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={`group relative flex-shrink-0 self-end select-none cursor-grab active:cursor-grabbing ${
          isDragging ? 'opacity-30 scale-95' : ''
        }`}
      >
        {/* Insertion Guide Marker (Left) */}
        {dragOverPosition === 'before' && (
          <div className="pointer-events-none absolute -left-2 top-0 bottom-0 z-30 flex items-center justify-center">
            <div className="h-full w-1 rounded-full bg-wood-200 shadow-[0_0_8px_rgba(201,168,119,0.95)] animate-pulse" />
          </div>
        )}

        <button
          type="button"
          onClick={() => onOpen(workId)}
          title={`${title}${authors?.length ? ` by ${authors.join(', ')}` : ''}${originalLanguage ? ` (Original: ${originalLanguage})` : ''}`}
          className="focus-visible:focus-ring relative flex w-[88px] sm:w-[96px] aspect-[2/3] flex-col items-center justify-between overflow-hidden rounded-r-[3px] rounded-l-[1px] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.45),0_2px_4px_-2px_rgba(0,0,0,0.35)] transition-all duration-150 ease-out group-hover:-translate-y-2 group-hover:shadow-[0_10px_16px_-3px_rgba(0,0,0,0.6)] text-left"
          style={hasCover ? undefined : { backgroundColor: style.color }}
        >
          {hasCover ? (
            <img
              src={coverImageUrl!}
              alt={`Cover of ${title}`}
              onError={() => setImgError(true)}
              className="pointer-events-none h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="m-1 flex h-[calc(100%-8px)] w-[calc(100%-8px)] flex-col items-center justify-between rounded-sm border border-paper-50/20 p-2 text-center shadow-[inset_0_0_10px_rgba(0,0,0,0.2)]">
              <span className="line-clamp-4 font-display text-[10.5px] font-medium leading-snug tracking-wide text-paper-50/95 drop-shadow-sm">
                {title}
              </span>
              {displayAuthor && (
                <span className="line-clamp-1 font-serif text-[9px] italic text-paper-100/75">
                  {displayAuthor}
                </span>
              )}
            </div>
          )}

          {/* Added Language Badge Overlay */}
          {language && (
            <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-amber-300 backdrop-blur-sm border border-amber-400/30">
              {language.slice(0, 3)}
            </span>
          )}
        </button>

        {/* Insertion Guide Marker (Right) */}
        {dragOverPosition === 'after' && (
          <div className="pointer-events-none absolute -right-2 top-0 bottom-0 z-30 flex items-center justify-center">
            <div className="h-full w-1 rounded-full bg-wood-200 shadow-[0_0_8px_rgba(201,168,119,0.95)] animate-pulse" />
          </div>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(workId);
            }}
            aria-label={`Remove ${title} from this shelf`}
            className="focus-visible:focus-ring absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-paper-900 text-paper-50 shadow-card group-hover:flex z-10"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  // SPINE MODE: Custom generated graphic spine artwork
  return (
    <div
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative flex-shrink-0 self-end select-none cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-30 scale-95' : ''
      }`}
      style={{ transform: `rotate(${style.tiltDeg}deg)` }}
    >
      {/* Insertion Guide Marker (Left) */}
      {dragOverPosition === 'before' && (
        <div className="pointer-events-none absolute -left-1.5 top-0 bottom-0 z-30 flex items-center justify-center">
          <div className="h-full w-1 rounded-full bg-wood-200 shadow-[0_0_8px_rgba(201,168,119,0.95)] animate-pulse" />
        </div>
      )}

      <button
        type="button"
        onClick={() => onOpen(workId)}
        title={`${title}${displayAuthor ? ` by ${displayAuthor}` : ''}${originalLanguage ? ` · Orig: ${originalLanguage}` : ''}`}
        style={{
          height: style.heightPx,
          width: Math.max(34, style.widthPx),
          backgroundColor: style.color,
        }}
        className="focus-visible:focus-ring relative flex flex-col items-center justify-between overflow-hidden rounded-t-[3px] rounded-b-[2px] py-2 px-1 shadow-[inset_3px_0_4px_rgba(255,255,255,0.2),inset_-3px_0_5px_rgba(0,0,0,0.4),0_6px_10px_rgba(0,0,0,0.5)] transition-all duration-150 group-hover:-translate-y-2 group-hover:shadow-[0_12px_20px_rgba(0,0,0,0.7)]"
      >
        {/* Cover image strip background blur */}
        {hasCover && (
          <img
            src={coverImageUrl!}
            alt=""
            onError={() => setImgError(true)}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 filter blur-[1px] scale-125"
            loading="lazy"
          />
        )}

        {/* 3D Spine Ribs / Hinge highlights */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-r from-white/30 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1.5 bg-gradient-to-l from-black/40 to-transparent" />

        {/* Top Gold Foil Band */}
        <div className="relative z-10 w-full flex flex-col items-center gap-0.5 border-y border-amber-300/40 bg-black/40 py-0.5 shadow-inner">
          <div className="h-[1px] w-full bg-amber-400/60" />
          {originalLanguage && (
            <span className="text-[7.5px] font-bold uppercase tracking-wider text-amber-200/90 drop-shadow">
              {originalLanguage.slice(0, 3)}
            </span>
          )}
          <div className="h-[1px] w-full bg-amber-400/60" />
        </div>

        {/* Middle Spine Content: Title & Author in User's Added Preference */}
        <div className="relative z-10 flex flex-1 items-center justify-center py-1 px-0.5 w-full overflow-hidden">
          <div className="flex items-center gap-1" style={{ writingMode: 'vertical-rl' }}>
            <span
              className={`font-serif font-bold leading-none tracking-wide text-amber-50 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] ${
                title.length > 32
                  ? 'text-[8.5px]'
                  : title.length > 22
                  ? 'text-[9.5px]'
                  : title.length > 14
                  ? 'text-[10.5px]'
                  : 'text-[11.5px]'
              }`}
            >
              {title}
            </span>
            {displayAuthor && (
              <span className="font-serif text-[8.5px] font-medium italic text-amber-200/85 drop-shadow-sm whitespace-nowrap">
                {displayAuthor}
              </span>
            )}
          </div>
        </div>

        {/* Bottom Gold Foil Band & Part/Chapter Badges */}
        <div className="relative z-10 w-full flex flex-col items-center gap-0.5 border-t border-amber-300/40 bg-black/40 pt-0.5 pb-0.5 shadow-inner">
          <div className="h-[1px] w-full bg-amber-400/60" />
          {partsCount ? (
            <span className="text-[7.5px] font-extrabold uppercase tracking-tight text-emerald-200 drop-shadow">
              Pt {partsCount}
            </span>
          ) : chaptersCount ? (
            <span className="text-[7.5px] font-extrabold uppercase tracking-tight text-purple-200 drop-shadow">
              {chaptersCount} Ch
            </span>
          ) : (
            <span className="text-[7.5px] font-semibold uppercase tracking-wider text-amber-200/80 drop-shadow">
              Bunko
            </span>
          )}
        </div>
      </button>

      {/* Insertion Guide Marker (Right) */}
      {dragOverPosition === 'after' && (
        <div className="pointer-events-none absolute -right-1.5 top-0 bottom-0 z-30 flex items-center justify-center">
          <div className="h-full w-1 rounded-full bg-wood-200 shadow-[0_0_8px_rgba(201,168,119,0.95)] animate-pulse" />
        </div>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(workId);
          }}
          aria-label={`Remove ${title} from this shelf`}
          className="focus-visible:focus-ring absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-paper-900 text-paper-50 shadow-card group-hover:flex z-10"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
