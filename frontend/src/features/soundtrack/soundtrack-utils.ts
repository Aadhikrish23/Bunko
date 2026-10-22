import type { Soundtrack, SoundtrackProvider } from '../../lib/api/types';

// SRS §17.4's starting set. Moods are free-text targets, so readers can
// add their own alongside these ("configurable").
export const DEFAULT_MOODS = [
  'Calm',
  'Epic',
  'Dark',
  'Mysterious',
  'Tense',
  'Romantic',
  'Emotional',
  'Adventure',
  'Battle',
  'Historical',
  'Fantasy',
  'Horror',
] as const;

export const PROVIDER_LABELS: Record<SoundtrackProvider, string> = {
  SPOTIFY: 'Spotify',
  YOUTUBE: 'YouTube',
  APPLE_MUSIC: 'Apple Music',
  SOUNDCLOUD: 'SoundCloud',
};

// Each provider's embed is a different shape; these are the heights their
// own embed snippets use for a compact player.
export const EMBED_HEIGHT: Record<SoundtrackProvider, number> = {
  SPOTIFY: 152,
  YOUTUBE: 200,
  APPLE_MUSIC: 175,
  SOUNDCLOUD: 166,
};

// Defence in depth: the API only ever returns these origins (backend
// T-058 parser), but the client still refuses to frame anything else.
const EMBED_ORIGINS = new Set([
  'https://open.spotify.com',
  'https://www.youtube-nocookie.com',
  'https://embed.music.apple.com',
  'https://w.soundcloud.com',
]);

export function isAllowedEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && EMBED_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}

// Player URL for this page: YouTube needs the parent origin to accept
// volume commands, and autoplay is only requested right after the reader
// turned the soundtrack on (a user gesture the browser can honour).
export function playerUrl(soundtrack: Soundtrack, options: { autoPlay: boolean; origin: string }): string {
  const url = new URL(soundtrack.embedUrl);
  if (soundtrack.provider === 'YOUTUBE') {
    url.searchParams.set('origin', options.origin);
    if (options.autoPlay) url.searchParams.set('autoplay', '1');
  }
  if (soundtrack.provider === 'SOUNDCLOUD' && options.autoPlay) {
    url.searchParams.set('auto_play', 'true');
  }
  return url.toString();
}

export interface PlayerMessage {
  message: string;
  targetOrigin: string;
}

// The embeds' own postMessage protocols — only for providers whose
// capabilities say volume is controllable from Bunko.
export function volumeMessage(provider: SoundtrackProvider, volume: number): PlayerMessage | null {
  const value = Math.round(Math.min(100, Math.max(0, volume)));
  if (provider === 'YOUTUBE') {
    return {
      message: JSON.stringify({ event: 'command', func: 'setVolume', args: [value] }),
      targetOrigin: 'https://www.youtube-nocookie.com',
    };
  }
  if (provider === 'SOUNDCLOUD') {
    return { message: JSON.stringify({ method: 'setVolume', value }), targetOrigin: 'https://w.soundcloud.com' };
  }
  return null;
}

// Free-text targets are stored lowercased; show them in sentence case.
export function displayLabel(key: string): string {
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : key;
}

export interface ManualChoice {
  id: string; // stable per choice, e.g. "mood:epic" — two moods may share one playlist
  label: string;
  group: 'Moods' | 'Situations' | 'Playlists';
  soundtrackId: string;
}

const DEFAULT_MOOD_ORDER = new Map<string, number>(DEFAULT_MOODS.map((mood, index) => [mood.toLowerCase(), index]));

// What manual mode in the reader player can pick: moods and situations
// that have a playlist (SRS §17.2 — moods/situations are manual picks,
// not automatic inputs), then every playlist directly.
export function manualChoices(soundtracks: Soundtrack[]): ManualChoice[] {
  const moods: ManualChoice[] = [];
  const situations: ManualChoice[] = [];
  for (const soundtrack of soundtracks) {
    for (const mapping of soundtrack.mappings) {
      if (mapping.targetType === 'MOOD') {
        moods.push({ id: `mood:${mapping.targetKey}`, label: displayLabel(mapping.targetKey), group: 'Moods', soundtrackId: soundtrack.id });
      } else if (mapping.targetType === 'SITUATION') {
        situations.push({
          id: `situation:${mapping.targetKey}`,
          label: displayLabel(mapping.targetKey),
          group: 'Situations',
          soundtrackId: soundtrack.id,
        });
      }
    }
  }
  const moodRank = (choice: ManualChoice) => DEFAULT_MOOD_ORDER.get(choice.label.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
  moods.sort((a, b) => moodRank(a) - moodRank(b) || a.label.localeCompare(b.label));
  situations.sort((a, b) => a.label.localeCompare(b.label));
  const playlists = soundtracks.map<ManualChoice>((soundtrack) => ({
    id: `playlist:${soundtrack.id}`,
    label: soundtrack.name,
    group: 'Playlists',
    soundtrackId: soundtrack.id,
  }));
  return [...moods, ...situations, ...playlists];
}

export type SoundtrackMode = 'automatic' | 'manual';

// Per-device on purpose: turning music on at a desk shouldn't start it
// the next time the same account opens a book on a phone.
export interface SoundtrackPrefs {
  enabled: boolean;
  mode: SoundtrackMode;
  manualChoiceId: string | null;
  volume: number;
}

export const DEFAULT_PREFS: SoundtrackPrefs = { enabled: false, mode: 'automatic', manualChoiceId: null, volume: 70 };

export function parsePrefs(raw: string | null): SoundtrackPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<SoundtrackPrefs>;
    return {
      enabled: value.enabled === true,
      mode: value.mode === 'manual' ? 'manual' : 'automatic',
      manualChoiceId: typeof value.manualChoiceId === 'string' ? value.manualChoiceId : null,
      volume:
        typeof value.volume === 'number' && Number.isFinite(value.volume)
          ? Math.min(100, Math.max(0, Math.round(value.volume)))
          : DEFAULT_PREFS.volume,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

const PREFS_KEY = 'bunko:soundtrack-prefs';

export function loadPrefs(): SoundtrackPrefs {
  try {
    return parsePrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: SoundtrackPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private mode / blocked): the preference just
    // won't persist past this page.
  }
}
