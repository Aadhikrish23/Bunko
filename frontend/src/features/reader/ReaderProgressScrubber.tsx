import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ReaderProgressScrubberProps {
  currentProgressPercent: number; // 0 to 100
  locationLabel?: string;
  totalChaptersOrPages?: number;
  onSeekPercent?: (percent: number) => void;
}

export function ReaderProgressScrubber({
  currentProgressPercent,
  locationLabel,
  totalChaptersOrPages,
  onSeekPercent,
}: ReaderProgressScrubberProps) {
  const [estimatedMinutesLeft, setEstimatedMinutesLeft] = useState<number | null>(null);

  useEffect(() => {
    // Estimate remaining reading time based on total volume & average 220 WPM
    if (totalChaptersOrPages && totalChaptersOrPages > 0) {
      const remainingPercent = Math.max(0, 100 - currentProgressPercent);
      const estMinutes = Math.ceil((remainingPercent / 100) * (totalChaptersOrPages * 4));
      setEstimatedMinutesLeft(estMinutes > 0 ? estMinutes : 1);
    } else {
      setEstimatedMinutesLeft(null);
    }
  }, [currentProgressPercent, totalChaptersOrPages]);

  return (
    <div className="sticky bottom-0 z-30 flex w-full flex-col border-t border-paper-200 bg-paper-50/95 px-4 py-2 shadow-md backdrop-blur text-xs text-paper-700">
      <div className="flex items-center justify-between font-semibold mb-1">
        <span className="text-paper-800 truncate max-w-[60%]">
          {locationLabel || 'Reading progress'}
        </span>
        <div className="flex items-center gap-3">
          {estimatedMinutesLeft !== null && (
            <span className="flex items-center gap-1 text-paper-500 font-normal">
              <Clock className="h-3 w-3 text-moss-600" />
              ~{estimatedMinutesLeft} min{estimatedMinutesLeft > 1 ? 's' : ''} left
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
        className="h-1.5 w-full cursor-pointer accent-moss-600 rounded-lg bg-paper-200"
      />
    </div>
  );
}
