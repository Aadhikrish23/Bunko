import { test, expect } from '@playwright/test';
import type { Soundtrack } from '../../lib/api/types';
import {
  DEFAULT_PREFS,
  displayLabel,
  isAllowedEmbedUrl,
  manualChoices,
  parsePrefs,
  playerUrl,
  volumeMessage,
} from './soundtrack-utils';

function soundtrack(overrides: Partial<Soundtrack>): Soundtrack {
  return {
    id: 's1',
    name: 'Playlist',
    url: 'https://open.spotify.com/playlist/abc',
    provider: 'SPOTIFY',
    embedUrl: 'https://open.spotify.com/embed/playlist/abc',
    capabilities: { volumeControl: false },
    mappings: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

test.describe('isAllowedEmbedUrl', () => {
  test('accepts only the providers’ official embed origins over https', () => {
    expect(isAllowedEmbedUrl('https://open.spotify.com/embed/playlist/abc')).toBe(true);
    expect(isAllowedEmbedUrl('https://www.youtube-nocookie.com/embed/videoseries?list=PL1')).toBe(true);
    expect(isAllowedEmbedUrl('https://embed.music.apple.com/us/playlist/x/pl.1')).toBe(true);
    expect(isAllowedEmbedUrl('https://w.soundcloud.com/player/?url=x')).toBe(true);
  });

  test('rejects look-alikes, other schemes, and garbage', () => {
    expect(isAllowedEmbedUrl('http://open.spotify.com/embed/playlist/abc')).toBe(false);
    expect(isAllowedEmbedUrl('https://open.spotify.com.evil.com/embed/playlist/abc')).toBe(false);
    expect(isAllowedEmbedUrl('https://www.youtube.com/embed/abc')).toBe(false); // must be the nocookie host
    expect(isAllowedEmbedUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedEmbedUrl('not a url')).toBe(false);
  });
});

test.describe('playerUrl', () => {
  test('YouTube gets the parent origin, and autoplay only when asked', () => {
    const yt = soundtrack({ provider: 'YOUTUBE', embedUrl: 'https://www.youtube-nocookie.com/embed/videoseries?list=PL1&enablejsapi=1' });
    const quiet = new URL(playerUrl(yt, { autoPlay: false, origin: 'http://localhost:5174' }));
    expect(quiet.searchParams.get('origin')).toBe('http://localhost:5174');
    expect(quiet.searchParams.get('autoplay')).toBeNull();
    expect(new URL(playerUrl(yt, { autoPlay: true, origin: 'x' })).searchParams.get('autoplay')).toBe('1');
  });

  test('other providers keep their embed URL (SoundCloud only flips its own autoplay flag)', () => {
    const sp = soundtrack({});
    expect(playerUrl(sp, { autoPlay: true, origin: 'x' })).toBe(sp.embedUrl);
    const sc = soundtrack({ provider: 'SOUNDCLOUD', embedUrl: 'https://w.soundcloud.com/player/?url=u&auto_play=false' });
    expect(new URL(playerUrl(sc, { autoPlay: true, origin: 'x' })).searchParams.get('auto_play')).toBe('true');
  });
});

test.describe('volumeMessage', () => {
  test('speaks each controllable embed’s protocol, clamped to 0-100', () => {
    expect(volumeMessage('YOUTUBE', 150)).toEqual({
      message: JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }),
      targetOrigin: 'https://www.youtube-nocookie.com',
    });
    expect(volumeMessage('SOUNDCLOUD', -5)).toEqual({
      message: JSON.stringify({ method: 'setVolume', value: 0 }),
      targetOrigin: 'https://w.soundcloud.com',
    });
  });

  test('returns null where the provider doesn’t permit volume control', () => {
    expect(volumeMessage('SPOTIFY', 50)).toBeNull();
    expect(volumeMessage('APPLE_MUSIC', 50)).toBeNull();
  });
});

test.describe('manualChoices', () => {
  test('moods first (default order, then custom), then situations, then every playlist', () => {
    const calm = soundtrack({
      id: 'calm',
      name: 'Calm keys',
      mappings: [
        { id: 'm1', soundtrackId: 'calm', targetType: 'MOOD', targetKey: 'zen', label: null },
        { id: 'm2', soundtrackId: 'calm', targetType: 'MOOD', targetKey: 'calm', label: null },
        { id: 'm3', soundtrackId: 'calm', targetType: 'SITUATION', targetKey: 'bedtime', label: null },
        { id: 'm4', soundtrackId: 'calm', targetType: 'GENRE', targetKey: 'poetry', label: null },
      ],
    });
    const epic = soundtrack({
      id: 'epic',
      name: 'Epic strings',
      mappings: [{ id: 'm5', soundtrackId: 'epic', targetType: 'MOOD', targetKey: 'epic', label: null }],
    });

    expect(manualChoices([calm, epic]).map((choice) => `${choice.group}:${choice.label}`)).toEqual([
      'Moods:Calm',
      'Moods:Epic',
      'Moods:Zen',
      'Situations:Bedtime',
      'Playlists:Calm keys',
      'Playlists:Epic strings',
    ]);
  });
});

test.describe('device preferences', () => {
  test('off by default, and unreadable storage falls back to defaults', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS.enabled).toBe(false);
    expect(parsePrefs('{not json')).toEqual(DEFAULT_PREFS);
  });

  test('keeps valid fields and sanitises the rest', () => {
    expect(parsePrefs(JSON.stringify({ enabled: true, mode: 'manual', manualChoiceId: 'mood:epic', volume: 140 }))).toEqual({
      enabled: true,
      mode: 'manual',
      manualChoiceId: 'mood:epic',
      volume: 100,
    });
    expect(parsePrefs(JSON.stringify({ enabled: 'yes', mode: 'shuffle', volume: 'loud' }))).toEqual(DEFAULT_PREFS);
  });

  test('labels stored lowercase display in sentence case', () => {
    expect(displayLabel('rainy evening')).toBe('Rainy evening');
  });
});
