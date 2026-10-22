import { Music, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Input } from '../../components/ui/Input';
import { PageSpinner } from '../../components/ui/Spinner';
import { ApiError } from '../../lib/api/client';
import { useShelves } from '../../lib/api/shelves';
import {
  useCreateSoundtrack,
  useDeleteSoundtrack,
  useMapSoundtrack,
  useSoundtracks,
  useUnmapSoundtrack,
  useUpdateSoundtrack,
} from '../../lib/api/soundtracks';
import { useStatistics } from '../../lib/api/statistics';
import type { Shelf, Soundtrack, SoundtrackMapping, SoundtrackTargetType } from '../../lib/api/types';
import { errorMessage } from '../../lib/error-message';
import { SoundtrackEmbed } from './SoundtrackEmbed';
import { DEFAULT_MOODS, PROVIDER_LABELS, displayLabel } from './soundtrack-utils';

const TARGET_LABEL: Record<SoundtrackTargetType, string> = {
  WORK: 'Book',
  SHELF: 'Shelf',
  GENRE: 'Genre',
  MOOD: 'Mood',
  SITUATION: 'Situation',
};

const SELECT_CLASS =
  'focus-visible:focus-ring min-h-[44px] rounded-md border border-paper-300 bg-paper-50 px-3 text-sm text-paper-900';

function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.details?.find((detail) => detail.field === field)?.issue : undefined;
}

function mappingLabel(mapping: SoundtrackMapping): string {
  if (mapping.targetType === 'WORK') return mapping.label ?? 'A removed book';
  if (mapping.targetType === 'SHELF') return mapping.label ?? 'A removed shelf';
  return displayLabel(mapping.targetKey);
}

function AddPlaylistCard() {
  const create = useCreateSoundtrack();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const urlError = fieldError(create.error, 'url');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ name: name.trim(), url: url.trim() }, { onSuccess: () => { setName(''); setUrl(''); } });
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-display text-lg text-paper-900">Add a playlist</h2>
      {create.isError && !urlError && <ErrorBanner message={errorMessage(create.error, 'Could not add the playlist.')} />}
      <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-start">
        <Input id="playlist-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rainy-day fantasy" maxLength={80} />
        <Input
          id="playlist-url"
          label="Link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://open.spotify.com/playlist/…"
          error={urlError}
          inputMode="url"
        />
        <Button type="submit" className="md:mt-7" isLoading={create.isPending} disabled={!name.trim() || !url.trim()}>
          Add
        </Button>
      </form>
      <p className="mt-2 text-xs text-paper-600">
        A Spotify, YouTube, Apple Music, or SoundCloud link to a playlist, album, or track.
      </p>
    </Card>
  );
}

