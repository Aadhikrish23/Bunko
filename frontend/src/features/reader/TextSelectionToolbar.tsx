import { FileText, Quote, X, Check } from 'lucide-react';
import { useState } from 'react';
import type { HighlightColor } from '../../lib/annotations';
import { COLOR_HEX_MAP } from '../../lib/annotations';

interface TextSelectionToolbarProps {
  selectedText: string;
  x: number;
  y: number;
  onSaveHighlight: (color: HighlightColor, note?: string, isQuote?: boolean) => void;
  onClose: () => void;
}

export function TextSelectionToolbar({ selectedText, x, y, onSaveHighlight, onClose }: TextSelectionToolbarProps) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow');

  const colors: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'orange'];

  function handleHighlight(color: HighlightColor) {
    onSaveHighlight(color, noteText.trim() || undefined, false);
    onClose();
  }

  function handleSaveQuote() {
    onSaveHighlight(selectedColor, noteText.trim() || undefined, true);
    onClose();
  }

  return (
    <div
      style={{ left: Math.max(10, Math.min(x, window.innerWidth - 320)), top: Math.max(10, y - 60) }}
      className="fixed z-50 flex flex-col rounded-xl border border-paper-300 bg-paper-50/95 p-2 shadow-2xl backdrop-blur transition-all w-72"
    >
      <div className="flex items-center justify-between border-b border-paper-200 pb-1.5 mb-1.5 px-1">
        <span className="text-[11px] font-bold text-paper-700 truncate max-w-[180px]">
          &quot;{selectedText}&quot;
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-paper-400 hover:text-paper-700 hover:bg-paper-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        {/* Highlight Color Swatches */}
        <div className="flex items-center gap-1.5">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setSelectedColor(c);
                handleHighlight(c);
              }}
              style={{ backgroundColor: COLOR_HEX_MAP[c].bg, borderColor: COLOR_HEX_MAP[c].border }}
              className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none shadow-sm flex items-center justify-center"
              title={`Highlight ${c}`}
            >
              {selectedColor === c && <Check className="h-3 w-3 text-paper-900" />}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {/* Toggle Margin Note Input */}
          <button
            type="button"
            onClick={() => setShowNoteInput((v) => !v)}
            className={`rounded-lg p-1.5 text-xs transition-colors ${
              showNoteInput ? 'bg-moss-100 text-moss-900 font-bold' : 'text-paper-600 hover:bg-paper-100'
            }`}
            title="Add margin note"
          >
            <FileText className="h-4 w-4" />
          </button>

          {/* Save Quote Button */}
          <button
            type="button"
            onClick={handleSaveQuote}
            className="flex items-center gap-1 rounded-lg bg-moss-700 px-2 py-1 text-xs font-semibold text-paper-50 hover:bg-moss-800 transition-colors"
            title="Save as quote"
          >
            <Quote className="h-3.5 w-3.5" />
            <span>Quote</span>
          </button>
        </div>
      </div>

      {showNoteInput && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-paper-200 pt-2 px-1">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Write your thoughts or note..."
            rows={2}
            className="w-full rounded-md border border-paper-300 bg-paper-100 p-1.5 text-xs text-paper-900 focus:border-moss-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handleHighlight(selectedColor)}
            className="self-end rounded-md bg-moss-700 px-2.5 py-1 text-[11px] font-semibold text-paper-50 hover:bg-moss-800"
          >
            Save Highlight &amp; Note
          </button>
        </div>
      )}
    </div>
  );
}
