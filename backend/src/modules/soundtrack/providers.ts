// T-058: turns a playlist link the reader pastes into the provider's
// official embed player. Bunko never fetches, stores, or proxies audio
// (SRS §17.6) — it only frames the provider's own player — and only for
// the hosts below, so an arbitrary URL can never become an iframe.

export type SoundtrackProvider = 'SPOTIFY' | 'YOUTUBE' | 'APPLE_MUSIC' | 'SOUNDCLOUD';

export interface ProviderCapabilities {
  // Whether Bunko can set volume itself through the embed's message
  // protocol. Where false, volume lives in the provider's own player or
  // the device (SRS §17.7 "control volume where permitted").
  volumeControl: boolean;
}

export const PROVIDER_CAPABILITIES: Record<SoundtrackProvider, ProviderCapabilities> = {
  SPOTIFY: { volumeControl: false },
  YOUTUBE: { volumeControl: true },
  APPLE_MUSIC: { volumeControl: false },
  SOUNDCLOUD: { volumeControl: true },
};

export interface ParsedSoundtrackUrl {
  provider: SoundtrackProvider;
  canonicalUrl: string; // the share link with tracking parameters stripped
  embedUrl: string;
}

export class UnsupportedSoundtrackUrlError extends Error {}

const SUPPORTED_HINT = 'Paste a Spotify, YouTube, Apple Music, or SoundCloud link to a playlist, album, or track.';

const SPOTIFY_TYPES = new Set(['playlist', 'album', 'track', 'artist', 'show', 'episode']);
const APPLE_TYPES = new Set(['playlist', 'album', 'song', 'station']);
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const SOUNDCLOUD_HOSTS = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com']);

const SPOTIFY_ID = /^[A-Za-z0-9]{10,40}$/;
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_LIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const SLUG = /^[A-Za-z0-9._~%-]{1,200}$/;

function parseSpotifyUri(raw: string): ParsedSoundtrackUrl | null {
  const match = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(raw);
  if (!match) return null;
  return spotify(match[1]!, match[2]!);
}

function spotify(type: string, id: string): ParsedSoundtrackUrl {
  if (!SPOTIFY_TYPES.has(type) || !SPOTIFY_ID.test(id)) {
    throw new UnsupportedSoundtrackUrlError('That Spotify link isn’t a playlist, album, track, artist, or podcast.');
  }
  return {
    provider: 'SPOTIFY',
    canonicalUrl: `https://open.spotify.com/${type}/${id}`,
    embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
  };
}

function youtube(url: URL): ParsedSoundtrackUrl {
  const segments = url.pathname.split('/').filter(Boolean);
  let videoId: string | null = null;
  const listId = url.searchParams.get('list');

  if (url.hostname === 'youtu.be') {
    videoId = segments[0] ?? null;
  } else if (segments[0] === 'watch') {
    videoId = url.searchParams.get('v');
  } else if (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') {
    videoId = segments[1] ?? null;
  }

  // enablejsapi=1 lets Bunko send the player volume commands
  // (PROVIDER_CAPABILITIES); youtube-nocookie avoids tracking cookies
  // until the reader actually plays something.
  if (listId && YOUTUBE_LIST_ID.test(listId)) {
    return {
      provider: 'YOUTUBE',
      canonicalUrl: `https://www.youtube.com/playlist?list=${listId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${listId}&enablejsapi=1`,
    };
  }
  if (videoId && YOUTUBE_VIDEO_ID.test(videoId)) {
    return {
      provider: 'YOUTUBE',
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1`,
    };
  }
  throw new UnsupportedSoundtrackUrlError('That YouTube link doesn’t point to a video or playlist.');
}

function appleMusic(url: URL): ParsedSoundtrackUrl {
  // /{storefront}/{type}/{slug}/{id}, e.g. /us/playlist/deep-focus/pl.u-abc123
  const [storefront, type, slug, id] = url.pathname.split('/').filter(Boolean);
  if (
    !storefront ||
    !/^[a-z]{2}$/.test(storefront) ||
    !type ||
    !APPLE_TYPES.has(type) ||
    !slug ||
    !SLUG.test(slug) ||
    !id ||
    !/^[A-Za-z0-9._-]{1,80}$/.test(id)
  ) {
    throw new UnsupportedSoundtrackUrlError('That Apple Music link isn’t a playlist, album, song, or station.');
  }
  const path = `${storefront}/${type}/${slug}/${id}`;
  const track = url.searchParams.get('i');
  const trackQuery = track && /^\d{1,20}$/.test(track) ? `?i=${track}` : '';
  return {
    provider: 'APPLE_MUSIC',
    canonicalUrl: `https://music.apple.com/${path}${trackQuery}`,
    embedUrl: `https://embed.music.apple.com/${path}${trackQuery}`,
  };
}

function soundcloud(url: URL): ParsedSoundtrackUrl {
  const segments = url.pathname.split('/').filter(Boolean);
  const valid =
    (segments.length === 2 || (segments.length === 3 && segments[1] === 'sets')) &&
    segments.every((segment) => SLUG.test(segment));
  if (!valid) {
    throw new UnsupportedSoundtrackUrlError('That SoundCloud link isn’t a track or a set (playlist).');
  }
  const canonicalUrl = `https://soundcloud.com/${segments.join('/')}`;
  return {
    provider: 'SOUNDCLOUD',
    canonicalUrl,
    embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(canonicalUrl)}&auto_play=false&visual=false`,
  };
}

export function parseSoundtrackUrl(input: string): ParsedSoundtrackUrl {
  const raw = input.trim();
  const fromUri = parseSpotifyUri(raw);
  if (fromUri) return fromUri;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsupportedSoundtrackUrlError(SUPPORTED_HINT);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsupportedSoundtrackUrlError(SUPPORTED_HINT);
  }

  const host = url.hostname.toLowerCase();
  if (host === 'open.spotify.com') {
    // /playlist/{id}, or a localised /intl-xx/playlist/{id}
    const segments = url.pathname.split('/').filter(Boolean);
    const offset = segments[0]?.startsWith('intl-') ? 1 : 0;
    const type = segments[offset];
    const id = segments[offset + 1];
    if (!type || !id) throw new UnsupportedSoundtrackUrlError('That Spotify link doesn’t point to anything playable.');
    return spotify(type, id);
  }
  if (YOUTUBE_HOSTS.has(host) || host === 'youtu.be') return youtube(url);
  if (host === 'music.apple.com') return appleMusic(url);
  if (SOUNDCLOUD_HOSTS.has(host)) return soundcloud(url);
  if (host === 'on.soundcloud.com') {
    throw new UnsupportedSoundtrackUrlError('Open that SoundCloud short link and copy the full soundcloud.com address instead.');
  }

  throw new UnsupportedSoundtrackUrlError(SUPPORTED_HINT);
}
