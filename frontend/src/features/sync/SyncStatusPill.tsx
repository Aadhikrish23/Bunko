import { CloudOff, RefreshCw } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { flush, getSyncStatus, subscribeSyncStatus } from '../../lib/offline/outbox';
import { getAccessToken } from '../../lib/api/token-store';

function changes(count: number): string {
  return `${count} ${count === 1 ? 'change' : 'changes'} waiting to sync`;
}

// Only visible when there's something to say: offline, syncing, changes
// waiting, or a sync problem.
export function SyncStatusPill() {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);

  let message: string | null = null;
  if (!status.online) {
    message = status.pending > 0 ? `Offline — ${changes(status.pending)}` : 'Offline — downloaded books still open';
  } else if (status.syncing) {
    message = 'Syncing…';
  } else if (status.lastError) {
    message = `Couldn’t sync: ${status.lastError}`;
  } else if (status.pending > 0) {
    message = changes(status.pending);
  }
  const canRetry = status.online && !status.syncing && status.pending > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        message
          ? 'fixed bottom-20 left-1/2 z-30 md:bottom-4 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-paper-300 bg-paper-50/95 py-1.5 pl-3 pr-1.5 text-xs text-paper-800 shadow-card backdrop-blur'
          : 'sr-only'
      }
    >
      {message && (
        <>
          {!status.online ? (
            <CloudOff aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-paper-700" />
          ) : (
            <RefreshCw
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 text-moss-600 ${status.syncing ? 'motion-safe:animate-spin' : ''}`}
            />
          )}
          <span className="truncate">{message}</span>
          {canRetry && (
            <button
              type="button"
              onClick={() => getAccessToken() && void flush()}
              className="focus-visible:focus-ring shrink-0 rounded-full px-3 py-1.5 font-semibold text-moss-700 hover:bg-moss-50"
            >
              Sync now
            </button>
          )}
        </>
      )}
    </div>
  );
}
