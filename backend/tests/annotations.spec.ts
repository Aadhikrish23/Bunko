import { randomUUID } from 'crypto';
import { test, expect } from './fixtures/auth.fixture';

// Annotations only need a Copy row to exist (any format) — the digital
// file itself is irrelevant to ownership resolution, so these tests use
// a plain copy with no digitalFileId, same shortcut reader.spec.ts and
// library.spec.ts use for the same reason.
async function createEditionWithCopy(authedRequest: import('@playwright/test').APIRequestContext, title: string) {
  const work = await authedRequest.post('/api/v1/works', { data: { title } });
  const workId = (await work.json()).data.id;
  const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format: 'EPUB' } });
  const editionId = (await edition.json()).data.id;
  await authedRequest.post('/api/v1/copies', { data: { editionId } });
  return { workId, editionId };
}

test.describe('annotations (T-043)', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.get('/api/v1/editions/00000000-0000-0000-0000-000000000000/annotations');
    expect(response.status()).toBe(401);
  });

  test('returns 404 creating an annotation with no digital copy of the edition', async ({ authedRequest }) => {
    const work = await authedRequest.post('/api/v1/works', { data: { title: `No Copy ${randomUUID()}` } });
    const workId = (await work.json()).data.id;
    const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format: 'EPUB' } });
    const editionId = (await edition.json()).data.id;

    const response = await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'HIGHLIGHT', position: 'ch1', text: 'some text' },
    });
    expect(response.status()).toBe(404);
  });

  test('creates a highlight and lists it back', async ({ authedRequest }) => {
    const { editionId } = await createEditionWithCopy(authedRequest, `Highlight Book ${randomUUID()}`);

    const create = await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'HIGHLIGHT', position: 'ch1', text: 'What do you mean', color: 'yellow' },
    });
    expect(create.status()).toBe(201);
    const created = (await create.json()).data;
    expect(created.kind).toBe('HIGHLIGHT');
    expect(created.text).toBe('What do you mean');
    expect(created.color).toBe('yellow');
    expect(created.tags).toEqual([]);

    const list = await authedRequest.get(`/api/v1/editions/${editionId}/annotations`);
    const items = (await list.json()).data;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(created.id);
  });

  test('creates a quote with tags', async ({ authedRequest }) => {
    const { editionId } = await createEditionWithCopy(authedRequest, `Quote Book ${randomUUID()}`);

    const create = await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'QUOTE', position: 'ch2', text: 'A quote worth keeping', tags: ['favorite', 'wisdom'] },
    });
    expect(create.status()).toBe(201);
    const created = (await create.json()).data;
    expect(created.kind).toBe('QUOTE');
    expect(created.tags).toEqual(['favorite', 'wisdom']);
  });

  test('rejects a sessionId that does not belong to the caller', async ({ authedRequest }) => {
    const { editionId } = await createEditionWithCopy(authedRequest, `Session Book ${randomUUID()}`);

    const response = await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'HIGHLIGHT', position: 'ch1', text: 'text', sessionId: randomUUID() },
    });
    expect(response.status()).toBe(404);
  });

  test('updates note, color, and tags', async ({ authedRequest }) => {
    const { editionId } = await createEditionWithCopy(authedRequest, `Update Book ${randomUUID()}`);
    const create = await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'HIGHLIGHT', position: 'ch1', text: 'text', color: 'yellow' },
    });
    const id = (await create.json()).data.id;

    const update = await authedRequest.patch(`/api/v1/annotations/${id}`, {
      data: { note: 'a margin note', color: 'green', tags: ['reread'] },
    });
    expect(update.status()).toBe(200);
    const updated = (await update.json()).data;
    expect(updated.note).toBe('a margin note');
    expect(updated.color).toBe('green');
    expect(updated.tags).toEqual(['reread']);
  });

  test('deletes an annotation', async ({ authedRequest }) => {
    const { editionId } = await createEditionWithCopy(authedRequest, `Delete Book ${randomUUID()}`);
    const create = await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'HIGHLIGHT', position: 'ch1', text: 'text' },
    });
    const id = (await create.json()).data.id;

    const del = await authedRequest.delete(`/api/v1/annotations/${id}`);
    expect(del.status()).toBe(204);

    const list = await authedRequest.get(`/api/v1/editions/${editionId}/annotations`);
    expect((await list.json()).data).toHaveLength(0);
  });

  test('a user cannot read, update, or delete another user\'s annotation', async ({ authedRequest, request }) => {
    const { editionId } = await createEditionWithCopy(authedRequest, `Isolation Book ${randomUUID()}`);
    const create = await authedRequest.post(`/api/v1/editions/${editionId}/annotations`, {
      data: { kind: 'HIGHLIGHT', position: 'ch1', text: 'mine' },
    });
    const id = (await create.json()).data.id;

    const otherRegister = await request.post('/api/v1/auth/register', {
      data: {
        email: `annotation-other-${randomUUID()}@example.com`,
        password: 'correct-horse-battery-staple',
        displayName: 'Other Reader',
      },
    });
    const otherToken = (await otherRegister.json()).data.accessToken;
    const headers = { Authorization: `Bearer ${otherToken}` };

    const update = await request.patch(`/api/v1/annotations/${id}`, { data: { note: 'hijack' }, headers });
    expect(update.status()).toBe(404);

    const del = await request.delete(`/api/v1/annotations/${id}`, { headers });
    expect(del.status()).toBe(404);

    // The other user's own empty list, not an error and not our data.
    const otherEdition = await request.get(`/api/v1/editions/${editionId}/annotations`, { headers });
    expect(otherEdition.status()).toBe(404); // they have no copy of this edition at all
  });
});
