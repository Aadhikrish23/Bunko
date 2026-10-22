import { randomUUID } from 'crypto';
import { test, expect } from './fixtures/auth.fixture';

async function createWork(authedRequest: import('@playwright/test').APIRequestContext, title: string) {
  const work = await authedRequest.post('/api/v1/works', { data: { title } });
  return (await work.json()).data.id as string;
}

test.describe('reviews (T-051)', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.get('/api/v1/works/00000000-0000-0000-0000-000000000000/review');
    expect(response.status()).toBe(401);
  });

  test('GET returns 404 when the caller has no review yet', async ({ authedRequest }) => {
    const workId = await createWork(authedRequest, `No Review ${randomUUID()}`);
    const response = await authedRequest.get(`/api/v1/works/${workId}/review`);
    expect(response.status()).toBe(404);
  });

  test('PUT returns 404 for a work not in the caller\'s library', async ({ authedRequest }) => {
    const response = await authedRequest.put('/api/v1/works/00000000-0000-0000-0000-000000000000/review', {
      data: { rating: 5 },
    });
    expect(response.status()).toBe(404);
  });

  test('PUT creates a review and GET returns it', async ({ authedRequest }) => {
    const workId = await createWork(authedRequest, `Create Review ${randomUUID()}`);

    const put = await authedRequest.put(`/api/v1/works/${workId}/review`, {
      data: { rating: 4, body: 'Really enjoyed this.', isFavourite: true },
    });
    expect(put.status()).toBe(200);
    const created = (await put.json()).data;
    expect(created.rating).toBe(4);
    expect(created.body).toBe('Really enjoyed this.');
    expect(created.isFavourite).toBe(true);
    expect(created.rereadIntention).toBe(false);

    const get = await authedRequest.get(`/api/v1/works/${workId}/review`);
    expect(get.status()).toBe(200);
    expect((await get.json()).data.id).toBe(created.id);
  });

  test('rating must be between 1 and 5', async ({ authedRequest }) => {
    const workId = await createWork(authedRequest, `Bad Rating ${randomUUID()}`);
    const tooHigh = await authedRequest.put(`/api/v1/works/${workId}/review`, { data: { rating: 6 } });
    expect(tooHigh.status()).toBe(400);
    const tooLow = await authedRequest.put(`/api/v1/works/${workId}/review`, { data: { rating: 0 } });
    expect(tooLow.status()).toBe(400);
  });

  test('rating is optional — a book can be marked favourite without a score (SRS §14)', async ({
    authedRequest,
  }) => {
    const workId = await createWork(authedRequest, `Favourite Only ${randomUUID()}`);
    const response = await authedRequest.put(`/api/v1/works/${workId}/review`, { data: { isFavourite: true } });
    expect(response.status()).toBe(200);
    const review = (await response.json()).data;
    expect(review.rating).toBeNull();
    expect(review.isFavourite).toBe(true);
  });

  test('stores structured metadata (e.g. favourite character)', async ({ authedRequest }) => {
    const workId = await createWork(authedRequest, `Metadata Review ${randomUUID()}`);
    const response = await authedRequest.put(`/api/v1/works/${workId}/review`, {
      data: { rating: 5, metadata: { favouriteCharacter: 'Vin' } },
    });
    expect((await response.json()).data.metadata).toEqual({ favouriteCharacter: 'Vin' });
  });

  test('PUT again replaces the existing review rather than creating a second one', async ({ authedRequest }) => {
    const workId = await createWork(authedRequest, `Replace Review ${randomUUID()}`);
    const first = await authedRequest.put(`/api/v1/works/${workId}/review`, { data: { rating: 3, body: 'meh' } });
    const firstId = (await first.json()).data.id;

    const second = await authedRequest.put(`/api/v1/works/${workId}/review`, {
      data: { rating: 5, body: 'actually great on reread' },
    });
    expect(second.status()).toBe(200);
    const secondBody = (await second.json()).data;
    expect(secondBody.id).toBe(firstId);
    expect(secondBody.rating).toBe(5);
    expect(secondBody.body).toBe('actually great on reread');
  });

  test('PATCH partially updates an existing review', async ({ authedRequest }) => {
    const workId = await createWork(authedRequest, `Patch Review ${randomUUID()}`);
    await authedRequest.put(`/api/v1/works/${workId}/review`, { data: { rating: 3 } });

    const patch = await authedRequest.patch(`/api/v1/works/${workId}/review`, { data: { rereadIntention: true } });
    expect(patch.status()).toBe(200);
    const patched = (await patch.json()).data;
    expect(patched.rereadIntention).toBe(true);
    expect(patched.rating).toBe(3); // untouched field preserved
  });

  test('PATCH on a nonexistent review returns 404', async ({ authedRequest }) => {
    const workId = await createWork(authedRequest, `Patch Missing ${randomUUID()}`);
    const response = await authedRequest.patch(`/api/v1/works/${workId}/review`, { data: { rating: 2 } });
    expect(response.status()).toBe(404);
  });

  test('DELETE removes the review', async ({ authedRequest }) => {
    const workId = await createWork(authedRequest, `Delete Review ${randomUUID()}`);
    await authedRequest.put(`/api/v1/works/${workId}/review`, { data: { rating: 1 } });

    const del = await authedRequest.delete(`/api/v1/works/${workId}/review`);
    expect(del.status()).toBe(204);

    const get = await authedRequest.get(`/api/v1/works/${workId}/review`);
    expect(get.status()).toBe(404);
  });

  test("a user cannot read, update, or delete another user's review", async ({ authedRequest, request }) => {
    const workId = await createWork(authedRequest, `Isolation Review ${randomUUID()}`);
    await authedRequest.put(`/api/v1/works/${workId}/review`, { data: { rating: 5, body: 'mine' } });

    const otherRegister = await request.post('/api/v1/auth/register', {
      data: {
        email: `review-other-${randomUUID()}@example.com`,
        password: 'correct-horse-battery-staple',
        displayName: 'Other Reader',
      },
    });
    const otherToken = (await otherRegister.json()).data.accessToken;
    const headers = { Authorization: `Bearer ${otherToken}` };

    const get = await request.get(`/api/v1/works/${workId}/review`, { headers });
    expect(get.status()).toBe(404); // work not in their library (and no review even if it were)

    const patch = await request.patch(`/api/v1/works/${workId}/review`, { data: { rating: 1 }, headers });
    expect(patch.status()).toBe(404);

    const del = await request.delete(`/api/v1/works/${workId}/review`, { headers });
    expect(del.status()).toBe(404);
  });
});
