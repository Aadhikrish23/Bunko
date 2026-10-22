import { DEFAULT_READER_SETTINGS, writeReaderSettingsLocally, type ReaderSettings } from '../features/reader/reader-settings';
import { loadPrefs, savePrefs, type SoundtrackPrefs } from '../features/soundtrack/soundtrack-utils';
import { registerPreference } from './preferences-sync';

// Which device-local stores each synced preference writes into when a
// newer value arrives from another device.
registerPreference('reader-settings', (value) =>
  writeReaderSettingsLocally({ ...DEFAULT_READER_SETTINGS, ...(value as Partial<ReaderSettings>) }),
);

// The on/off switch is device state, not a preference (ARCHITECTURE.md §13):
// a synced value never turns music on or off here.
registerPreference('soundtrack', (value) => {
  const current = loadPrefs();
  const incoming = value as Partial<SoundtrackPrefs>;
  savePrefs({
    ...current,
    mode: incoming.mode === 'manual' ? 'manual' : 'automatic',
    manualChoiceId: typeof incoming.manualChoiceId === 'string' ? incoming.manualChoiceId : null,
    volume: typeof incoming.volume === 'number' ? incoming.volume : current.volume,
  });
});

export function sharedSoundtrackPrefs(prefs: SoundtrackPrefs): Record<string, unknown> {
  return { mode: prefs.mode, manualChoiceId: prefs.manualChoiceId, volume: prefs.volume };
}
