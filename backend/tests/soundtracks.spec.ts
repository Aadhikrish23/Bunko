import { randomUUID } from 'crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures/auth.fixture';

const SPOTIFY = 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO?si=tracking123';
const YOUTUBE = 'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI';

async function createWork(authedRequest: APIRequestContext, genres: string[] = []) {
  const response = await authedRequest.post('/api/v1/works', {
    data: { title: `Soundtrack Book ${randomUUID()}`, coverImageUrl: 'https://example.com/c.jpg', genres },
  });
  return (await response.json()).data.id as string;
}

async function createSoundtrack(authedRequest: APIRequestContext, name: string, url: string) {
  const response = await authedRequest.post('/api/v1/soundtracks', { data: { name, url } });
  expect(response.status()).toBe(201);
  return (await response.json()).data;
}

async function map(authedRequest: APIRequestContext, soundtrackId: string, targetType: string, targetKey: string) {
  return authedRequest.put('/api/v1/soundtrack-mappings', { data: { soundtrackId, targetType, targetKey } });
}

test.describe('soundtrack links (T-058, T-060)', () => {
  test('requires authentication', async ({ request }) => {
    expect((await request.get('/api/v1/soundtracks')).status()).toBe(401);
  });

  test('stores the cleaned share link and exposes the official embed URL', async ({ authedRequest }) => {
    const soundtrack = await createSoundtrack(authedRequest, 'Epic focus', SPOTIFY);
    expect(soundtrack).toMatchObject({
      name: 'Epic focus',
      provider: 'SPOTIFY',
      url: 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO',
      embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4sWSpwq3LiO',
      capabilities: { volumeControl: false },
      mappings: [],
    });
  });

  test('recognises every supported provider', async ({ authedRequest }) => {
    const cases: Array<[string, string, string]> = [
      [YOUTUBE, 'YOUTUBE', 'https://www.youtube-nocookie.com/'],
      ['https://music.apple.com/us/playlist/pure-focus/pl.f54198ad42404535be13eabf3835fb22', 'APPLE_MUSIC', 'https://embed.music.apple.com/'],
      ['https://soundcloud.com/lofi_girl/sets/lofi-hip-hop', 'SOUNDCLOUD', 'https://w.soundcloud.com/player/'],
    ];
    for (const [url, provider, embedPrefix] of cases) {
      const soundtrack = await createSoundtrack(authedRequest, provider, url);
      expect(soundtrack.provider).toBe(provider);
      expect(soundtrack.embedUrl.startsWith(embedPrefix)).toBe(true);
    }
  });

  test('rejects links that are not from a supported provider, with a field-level error', async ({ authedRequest }) => {
    for (const url of [
      'https://evil.example.com/playlist/37i9dQZF1DX4sWSpwq3LiO',
      'https://open.spotify.com.evil.com/playlist/37i9dQZF1DX4sWSpwq3LiO',
      'javascript:alert(1)',
      'https://www.youtube.com/@somechannel',
    ]) {
      const response = await authedRequest.post('/api/v1/soundtracks', { data: { name: 'x', url } });
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details[0].field).toBe('url');
    }
  });

  test('renames, re-points, and deletes a soundtrack', async ({ authedRequest }) => {
    const soundtrack = await createSoundtrack(authedRequest, 'Original', SPOTIFY);

    const renamed = await authedRequest.patch(`/api/v1/soundtracks/${soundtrack.id}`, {
      data: { name: 'Renamed', url: YOUTUBE },
    });
    expect(renamed.status()).toBe(200);
    expect((await renamed.json()).data).toMatchObject({ name: 'Renamed', provider: 'YOUTUBE' });

    expect((await authedRequest.delete(`/api/v1/soundtracks/${soundtrack.id}`)).status()).toBe(204);
    const list = (await (await authedRequest.get('/api/v1/soundtracks')).json()).data;
    expect(list).toEqual([]);
  });
});

