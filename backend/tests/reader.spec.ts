import { test, expect } from './fixtures/auth.fixture';

test.describe('GET /editions/:editionId/reader-manifest (T-027)', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.get('/api/v1/editions/00000000-0000-0000-0000-000000000000/reader-manifest');
    expect(response.status()).toBe(401);
  });

  test('returns 404 when there is no digital copy of this edition in the library', async ({ authedRequest }) => {
    const work = await authedRequest.post('/api/v1/works', { data: { title: 'No Copy Yet' } });
    const workId = (await work.json()).data.id;
    const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format: 'EPUB' } });
    const editionId = (await edition.json()).data.id;

    const response = await authedRequest.get(`/api/v1/editions/${editionId}/reader-manifest`);
    expect(response.status()).toBe(404);
  });

  test('rejects a physical edition (no reader manifest applies)', async ({ authedRequest }) => {
    const work = await authedRequest.post('/api/v1/works', { data: { title: 'Physical Only' } });
    const workId = (await work.json()).data.id;
    const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format: 'PHYSICAL' } });
    const editionId = (await edition.json()).data.id;
    await authedRequest.post('/api/v1/copies', { data: { editionId } });

    const response = await authedRequest.get(`/api/v1/editions/${editionId}/reader-manifest`);
    // No digitalFile on a physical copy -> same 404 as "no digital copy".
    expect(response.status()).toBe(404);
  });

  // The full happy-path (real EPUB/PDF uploaded to MinIO, indexed, and
  // resolved to a startPosition) needs a reachable S3-compatible
  // endpoint — see the note in the Phase 4 commit message.
});
