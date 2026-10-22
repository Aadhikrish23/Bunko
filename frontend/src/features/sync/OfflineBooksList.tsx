import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { formatBytes, useDownloads, useRemoveDownload, useStorageEstimate } from '../../lib/offline/use-downloads';

// The books on this device (T-073) — the way into reading while offline,
// when the library itself can't load.
export function OfflineBooksList({ showStorage = false }: { showStorage?: boolean }) {
  const downloads = useDownloads();
  const storage = useStorageEstimate();
  const remove = useRemoveDownload();

  if (downloads.isLoading) return <p className="text-sm text-paper-600">Loading downloads…</p>;
  const records = downloads.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {records.length === 0 ? (
        <p className="text-sm text-paper-600">
          No books downloaded on this device. Use “Download for offline” on a digital book’s page while online.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-paper-200">
          {records.map((record) => (
            <li key={record.editionId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-paper-900">{record.title}</p>
                <p className="text-xs text-paper-600">
                  {record.format} · {formatBytes(record.sizeBytes)}
                </p>
              </div>
              <div className="flex gap-1">
                <Link
                  to={`/read-chapters/${record.editionId}`}
                  className="focus-visible:focus-ring inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-moss-600 px-3 text-sm font-medium text-paper-50 hover:bg-moss-700"
                >
                  <BookOpen aria-hidden="true" className="h-4 w-4" /> Read
                </Link>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(record.editionId)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {showStorage && storage.data && (
        <p className="text-xs text-paper-600">
          Using {formatBytes(storage.data.usage)} of the {formatBytes(storage.data.quota)} this browser allows.
        </p>
      )}
    </div>
  );
}
