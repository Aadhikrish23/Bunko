import { randomUUID } from 'crypto';
import { test, expect } from './fixtures/auth.fixture';

test.describe('GET /metadata/search (T-013a)', () => {
  test('requires the q parameter', async ({ authedRequest }) => {
    const response = await authedRequest.get('/api/v1/metadata/search');
    expect(response.status()).toBe(400);
  });

  test('returns a provider-agnostic candidate list for a known title', async ({ authedRequest }) => {
    const response = await authedRequest.get('/api/v1/metadata/search?q=the+hobbit');
    // Never a 500 even under upstream flakiness (T-013a) — degrades to [].
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('externalSource', 'open-library');
      expect(body.data[0]).toHaveProperty('externalId');
      expect(body.data[0]).toHaveProperty('title');
    }
  });
});

test.describe('POST /works', () => {
  test('adding the same external work twice is idempotent', async ({ authedRequest }) => {
    const body = {
      title: 'Six of Crows',
      authors: ['Leigh Bardugo'],
      externalSource: 'open-library',
      externalId: `OL-test-${randomUUID()}`,
    };

    const first = await authedRequest.post('/api/v1/works', { data: body });
    expect(first.status()).toBe(201);
    const firstId = (await first.json()).data.id;

    const second = await authedRequest.post('/api/v1/works', { data: body });
    expect(second.status()).toBe(200); // already in library — reused, not duplicated
    expect((await second.json()).data.id).toBe(firstId);
  });

  test('a manually-entered book needs no external id', async ({ authedRequest }) => {
    const response = await authedRequest.post('/api/v1/works', {
      data: { title: 'A Manually Entered Book', authors: ['Some Author'] },
    });
    expect(response.status()).toBe(201);
    expect((await response.json()).data.authors).toContain('Some Author');
  });
});

test.describe('GET /works/:workId', () => {
  test("returns 404 for a work in another user's library", async ({ authedRequest, request }) => {
    const otherRegister = await request.post('/api/v1/auth/register', {
      data: {
        email: `other-${randomUUID()}@example.com`,
        password: 'correct-horse-battery-staple',
        displayName: 'Other Reader',
      },
    });
    const otherToken = (await otherRegister.json()).data.accessToken;

    const otherWork = await request.post('/api/v1/works', {
      data: { title: "Someone Else's Book" },
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    const otherWorkId = (await otherWork.json()).data.id;

    const response = await authedRequest.get(`/api/v1/works/${otherWorkId}`);
    expect(response.status()).toBe(404);
  });
});

test.describe('search and filter (T-017)', () => {
  test('q matches title case-insensitively', async ({ authedRequest }) => {
    await authedRequest.post('/api/v1/works', { data: { title: 'The Fellowship of the Ring' } });
    const response = await authedRequest.get('/api/v1/works?q=fellowship');
    const body = await response.json();
    expect(body.data.some((w: { title: string }) => w.title === 'The Fellowship of the Ring')).toBe(true);
  });

  test('status filter narrows results', async ({ authedRequest }) => {
    const created = await authedRequest.post('/api/v1/works', { data: { title: 'Status Filter Book' } });
    const workId = (await created.json()).data.id;
    await authedRequest.patch(`/api/v1/works/${workId}`, { data: { status: 'READING' } });

    const response = await authedRequest.get('/api/v1/works?status=READING');
    const body = await response.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((w: { status: string }) => w.status === 'READING')).toBe(true);
  });
});

test.describe('shelves (T-016)', () => {
  test('shelf name is unique per user', async ({ authedRequest }) => {
    const name = `My Shelf ${randomUUID()}`;
    const first = await authedRequest.post('/api/v1/shelves', { data: { name } });
    expect(first.status()).toBe(201);

    const second = await authedRequest.post('/api/v1/shelves', { data: { name } });
    expect(second.status()).toBe(409);
  });

  test('assigning/removing a work from one shelf does not affect another', async ({ authedRequest }) => {
    const work = await authedRequest.post('/api/v1/works', { data: { title: 'Shelved Book' } });
    const workId = (await work.json()).data.id;

    const shelfA = await authedRequest.post('/api/v1/shelves', { data: { name: `Shelf A ${randomUUID()}` } });
    const shelfB = await authedRequest.post('/api/v1/shelves', { data: { name: `Shelf B ${randomUUID()}` } });
    const shelfAId = (await shelfA.json()).data.id;
    const shelfBId = (await shelfB.json()).data.id;

    await authedRequest.post(`/api/v1/shelves/${shelfAId}/works`, { data: { workId } });
    await authedRequest.post(`/api/v1/shelves/${shelfBId}/works`, { data: { workId } });

    await authedRequest.delete(`/api/v1/shelves/${shelfAId}/works/${workId}`);

    const stillOnB = await authedRequest.get(`/api/v1/works?shelfId=${shelfBId}`);
    const body = await stillOnB.json();
    expect(body.data.some((w: { id: string }) => w.id === workId)).toBe(true);

    const removedFromA = await authedRequest.get(`/api/v1/works?shelfId=${shelfAId}`);
    const removedBody = await removedFromA.json();
    expect(removedBody.data.some((w: { id: string }) => w.id === workId)).toBe(false);
  });
});

test.describe('editions and copies (T-014, T-015)', () => {
  test('an edition can only be added to a work already in the library', async ({ authedRequest, request }) => {
    const otherRegister = await request.post('/api/v1/auth/register', {
      data: {
        email: `edition-other-${randomUUID()}@example.com`,
        password: 'correct-horse-battery-staple',
        displayName: 'Other Reader',
      },
    });
    const otherToken = (await otherRegister.json()).data.accessToken;
    const otherWork = await request.post('/api/v1/works', {
      data: { title: 'Not Yours' },
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    const otherWorkId = (await otherWork.json()).data.id;

    const response = await authedRequest.post('/api/v1/editions', {
      data: { workId: otherWorkId, format: 'EPUB' },
    });
    expect(response.status()).toBe(404);
  });

  test('creates an edition and a copy for it', async ({ authedRequest }) => {
    const work = await authedRequest.post('/api/v1/works', { data: { title: 'Edition Test Book' } });
    const workId = (await work.json()).data.id;

    const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format: 'PHYSICAL' } });
    expect(edition.status()).toBe(201);
    const editionId = (await edition.json()).data.id;

    const copy = await authedRequest.post('/api/v1/copies', { data: { editionId } });
    expect(copy.status()).toBe(201);
    expect((await copy.json()).data.editionId).toBe(editionId);
  });

  // The "digitalFileId already attached to another copy" conflict (T-015)
  // needs a real DigitalFile row, which only exists once the files module
  // (T-024, Phase 4) is built — covered there rather than with a synthetic
  // uuid here.
});
