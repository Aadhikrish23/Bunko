import { X } from 'lucide-react';
import { getSpineStyle } from './spine-style';

interface BookSpineProps {
  workId: string;
  title: string;
  onOpen: (workId: string) => void;
  onRemove?: (workId: string) => void;
}

// A single book rendered as an upright spine, like on a real shelf —
// varied color/height/tilt per book (deterministic, see spine-style.ts),
// title set in vertical type. Deliberately not a cover-image grid — the
// point of the Shelves view is the physical-bookcase feel.
export function BookSpine({ workId, title, onOpen, onRemove }: BookSpineProps) {
  const style = getSpineStyle(workId);

  return (
    <div
      className="group relative flex-shrink-0 self-end"
      style={{ transform: `rotate(${style.tiltDeg}deg)` }}
    >
      <button
        type="button"
        onClick={() => onOpen(workId)}
        title={title}
        style={{ height: style.heightPx, width: style.widthPx, backgroundColor: style.color }}
        className="focus-visible:focus-ring relative flex items-start justify-center overflow-hidden rounded-t-sm rounded-b-[2px] pb-2 pt-3 shadow-[inset_2px_0_0_rgba(255,255,255,0.15),inset_-2px_0_0_rgba(0,0,0,0.25)] transition-transform group-hover:-translate-y-1.5"
      >
        {/* Foil-stamped band near the top, common on cloth spines. */}
        <span className="absolute left-0 top-2.5 h-px w-full bg-paper-50/40" />
        <span
          className="line-clamp-none max-h-full overflow-hidden text-[11px] font-medium leading-tight tracking-wide text-paper-50/90"
          style={{ writingMode: 'vertical-rl' }}
        >
          {title}
        </span>
      </button>

      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(workId);
          }}
          aria-label={`Remove ${title} from this shelf`}
          className="focus-visible:focus-ring absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-paper-900 text-paper-50 shadow-card group-hover:flex"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
