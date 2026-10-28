import { Sparkles, X } from 'lucide-react';

/**
 * Persistent bottom-right launcher for the floating Assistant (Phase 13,
 * T-112). Mounted once in AppShell, so it follows the reader across
 * Shelves/Journal/Statistics/Settings — never in the reader itself
 * (ReaderPage/FlowReaderPage render outside AppShell, SRS §29.4).
 */
export function AssistantLauncher({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? 'Close the assistant' : 'Open the assistant'}
      aria-expanded={open}
      className="focus-visible:focus-ring fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-moss-700 text-paper-50 shadow-xl transition-transform duration-150 hover:scale-105 hover:bg-moss-800 active:scale-95 md:bottom-6 md:right-6"
    >
      {open ? (
        <X aria-hidden="true" className="h-6 w-6" strokeWidth={1.75} />
      ) : (
        <Sparkles aria-hidden="true" className="h-6 w-6" strokeWidth={1.75} />
      )}
    </button>
  );
}
