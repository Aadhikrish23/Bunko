import { randomUUID } from 'crypto';
import { test, expect } from './fixtures/auth.fixture';

async function createWorkWithCopy(authedRequest: import('@playwright/test').APIRequestContext, title: string) {
  const work = await authedRequest.post('/api/v1/works', { data: { title } });
  const workId = (await work.json()).data.id;
  const edition = await authedRequest.post('/api/v1/editions', { data: { workId, format: 'EPUB' } });
  const editionId = (await edition.json()).data.id;
  const copy = await authedRequest.post('/api/v1/copies', { data: { editionId } });
  const copyId = (await copy.json()).data.id;
  return { workId, editionId, copyId };
}

test.describe('notes (T-044)', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.get('/api/v1/works/00000000-0000-0000-0000-000000000000/notes');
    expect(response.status()).toBe(401);
  });

  test('returns 404 for a work not in the caller\'s library', async ({ authedRequest }) => {
    const response = await authedRequest.get('/api/v1/works/00000000-0000-0000-0000-000000000000/notes');
    expect(response.status()).toBe(404);
  });

  test('creates a BOOK-scope note with no position/copyId and lists it back', async ({ authedRequest }) => {
    const { workId } = await createWorkWithCopy(authedRequest, `Book Note ${randomUUID()}`);

    const create = await authedRequest.post(`/api/v1/works/${workId}/notes`, {
      data: { scope: 'BOOK', body: 'Overall this book changed how I think about X.' },
    });
    expect(create.status()).toBe(201);
    const created = (await create.json()).data;
    expect(created.scope).toBe('BOOK');
    expect(created.position).toBeNull();
    expect(created.copyId).toBeNull();

    const list = await authedRequest.get(`/api/v1/works/${workId}/notes`);
    const items = (await list.json()).data;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(created.id);
  });

  test('CHAPTER-scope note requires position and copyId', async ({ authedRequest }) => {
    const { workId, copyId } = await createWorkWithCopy(authedRequest, `Chapter Note ${randomUUID()}`);

    const missingBoth = await authedRequest.post(`/api/v1/works/${workId}/notes`, {
      data: { scope: 'CHAPTER', body: 'A chapter note' },
    });
    expect(missingBoth.status()).toBe(400);

    const ok = await authedRequest.post(`/api/v1/works/${workId}/notes`, {
      data: { scope: 'CHAPTER', position: 'ch3', copyId, body: 'A chapter note' },
    });
    expect(ok.status()).toBe(201);
    const created = (await ok.json()).data;
    expect(created.position).toBe('ch3');
    expect(created.copyId).toBe(copyId);
  });

  test('rejects a copyId that belongs to a different work', async ({ authedRequest }, testInfo) => {
    testInfo.setTimeout(60_000); // two full work+edition+copy setups in one test
    const { workId } = await createWorkWithCopy(authedRequest, `Wrong Copy Note ${randomUUID()}`);
    const other = await createWorkWithCopy(authedRequest, `Other Work ${randomUUID()}`);

    const response = await authedRequest.post(`/api/v1/works/${workId}/notes`, {
      data: { scope: 'PAGE', position: '12', copyId: other.copyId, body: 'text' },
    });
    expect(response.status()).toBe(404);
  });

  test('SESSION-scope note needs no position/copyId', async ({ authedRequest }) => {
    const { workId } = await createWorkWithCopy(authedRequest, `Session Note ${randomUUID()}`);
    const response = await authedRequest.post(`/api/v1/works/${workId}/notes`, {
      data: { scope: 'SESSION', body: 'Read for 20 minutes on the train.' },
    });
    expect(response.status()).toBe(201);
  });

  test('updates and deletes a note', async ({ authedRequest }) => {
    const { workId } = await createWorkWithCopy(authedRequest, `Update Note ${randomUUID()}`);
    const create = await authedRequest.post(`/api/v1/works/${workId}/notes`, {
      data: { scope: 'BOOK', body: 'original' },
    });
    const id = (await create.json()).data.id;

    const update = await authedRequest.patch(`/api/v1/notes/${id}`, { data: { body: 'edited' } });
    expect(update.status()).toBe(200);
    expect((await update.json()).data.body).toBe('edited');

    const del = await authedRequest.delete(`/api/v1/notes/${id}`);
    expect(del.status()).toBe(204);

    const list = await authedRequest.get(`/api/v1/works/${workId}/notes`);
    expect((await list.json()).data).toHaveLength(0);
  });

  test('a user cannot read, update, or delete another user\'s note', async ({ authedRequest, request }) => {
    const { workId } = await createWorkWithCopy(authedRequest, `Isolation Note ${randomUUID()}`);
    const create = await authedRequest.post(`/api/v1/works/${workId}/notes`, {
      data: { scope: 'BOOK', body: 'mine' },
    });
    const id = (await create.json()).data.id;

    const otherRegister = await request.post('/api/v1/auth/register', {
      data: {
        email: `note-other-${randomUUID()}@example.com`,
        password: 'correct-horse-battery-staple',
        displayName: 'Other Reader',
      },
    });
    const otherToken = (await otherRegister.json()).data.accessToken;
    const headers = { Authorization: `Bearer ${otherToken}` };

    const update = await request.patch(`/api/v1/notes/${id}`, { data: { body: 'hijack' }, headers });
    expect(update.status()).toBe(404);

    const del = await request.delete(`/api/v1/notes/${id}`, { headers });
    expect(del.status()).toBe(404);

    const otherList = await request.get(`/api/v1/works/${workId}/notes`, { headers });
    expect(otherList.status()).toBe(404); // not in their library
  });
});
