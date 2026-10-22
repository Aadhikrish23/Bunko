import { randomUUID } from 'crypto';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures/auth.fixture';

async function createEdition(authedRequest: APIRequestContext) {
  const work = await authedRequest.post('/api/v1/works', {
    data: { title: `Bookmark Book ${randomUUID()}`, coverImageUrl: 'https://example.com/c.jpg' },
  });
  const workId = (await work.json()).data.id;
  const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format: 'EPUB' } });
  const editionId = (await edition.json()).data.id as string;
  await authedRequest.post('/api/v1/copies', { data: { editionId } });
  return editionId;
}

test.describe('bookmarks (T-067)', () => {
  test('requires authentication', async ({ request }) => {
    expect((await request.get(`/api/v1/editions/${randomUUID()}/bookmarks`)).status()).toBe(401);
  });

  test('create, list, idempotent re-create by client id, delete', async ({ authedRequest }) => {
    const editionId = await createEdition(authedRequest);
    const id = randomUUID();

    const first = await authedRequest.post(`/api/v1/editions/${editionId}/bookmarks`, {
      data: { id, position: 'ch4', label: 'Chapter 4' },
    });
    expect(first.status()).toBe(201);
    const again = await authedRequest.post(`/api/v1/editions/${editionId}/bookmarks`, {
      data: { id, position: 'ch4', label: 'Chapter 4' },
    });
    expect(again.status()).toBe(200);

    const list = (await (await authedRequest.get(`/api/v1/editions/${editionId}/bookmarks`)).json()).data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, position: 'ch4', label: 'Chapter 4' });

    expect((await authedRequest.delete(`/api/v1/bookmarks/${id}`)).status()).toBe(204);
    expect((await authedRequest.delete(`/api/v1/bookmarks/${id}`)).status()).toBe(404);
  });

  test("a user can't list or delete another user's bookmarks", async ({ authedRequest, request }) => {
    const editionId = await createEdition(authedRequest);
    const created = await authedRequest.post(`/api/v1/editions/${editionId}/bookmarks`, {
      data: { position: 'ch1', label: 'Start' },
    });
    const id = (await created.json()).data.id;
    const other = await request.post('/api/v1/auth/register', {
      data: { email: `bm-other-${randomUUID()}@example.com`, password: 'correct-horse-battery-staple', displayName: 'Other' },
    });
    const headers = { Authorization: `Bearer ${(await other.json()).data.accessToken}` };

    expect((await request.get(`/api/v1/editions/${editionId}/bookmarks`, { headers })).status()).toBe(404);
    expect((await request.delete(`/api/v1/bookmarks/${id}`, { headers })).status()).toBe(404);
  });
});

test.describe('preferences (T-068)', () => {
  test('last write wins by client timestamp', async ({ authedRequest }) => {
    const newer = new Date(Date.now() - 60_000).toISOString();
    const older = new Date(Date.now() - 3_600_000).toISOString();

    const first = await authedRequest.put('/api/v1/preferences/reader-settings', {
      data: { value: { theme: 'sepia' }, updatedAt: newer },
    });
    expect((await first.json()).data).toMatchObject({ applied: true, value: { theme: 'sepia' } });

    const stale = await authedRequest.put('/api/v1/preferences/reader-settings', {
      data: { value: { theme: 'dark' }, updatedAt: older },
    });
    expect(stale.status()).toBe(200);
    expect((await stale.json()).data).toMatchObject({ applied: false, value: { theme: 'sepia' } });
  });

  test('a client clock running ahead is capped at server time', async ({ authedRequest }) => {
    const farFuture = new Date(Date.now() + 365 * 86_400_000).toISOString();
    await authedRequest.put('/api/v1/preferences/soundtrack', { data: { value: { volume: 40 }, updatedAt: farFuture } });

    const stored = (await (await authedRequest.get('/api/v1/preferences')).json()).data[0];
    expect(new Date(stored.updatedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('only known keys, and bounded values', async ({ authedRequest }) => {
    const now = new Date().toISOString();
    expect(
      (await authedRequest.put('/api/v1/preferences/anything-else', { data: { value: {}, updatedAt: now } })).status(),
    ).toBe(400);
    expect(
      (
        await authedRequest.put('/api/v1/preferences/reader-settings', {
          data: { value: { blob: 'x'.repeat(5_000) }, updatedAt: now },
        })
      ).status(),
    ).toBe(400);
  });
});

test.describe('download manifest (T-073)', () => {
  test('404 when the edition has no digital copy in the library', async ({ authedRequest }) => {
    const editionId = await createEdition(authedRequest); // a copy, but no uploaded file
    expect((await authedRequest.get(`/api/v1/editions/${editionId}/download`)).status()).toBe(404);
  });
});