test.describe('soundtrack associations (T-059, T-060)', () => {
  test('free-text targets are normalised, and re-mapping a target re-points it', async ({ authedRequest }) => {
    const calm = await createSoundtrack(authedRequest, 'Calm', SPOTIFY);
    const epic = await createSoundtrack(authedRequest, 'Epic', YOUTUBE);

    const first = await map(authedRequest, calm.id, 'MOOD', '  Rainy   Evening ');
    expect(first.status()).toBe(200);
    expect((await first.json()).data.targetKey).toBe('rainy evening');

    const second = await map(authedRequest, epic.id, 'MOOD', 'RAINY EVENING');
    expect((await second.json()).data.soundtrackId).toBe(epic.id);

    const list = (await (await authedRequest.get('/api/v1/soundtracks')).json()).data;
    const byName = Object.fromEntries(list.map((s: { name: string; mappings: unknown[] }) => [s.name, s.mappings]));
    expect(byName.Calm).toEqual([]);
    expect(byName.Epic).toHaveLength(1);
  });

  test('book and shelf targets must belong to the caller, and carry readable labels', async ({ authedRequest }) => {
    const soundtrack = await createSoundtrack(authedRequest, 'Book music', SPOTIFY);
    expect((await map(authedRequest, soundtrack.id, 'WORK', randomUUID())).status()).toBe(404);
    expect((await map(authedRequest, soundtrack.id, 'SHELF', randomUUID())).status()).toBe(404);
    expect((await map(authedRequest, soundtrack.id, 'WORK', 'not-a-uuid')).status()).toBe(400);

    const workId = await createWork(authedRequest);
    const mapped = await map(authedRequest, soundtrack.id, 'WORK', workId);
    expect(mapped.status()).toBe(200);
    expect((await mapped.json()).data.label).toMatch(/^Soundtrack Book /);
  });

  test('deleting a soundtrack removes its associations; deleting a shelf or removing a book removes theirs', async ({
    authedRequest,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    const soundtrack = await createSoundtrack(authedRequest, 'Cleanup', SPOTIFY);
    const workId = await createWork(authedRequest);
    const shelf = (await (await authedRequest.post('/api/v1/shelves', { data: { name: `Shelf ${randomUUID()}` } })).json())
      .data;

    await map(authedRequest, soundtrack.id, 'WORK', workId);
    await map(authedRequest, soundtrack.id, 'SHELF', shelf.id);
    await map(authedRequest, soundtrack.id, 'GENRE', 'Fantasy');

    await authedRequest.delete(`/api/v1/shelves/${shelf.id}`);
    await authedRequest.delete(`/api/v1/works/${workId}`);
    const after = (await (await authedRequest.get('/api/v1/soundtracks')).json()).data[0];
    expect(after.mappings.map((m: { targetType: string }) => m.targetType)).toEqual(['GENRE']);

    // The remaining GENRE row has a foreign key to the soundtrack, so this
    // delete only succeeds because the association cascades with it.
    expect((await authedRequest.delete(`/api/v1/soundtracks/${soundtrack.id}`)).status()).toBe(204);
  });

  test("a user can't see, map, or change another user's soundtrack", async ({ authedRequest, request }) => {
    const soundtrack = await createSoundtrack(authedRequest, 'Mine', SPOTIFY);
    const other = await request.post('/api/v1/auth/register', {
      data: { email: `st-other-${randomUUID()}@example.com`, password: 'correct-horse-battery-staple', displayName: 'Other' },
    });
    const headers = { Authorization: `Bearer ${(await other.json()).data.accessToken}` };

    expect((await (await request.get('/api/v1/soundtracks', { headers })).json()).data).toEqual([]);
    expect(
      (await request.put('/api/v1/soundtrack-mappings', {
        headers,
        data: { soundtrackId: soundtrack.id, targetType: 'MOOD', targetKey: 'calm' },
      })).status(),
    ).toBe(404);
    expect((await request.patch(`/api/v1/soundtracks/${soundtrack.id}`, { headers, data: { name: 'x' } })).status()).toBe(404);
    expect((await request.delete(`/api/v1/soundtracks/${soundtrack.id}`, { headers })).status()).toBe(404);
  });
});

test.describe('automatic soundtrack resolution (T-061)', () => {
  test('returns null when nothing matches, and 404 for a book not in the library', async ({ authedRequest }) => {
    const workId = await createWork(authedRequest, ['Mystery']);
    const none = await authedRequest.get(`/api/v1/works/${workId}/soundtrack`);
    expect(none.status()).toBe(200);
    expect((await none.json()).data).toEqual({ match: null });

    expect((await authedRequest.get(`/api/v1/works/${randomUUID()}/soundtrack`)).status()).toBe(404);
  });

  test('book soundtrack beats shelf, which beats genre', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(60_000);
    const workId = await createWork(authedRequest, ['Fantasy', 'Adventure']);
    const shelf = (await (await authedRequest.post('/api/v1/shelves', { data: { name: `Epics ${randomUUID()}` } })).json())
      .data;
    await authedRequest.post(`/api/v1/shelves/${shelf.id}/works`, { data: { workId } });

    const genreTrack = await createSoundtrack(authedRequest, 'Genre', SPOTIFY);
    const shelfTrack = await createSoundtrack(authedRequest, 'Shelf', YOUTUBE);
    const bookTrack = await createSoundtrack(authedRequest, 'Book', SPOTIFY);
    const resolve = async () => (await (await authedRequest.get(`/api/v1/works/${workId}/soundtrack`)).json()).data.match;

    await map(authedRequest, genreTrack.id, 'GENRE', 'adventure');
    expect(await resolve()).toMatchObject({ soundtrack: { id: genreTrack.id }, via: { targetType: 'GENRE', targetKey: 'adventure' } });

    await map(authedRequest, shelfTrack.id, 'SHELF', shelf.id);
    expect(await resolve()).toMatchObject({ soundtrack: { id: shelfTrack.id }, via: { targetType: 'SHELF', label: shelf.name } });

    const bookMapping = (await (await map(authedRequest, bookTrack.id, 'WORK', workId)).json()).data;
    expect(await resolve()).toMatchObject({ soundtrack: { id: bookTrack.id }, via: { targetType: 'WORK', mappingId: bookMapping.id } });

    // Clearing the book soundtrack falls back to the shelf again.
    await authedRequest.delete(`/api/v1/soundtrack-mappings/${bookMapping.id}`);
    expect((await resolve()).soundtrack.id).toBe(shelfTrack.id);
  });

  test('genre fallback follows the book’s own genre order', async ({ authedRequest }) => {
    const workId = await createWork(authedRequest, ['Fantasy', 'Adventure']);
    const fantasy = await createSoundtrack(authedRequest, 'Fantasy', SPOTIFY);
    const adventure = await createSoundtrack(authedRequest, 'Adventure', YOUTUBE);
    await map(authedRequest, adventure.id, 'GENRE', 'Adventure');
    await map(authedRequest, fantasy.id, 'GENRE', 'Fantasy');

    const match = (await (await authedRequest.get(`/api/v1/works/${workId}/soundtrack`)).json()).data.match;
    expect(match.soundtrack.id).toBe(fantasy.id);
  });
});
