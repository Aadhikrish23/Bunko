import { Music, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSoundtracks, useWorkSoundtrack } from '../../lib/api/soundtracks';
import type { Soundtrack } from '../../lib/api/types';
import { SoundtrackEmbed } from './SoundtrackEmbed';
import {
  PROVIDER_LABELS,
  displayLabel,
  loadPrefs,
  manualChoices,
  savePrefs,
  volumeMessage,
  type SoundtrackMode,
  type SoundtrackPrefs,
} from './soundtrack-utils';

interface ReaderSoundtrackProps {
  workId: string | undefined;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

// Players need a moment after load before they accept commands.
const PLAYER_READY_DELAY_MS = 1000;

// SRS §17.7. The player lives at the reader-page level and knows nothing
// about the reading position, so page turns never touch playback. Hiding
// the panel keeps the same iframe mounted (music continues); Stop
// unmounts it, which ends playback immediately for every provider.
export function ReaderSoundtrack({ workId, open, onOpen, onClose }: ReaderSoundtrackProps) {
  const [prefs, setPrefs] = useState<SoundtrackPrefs>(() => loadPrefs());
  // Autoplay is only requested right after a click in this panel — a
  // user gesture the browser can honour. A soundtrack left on from an
  // earlier visit loads paused instead.
  const [autoPlay, setAutoPlay] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const ids = useId();

  const active = open || prefs.enabled;
  const soundtracks = useSoundtracks(active);
  const resolution = useWorkSoundtrack(workId, active && prefs.mode === 'automatic');

  const choices = manualChoices(soundtracks.data ?? []);
  const manualChoice = choices.find((choice) => choice.id === prefs.manualChoiceId) ?? null;
  const current: Soundtrack | null =
    prefs.mode === 'automatic'
      ? (resolution.data?.match?.soundtrack ?? null)
      : (soundtracks.data?.find((soundtrack) => soundtrack.id === manualChoice?.soundtrackId) ?? null);
  const playing = prefs.enabled && current !== null;

  function updatePrefs(patch: Partial<SoundtrackPrefs>) {
    setPrefs((previous) => {
      const next = { ...previous, ...patch };
      savePrefs(next);
      return next;
    });
  }

  function sendVolume(volume: number) {
    if (!current?.capabilities.volumeControl) return;
    const message = volumeMessage(current.provider, volume);
    if (message) iframeRef.current?.contentWindow?.postMessage(message.message, message.targetOrigin);
  }

  function stop() {
    updatePrefs({ enabled: false });
    setAutoPlay(false);
  }

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // While hidden, the still-playing player is inert: no stray keyboard
  // focus inside an invisible iframe, but audio is untouched.
  useEffect(() => {
    panelRef.current?.toggleAttribute('inert', !open);
  }, [open, playing]);

  const via = resolution.data?.match?.via;
  let status: string;
  if (!prefs.enabled) {
    status = 'Off. Music only plays when you turn it on.';
  } else if ((soundtracks.data?.length ?? 0) === 0 && !soundtracks.isLoading) {
    status = 'You haven’t added any playlists yet.';
  } else if (prefs.mode === 'manual') {
    status = current ? `Playing ${current.name}.` : 'Choose what to play.';
  } else if (resolution.isLoading) {
    status = 'Finding this book’s soundtrack…';
  } else if (current && via) {
    const source =
      via.targetType === 'WORK'
        ? 'this book’s soundtrack'
        : via.targetType === 'SHELF'
          ? `your “${via.label ?? 'shelf'}” shelf`
          : `the ${displayLabel(via.targetKey)} genre`;
    status = `Playing ${current.name}, from ${source}.`;
  } else {
    status = 'Nothing is set to play for this book. Pick something manually, or give the book a soundtrack.';
  }

  return (
    <>
      {!open && playing && current && (
        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-1 rounded-full border border-paper-300 bg-paper-50/95 py-1 pl-3 pr-1 text-xs shadow-card backdrop-blur">
          <Music aria-hidden="true" className="h-3.5 w-3.5 text-moss-600" />
          <button
            type="button"
            onClick={onOpen}
            className="focus-visible:focus-ring max-w-[10rem] truncate rounded px-1.5 py-2.5 font-medium text-paper-900 hover:underline"
          >
            <span className="sr-only">Now playing: </span>
            {current.name}
          </button>
          <button
            type="button"
            onClick={stop}
            className="focus-visible:focus-ring rounded-full px-3 py-2.5 font-semibold text-ember-600 hover:bg-ember-500/10"
          >
            Stop
          </button>
        </div>
      )}

      {(open || playing) && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="region"
          aria-label="Reading soundtrack"
          aria-hidden={!open}
          className={
            open
              ? 'fixed inset-x-3 bottom-3 z-40 flex max-h-[80vh] flex-col gap-3 overflow-y-auto rounded-xl border border-paper-300 bg-paper-50 p-4 shadow-2xl outline-none sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96'
              : 'pointer-events-none fixed bottom-0 right-0 h-px w-px overflow-hidden opacity-0'
          }
        >
          {open && (
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-paper-800">
                <Music aria-hidden="true" className="h-4 w-4 text-moss-600" /> Soundtrack
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={playing ? 'Hide player (music keeps playing)' : 'Close soundtrack panel'}
                className="focus-visible:focus-ring rounded-md p-2 text-paper-700 hover:bg-paper-100"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          )}

          {open && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={prefs.enabled}
                onClick={() => {
                  if (prefs.enabled) {
                    stop();
                  } else {
                    updatePrefs({ enabled: true });
                    setAutoPlay(true);
                  }
                }}
                className="focus-visible:focus-ring flex min-h-[44px] items-center justify-between rounded-lg border border-paper-200 bg-paper-100 px-3 text-sm font-medium text-paper-900"
              >
                Play music while reading
                <span
                  aria-hidden="true"
                  className={`relative h-5 w-9 rounded-full transition-colors ${prefs.enabled ? 'bg-moss-600' : 'bg-paper-300'}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper-50 shadow transition-transform ${prefs.enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
                  />
                </span>
              </button>

              <fieldset>
                <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-paper-700">Choose</legend>
                <div className="grid grid-cols-2 rounded-lg border border-paper-200 bg-paper-100 p-1">
                  {(['automatic', 'manual'] as SoundtrackMode[]).map((mode) => (
                    <label key={mode} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`${ids}-mode`}
                        value={mode}
                        checked={prefs.mode === mode}
                        onChange={() => {
                          updatePrefs({ mode });
                          setAutoPlay(prefs.enabled);
                        }}
                        className="peer sr-only"
                      />
                      <span className="flex min-h-[40px] items-center justify-center rounded-md text-sm font-medium text-paper-700 peer-checked:bg-paper-50 peer-checked:text-paper-900 peer-checked:shadow-sm peer-focus-visible:focus-ring">
                        {mode === 'automatic' ? 'Automatically' : 'Myself'}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {prefs.mode === 'manual' && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${ids}-choice`} className="text-sm font-medium text-paper-800">
                    Mood, situation, or playlist
                  </label>
                  <select
                    id={`${ids}-choice`}
                    value={prefs.manualChoiceId ?? ''}
                    onChange={(e) => {
                      updatePrefs({ manualChoiceId: e.target.value || null });
                      setAutoPlay(prefs.enabled);
                    }}
                    className="focus-visible:focus-ring min-h-[44px] rounded-md border border-paper-300 bg-paper-50 px-3 text-sm text-paper-900"
                  >
                    <option value="">Choose…</option>
                    {(['Moods', 'Situations', 'Playlists'] as const).map((group) => {
                      const inGroup = choices.filter((choice) => choice.group === group);
                      return inGroup.length > 0 ? (
                        <optgroup key={group} label={group}>
                          {inGroup.map((choice) => (
                            <option key={choice.id} value={choice.id}>
                              {choice.label}
                            </option>
                          ))}
                        </optgroup>
                      ) : null;
                    })}
                  </select>
                </div>
              )}

              <p role="status" className="text-sm text-paper-700">
                {status}
              </p>

              {playing && current && (
                current.capabilities.volumeControl ? (
                  <div className="flex items-center gap-3">
                    <label htmlFor={`${ids}-volume`} className="text-sm text-paper-800">
                      Volume
                    </label>
                    <input
                      id={`${ids}-volume`}
                      type="range"
                      min={0}
                      max={100}
                      value={prefs.volume}
                      onChange={(e) => {
                        const volume = Number(e.target.value);
                        updatePrefs({ volume });
                        sendVolume(volume);
                      }}
                      className="h-11 flex-1 accent-moss-600"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-paper-600">
                    {PROVIDER_LABELS[current.provider]} doesn’t let Bunko set the volume — use its player or your device.
                  </p>
                )
              )}

              <div className="flex items-center justify-between gap-2">
                <Link
                  to="/soundtracks"
                  className="focus-visible:focus-ring rounded text-sm font-medium text-moss-700 underline"
                >
                  Manage playlists
                </Link>
                {playing && (
                  <button
                    type="button"
                    onClick={stop}
                    className="focus-visible:focus-ring min-h-[44px] rounded-md border border-ember-500/40 px-4 text-sm font-semibold text-ember-600 hover:bg-ember-500/10"
                  >
                    Stop music
                  </button>
                )}
              </div>
            </div>
          )}

          {playing && current && (
            <SoundtrackEmbed
              key={current.id}
              ref={iframeRef}
              soundtrack={current}
              autoPlay={autoPlay}
              onLoad={() => window.setTimeout(() => sendVolume(prefs.volume), PLAYER_READY_DELAY_MS)}
            />
          )}
        </div>
      )}
    </>
  );
}
