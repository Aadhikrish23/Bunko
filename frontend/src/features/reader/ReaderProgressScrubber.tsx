import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ReaderProgressScrubberProps {
  currentProgressPercent: number; // 0 to 100
  locationLabel?: string;
  // A caller that knows how much text is left passes its own estimate; otherwise it's guessed
  // from the page or chapter count.
  minutesLeft?: number | null;
  totalChaptersOrPages?: number;
  onSeekPercent?: (percent: number) => void;
}

export function ReaderProgressScrubber({
  currentProgressPercent,
  locationLabel,
  minutesLeft,
  totalChaptersOrPages,
  onSeekPercent,
}: ReaderProgressScrubberProps) {
  const [guessedMinutesLeft, setGuessedMinutesLeft] = useState<number | null>(null);

  useEffect(() => {
    if (totalChaptersOrPages && totalChaptersOrPages > 0) {
      const remainingPercent = Math.max(0, 100 - currentProgressPercent);
      const estMinutes = Math.ceil((remainingPercent / 100) * (totalChaptersOrPages * 4));
      setGuessedMinutesLeft(estMinutes > 0 ? estMinutes : 1);
    } else {
      setGuessedMinutesLeft(null);
    }
  }, [currentProgressPercent, totalChaptersOrPages]);
  const estimatedMinutesLeft = minutesLeft !== undefined ? minutesLeft : guessedMinutesLeft;

  return (
    <div className="sticky bottom-0 z-30 flex w-full flex-col border-t border-paper-200 bg-paper-50/95 px-4 py-2 shadow-md backdrop-blur text-xs text-paper-700">
      <div className="flex items-center justify-between font-semibold mb-1">
        <span className="text-paper-800 truncate max-w-[60%]">
          {locationLabel || 'Reading progress'}
        </span>
        <div className="flex items-center gap-3">
          {estimatedMinutesLeft !== null && (
            <span className="flex items-center gap-1 text-paper-700 font-normal">
              <Clock className="h-3 w-3 text-moss-600" aria-hidden="true" />
              {estimatedMinutesLeft === 0 ? 'Last page' : `About ${estimatedMinutesLeft} min left`}
            </span>
          )}
          <span className="font-mono text-moss-800">{Math.round(currentProgressPercent)}%</span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={currentProgressPercent}
        onChange={(e) => onSeekPercent?.(Number(e.target.value))}
        aria-label="Position in the book"
        className="h-1.5 w-full cursor-pointer accent-moss-600 rounded-lg bg-paper-200"
      />
    </div>
  );
}
