import { api } from './api/client';
import { enqueue } from './offline/outbox';
import { onlineOr } from './offline/online-or';

// Synced preferences (Phase 9, T-068): last-write-wins per key, compared by
// when the change was made on the device. Each key keeps its local copy
// where it always lived (localStorage); this module only moves values
// between that copy and the server.
export type PreferenceKey = 'reader-settings' | 'soundtrack';

interface ServerPreference {
  key: PreferenceKey;
  value: Record<string, unknown>;
  updatedAt: string;
}

const META_KEY = 'bunko:preference-times';
const PUSH_DELAY_MS = 1500; // sliders fire constantly; send the settled value

function readTimes(): Partial<Record<PreferenceKey, string>> {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Record<PreferenceKey, string>>;
  } catch {
    return {};
  }
}

function writeTime(key: PreferenceKey, updatedAt: string): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ ...readTimes(), [key]: updatedAt }));
  } catch {
    // Without storage the next pull simply applies the server's value.
  }
}

const appliers = new Map<PreferenceKey, (value: Record<string, unknown>) => void>();

// How a value that arrived from another device is written locally.
export function registerPreference(key: PreferenceKey, apply: (value: Record<string, unknown>) => void): void {
  appliers.set(key, apply);
}

const pending = new Map<PreferenceKey, ReturnType<typeof setTimeout>>();

export function pushPreference(key: PreferenceKey, value: Record<string, unknown>): void {
  const updatedAt = new Date().toISOString();
  writeTime(key, updatedAt);
  const timer = pending.get(key);
  if (timer) clearTimeout(timer);
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      void onlineOr(
        () => api.put(`/preferences/${key}`, { value, updatedAt }),
        () => enqueue('PREFERENCE_SET', { key, value }),
      ).catch(() => undefined);
    }, PUSH_DELAY_MS),
  );
}

// On sign-in / reconnect: take any server value newer than this device's.
export async function pullPreferences(): Promise<void> {
  const preferences = await api.get<ServerPreference[]>('/preferences');
  const times = readTimes();
  for (const preference of preferences) {
    const local = times[preference.key];
    if (local && new Date(local) >= new Date(preference.updatedAt)) continue;
    appliers.get(preference.key)?.(preference.value);
    writeTime(preference.key, preference.updatedAt);
  }
}
