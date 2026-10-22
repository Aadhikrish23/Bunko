import { Check, Download } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { errorMessage } from '../../lib/error-message';
import { formatBytes, useDownloadEdition, useDownloads, useRemoveDownload } from '../../lib/offline/use-downloads';

// "Download for offline" (T-073) for one digital edition the reader owns.
// Nothing is ever downloaded without this explicit action.
export function OfflineDownloadButton({ editionId, title }: { editionId: string; title: string }) {
  const downloads = useDownloads();
  const download = useDownloadEdition();
  const remove = useRemoveDownload();
  const existing = downloads.data?.find((record) => record.editionId === editionId);

  if (downloads.isLoading) return null;

  if (existing) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-paper-700">
        <span className="inline-flex items-center gap-1 text-moss-700">
          <Check aria-hidden="true" className="h-4 w-4" /> Available offline ({formatBytes(existing.sizeBytes)})
        </span>
        <Button size="sm" variant="ghost" isLoading={remove.isPending} onClick={() => remove.mutate(editionId)}>
          Remove download
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="secondary"
        className="self-start"
        isLoading={download.isPending}
        onClick={() => download.mutate({ editionId, title })}
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        {download.isPending ? 'Downloading…' : 'Download for offline'}
      </Button>
      {download.isError && (
        <p className="text-sm text-ember-600">{errorMessage(download.error, 'Could not download this book.')}</p>
      )}
    </div>
  );
}
