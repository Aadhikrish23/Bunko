import { test, expect } from './fixtures/auth.fixture';

test.describe('GET /users/me', () => {
  test('requires authentication', async ({ request }) => {
    const response = await request.get('/api/v1/users/me');
    expect(response.status()).toBe(401);
  });

  test("returns the authenticated user's own profile", async ({ authedRequest, testUser }) => {
    const response = await authedRequest.get('/api/v1/users/me');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe(testUser.userId);
    expect(body.data.email).toBe(testUser.email);
    expect(body.data.displayName).toBe(testUser.displayName);
  });
});

test.describe('PATCH /users/me', () => {
  test('updates the display name', async ({ authedRequest }) => {
    const response = await authedRequest.patch('/api/v1/users/me', {
      data: { displayName: 'Updated Name' },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).data.displayName).toBe('Updated Name');
  });

  test('rejects unknown fields', async ({ authedRequest }) => {
    const response = await authedRequest.patch('/api/v1/users/me', {
      data: { email: 'sneaky-change@example.com' },
    });
    expect(response.status()).toBe(400);
  });
});