function AssociationForm({ soundtrackId, shelves, genres }: { soundtrackId: string; shelves: Shelf[]; genres: string[] }) {
  const map = useMapSoundtrack();
  const id = useId();
  const [targetType, setTargetType] = useState<Exclude<SoundtrackTargetType, 'WORK'>>('MOOD');
  const [value, setValue] = useState('');
  const suggestions = targetType === 'MOOD' ? [...DEFAULT_MOODS] : targetType === 'GENRE' ? genres : [];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    map.mutate({ soundtrackId, targetType, targetKey: value.trim() }, { onSuccess: () => setValue('') });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <p className="text-xs text-paper-600">
        Each mood, situation, genre, and shelf plays one playlist — choosing one that’s already used moves it here. Book
        soundtracks are set from the book’s own page.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-type`} className="sr-only">
          Association type
        </label>
        <select
          id={`${id}-type`}
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value as typeof targetType);
            setValue('');
          }}
          className={SELECT_CLASS}
        >
          <option value="MOOD">Mood</option>
          <option value="SITUATION">Reading situation</option>
          <option value="GENRE">Genre</option>
          <option value="SHELF">Shelf</option>
        </select>

        {targetType === 'SHELF' ? (
          <>
            <label htmlFor={`${id}-value`} className="sr-only">
              Shelf
            </label>
            <select id={`${id}-value`} value={value} onChange={(e) => setValue(e.target.value)} className={`${SELECT_CLASS} min-w-0 flex-1`}>
              <option value="">Choose a shelf…</option>
              {shelves.map((shelf) => (
                <option key={shelf.id} value={shelf.id}>
                  {shelf.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label htmlFor={`${id}-value`} className="sr-only">
              {TARGET_LABEL[targetType]}
            </label>
            <input
              id={`${id}-value`}
              list={suggestions.length ? `${id}-suggestions` : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={60}
              placeholder={targetType === 'MOOD' ? 'e.g. Epic' : targetType === 'GENRE' ? 'e.g. Fantasy' : 'e.g. Bedtime'}
              className={`${SELECT_CLASS} min-w-0 flex-1 placeholder:text-paper-400`}
            />
            {suggestions.length > 0 && (
              <datalist id={`${id}-suggestions`}>
                {suggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            )}
          </>
        )}
        <Button type="submit" variant="secondary" isLoading={map.isPending} disabled={!value.trim()}>
          Add
        </Button>
      </div>
      {map.isError && <p className="text-sm text-ember-600">{errorMessage(map.error, 'Could not save that association.')}</p>}
    </form>
  );
}

function PlaylistCard({ soundtrack, shelves, genres }: { soundtrack: Soundtrack; shelves: Shelf[]; genres: string[] }) {
  const update = useUpdateSoundtrack();
  const remove = useDeleteSoundtrack();
  const unmap = useUnmapSoundtrack();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(soundtrack.name);
  const [previewing, setPreviewing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const provider = PROVIDER_LABELS[soundtrack.provider];

  function handleRename(event: FormEvent) {
    event.preventDefault();
    if (!draftName.trim()) return;
    update.mutate({ id: soundtrack.id, name: draftName.trim() }, { onSuccess: () => setRenaming(false) });
  }

  return (
    <li>
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <form onSubmit={handleRename} className="flex flex-wrap items-end gap-2">
                <Input
                  id={`rename-${soundtrack.id}`}
                  label="Name"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={80}
                  autoFocus
                />
                <Button type="submit" size="sm" isLoading={update.isPending} disabled={!draftName.trim()}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <h3 className="truncate font-display text-lg text-paper-900">{soundtrack.name}</h3>
            )}
            <p className="mt-0.5 text-xs text-paper-600">
              {provider} ·{' '}
              <a
                href={soundtrack.url}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-visible:focus-ring rounded underline hover:text-paper-900"
              >
                Open in {provider}
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="secondary" aria-expanded={previewing} onClick={() => setPreviewing((v) => !v)}>
              {previewing ? 'Hide player' : 'Preview'}
            </Button>
            {!renaming && (
              <Button size="sm" variant="ghost" onClick={() => { setDraftName(soundtrack.name); setRenaming(true); }}>
                Rename
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>
        </div>

        {/* Loads only on an explicit preview: an embed contacts the provider. */}
        {previewing && <SoundtrackEmbed soundtrack={soundtrack} />}

        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-paper-700">Plays for</h4>
          {soundtrack.mappings.length === 0 ? (
            <p className="text-sm text-paper-600">Nothing yet — add a mood, situation, genre, or shelf below.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {soundtrack.mappings.map((mapping) => {
                const label = mappingLabel(mapping);
                return (
                  <li
                    key={mapping.id}
                    className="inline-flex items-center rounded-full border border-paper-300 bg-paper-50 pl-3 text-xs text-paper-800"
                  >
                    <span className="mr-1 text-paper-600">{TARGET_LABEL[mapping.targetType]}:</span>
                    <span className="max-w-[12rem] truncate">{label}</span>
                    <button
                      type="button"
                      onClick={() => unmap.mutate(mapping.id)}
                      aria-label={`Remove ${TARGET_LABEL[mapping.targetType].toLowerCase()} ${label}`}
                      className="focus-visible:focus-ring ml-0.5 flex h-8 w-8 items-center justify-center rounded-full text-paper-600 hover:bg-paper-200 hover:text-paper-900"
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <AssociationForm soundtrackId={soundtrack.id} shelves={shelves} genres={genres} />

        {confirmDelete && (
          <ConfirmDialog
            title="Delete this playlist?"
            message={`Its associations in Bunko are removed too. The playlist itself stays on ${provider}.`}
            confirmLabel="Delete"
            isConfirming={remove.isPending}
            onConfirm={() => remove.mutate(soundtrack.id, { onSuccess: () => setConfirmDelete(false) })}
            onClose={() => setConfirmDelete(false)}
          />
        )}
      </Card>
    </li>
  );
}

export function SoundtracksPage() {
  const soundtracks = useSoundtracks();
  const shelves = useShelves();
  // The reader's own library genres, for suggestions — genre matching is
  // by the book's exact genre text, which readers rarely know offhand.
  const statistics = useStatistics();
  const genres = (statistics.data?.breakdowns.byGenre ?? [])
    .map((entry) => entry.label)
    .filter((label): label is string => label !== null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-paper-900">Soundtracks</h1>
        <p className="mt-1 max-w-2xl text-sm text-paper-600">
          Optional music while you read. Bunko plays your own playlists in the provider’s player — it never stores or
          streams music itself.
        </p>
      </div>

      <AddPlaylistCard />

      {soundtracks.isLoading && <PageSpinner />}
      {soundtracks.isError && <ErrorBanner message={errorMessage(soundtracks.error, 'Could not load your playlists.')} />}

      {soundtracks.data && soundtracks.data.length === 0 && (
        <EmptyState
          icon={Music}
          title="No playlists yet"
          description="Add a link above, then choose the moods, reading situations, genres, or shelves it suits."
        />
      )}

      {soundtracks.data && soundtracks.data.length > 0 && (
        <ul className="flex flex-col gap-4">
          {soundtracks.data.map((soundtrack) => (
            <PlaylistCard key={soundtrack.id} soundtrack={soundtrack} shelves={shelves.data ?? []} genres={genres} />
          ))}
        </ul>
      )}
    </div>
  );
}
