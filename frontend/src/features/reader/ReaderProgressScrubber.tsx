import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ReaderProgressScrubberProps {
  currentProgressPercent: number; // 0 to 100
  locationLabel?: string;
  // A caller that knows how much text is left passes its own estimate; otherwise it's guessed
  // from the page or chapter count.
  minutesLeft?: number | null;
  totalChaptersOrPages?: number;
  // The reading theme's colours, so a dark page doesn't sit on a cream bar (R4-12).
  colors?: { background: string; text: string; border: string };
  onSeekPercent?: (percent: number) => void;
}

export function ReaderProgressScrubber({
  currentProgressPercent,
  locationLabel,
  minutesLeft,
  totalChaptersOrPages,
  colors,
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
    <div
      style={colors ? { backgroundColor: colors.background, color: colors.text, borderColor: colors.border } : undefined}
      className={`sticky bottom-0 z-30 flex w-full flex-col border-t px-4 py-2 text-xs shadow-md ${colors ? '' : 'border-paper-200 bg-paper-50/95 text-paper-700 backdrop-blur'}`}
    >
      <div className="flex items-center justify-between font-semibold mb-1">
        <span className={`truncate max-w-[60%] ${colors ? '' : 'text-paper-800'}`}>
          {locationLabel || 'Reading progress'}
        </span>
        <div className="flex items-center gap-3">
          {estimatedMinutesLeft !== null && (
            <span className={`flex items-center gap-1 font-normal ${colors ? 'opacity-80' : 'text-paper-700'}`}>
              <Clock className="h-3 w-3 text-moss-600" aria-hidden="true" />
              {estimatedMinutesLeft === 0 ? 'Last page' : `About ${estimatedMinutesLeft} min left`}
            </span>
          )}
          <span className={`font-mono ${colors ? '' : 'text-moss-800'}`}>{Math.round(currentProgressPercent)}%</span>
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
