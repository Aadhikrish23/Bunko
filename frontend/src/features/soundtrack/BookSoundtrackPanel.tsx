import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useMapSoundtrack, useSoundtracks, useUnmapSoundtrack, useWorkSoundtrack } from '../../lib/api/soundtracks';
import { errorMessage } from '../../lib/error-message';
import { displayLabel } from './soundtrack-utils';

// SRS §17.3 — a book's own soundtrack, plus what automatic mode falls
// back to without one (shelf, then genre — backend T-061).
export function BookSoundtrackPanel({ workId }: { workId: string }) {
  const soundtracks = useSoundtracks();
  const resolution = useWorkSoundtrack(workId);
  const map = useMapSoundtrack();
  const unmap = useUnmapSoundtrack();
  const selectId = useId();

  if (soundtracks.isLoading) return <p className="text-sm text-paper-600">Loading playlists…</p>;
  if (soundtracks.isError) {
    return <ErrorBanner message={errorMessage(soundtracks.error, 'Could not load your playlists.')} />;
  }

  const playlists = soundtracks.data ?? [];
  const bookMapping = playlists
    .flatMap((soundtrack) => soundtrack.mappings)
    .find((mapping) => mapping.targetType === 'WORK' && mapping.targetKey === workId);
  const fallback = !bookMapping ? resolution.data?.match : null;

  if (playlists.length === 0) {
    return (
      <p className="text-sm text-paper-600">
        No playlists yet.{' '}
        <Link to="/soundtracks" className="focus-visible:focus-ring rounded font-medium text-moss-700 underline">
          Add one
        </Link>{' '}
        to give this book a soundtrack.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(map.isError || unmap.isError) && (
        <ErrorBanner message={errorMessage(map.error ?? unmap.error, 'Could not update the book soundtrack.')} />
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-sm font-medium text-paper-800">
          Book soundtrack
        </label>
        <select
          id={selectId}
          value={bookMapping?.soundtrackId ?? ''}
          disabled={map.isPending || unmap.isPending}
          onChange={(e) => {
            if (e.target.value) {
              map.mutate({ soundtrackId: e.target.value, targetType: 'WORK', targetKey: workId });
            } else if (bookMapping) {
              unmap.mutate(bookMapping.id);
            }
          }}
          className="focus-visible:focus-ring min-h-[44px] max-w-sm rounded-md border border-paper-300 bg-paper-50 px-3 text-sm text-paper-900"
        >
          <option value="">None — use automatic</option>
          {playlists.map((soundtrack) => (
            <option key={soundtrack.id} value={soundtrack.id}>
              {soundtrack.name}
            </option>
          ))}
        </select>
      </div>

      {!bookMapping && (
        <p className="text-sm text-paper-600">
          {fallback ? (
            <>
              Automatic mode plays <span className="font-medium text-paper-900">{fallback.soundtrack.name}</span>, from{' '}
              {fallback.via.targetType === 'SHELF'
                ? `your “${fallback.via.label ?? 'shelf'}” shelf`
                : `the ${displayLabel(fallback.via.targetKey)} genre`}
              .
            </>
          ) : (
            'Nothing plays automatically for this book yet — set a book soundtrack, or associate a playlist with one of its shelves or genres.'
          )}
        </p>
      )}

      <Link to="/soundtracks" className="focus-visible:focus-ring w-fit rounded text-sm font-medium text-moss-700 underline">
        Manage playlists
      </Link>
    </div>
  );
}
