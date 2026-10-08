import { randomUUID } from 'crypto';
import { test, expect } from './fixtures/auth.fixture';

async function createWorkWithCopy(authedRequest: import('@playwright/test').APIRequestContext, title: string) {
  const work = await authedRequest.post('/api/v1/works', { data: { title } });
  const workId = (await work.json()).data.id;
  const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format: 'EPUB' } });
  const editionId = (await edition.json()).data.id;
  await authedRequest.post('/api/v1/copies', { data: { editionId } });
  return { workId, editionId };
}

test.describe('annotation & note search (T-045)', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.get('/api/v1/annotations/search?q=anything');
    expect(response.status()).toBe(401);
  });

  test('requires a non-empty q', async ({ authedRequest }) => {
    const response = await authedRequest.get('/api/v1/annotations/search?q=');
    expect(response.status()).toBe(400);
  });

  test('finds a matching highlight by its text', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { editionId, workId } = await createWorkWithCopy(authedRequest, `Search Highlight ${randomUUID()}`);
    const marker = `zyxwvutsrq-${randomUUID().slice(0, 8)}`;
    await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'HIGHLIGHT', position: 'ch1', text: `The word ${marker} appears here`, color: 'yellow' },
    });

    const response = await authedRequest.get(`/api/v1/annotations/search?q=${marker}`);
    expect(response.status()).toBe(200);
    const results = (await response.json()).data;
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('ANNOTATION');
    expect(results[0].workId).toBe(workId);
    expect(results[0].excerpt).toContain(marker);
  });

  test('finds a matching standalone note by its body', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { workId } = await createWorkWithCopy(authedRequest, `Search Note ${randomUUID()}`);
    const marker = `plonktastic-${randomUUID().slice(0, 8)}`;
    await authedRequest.post(`/api/v1/works/${workId}/notes`, {
      data: { scope: 'BOOK', body: `This book made me think about ${marker} a lot` },
    });

    const response = await authedRequest.get(`/api/v1/annotations/search?q=${marker}`);
    const results = (await response.json()).data;
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('NOTE');
    expect(results[0].workId).toBe(workId);
  });

  test('matches a margin note on a highlight, not just the highlighted text', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(60_000);
    const { editionId } = await createWorkWithCopy(authedRequest, `Search Margin Note ${randomUUID()}`);
    const marker = `frobnicate-${randomUUID().slice(0, 8)}`;
    await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'HIGHLIGHT', position: 'ch1', text: 'unrelated highlighted text', note: `reminds me of ${marker}` },
    });

    const response = await authedRequest.get(`/api/v1/annotations/search?q=${marker}`);
    expect((await response.json()).data).toHaveLength(1);
  });

  test('never returns another user\'s annotations or notes', async ({ authedRequest, request }, testInfo) => {
    testInfo.setTimeout(60_000);
    const marker = `sharedword-${randomUUID().slice(0, 8)}`;
    const { editionId } = await createWorkWithCopy(authedRequest, `Isolation Search ${randomUUID()}`);
    await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'HIGHLIGHT', position: 'ch1', text: `mine has ${marker} in it` },
    });

    const otherRegister = await request.post('/api/v1/auth/register', {
      data: {
        email: `search-other-${randomUUID()}@example.com`,
        password: 'correct-horse-battery-staple',
        displayName: 'Other Reader',
      },
    });
    const otherToken = (await otherRegister.json()).data.accessToken;

    const response = await request.get(`/api/v1/annotations/search?q=${marker}`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    expect((await response.json()).data).toEqual([]);
  });

  test('a query with no matches returns an empty array, not an error', async ({ authedRequest }) => {
    const response = await authedRequest.get(`/api/v1/annotations/search?q=${randomUUID()}`);
    expect(response.status()).toBe(200);
    expect((await response.json()).data).toEqual([]);
  });
});
