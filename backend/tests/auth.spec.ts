import { randomUUID } from 'crypto';
import type { APIResponse } from '@playwright/test';
import { test, expect } from './fixtures/auth.fixture';

function extractCookie(response: APIResponse, name: string): string {
  const header = response.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie');
  if (!header) {
    throw new Error(`No set-cookie header on response (expected ${name})`);
  }
  const cookie = header.value.split(';')[0];
  if (!cookie?.startsWith(`${name}=`)) {
    throw new Error(`set-cookie header did not contain ${name}: ${header.value}`);
  }
  return cookie;
}

test.describe('POST /auth/register', () => {
  test('rejects a duplicate email with 409 CONFLICT', async ({ request, testUser }) => {
    const response = await request.post('/api/v1/auth/register', {
      data: { email: testUser.email, password: 'another-strong-password', displayName: 'Someone Else' },
    });
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe('CONFLICT');
  });

  test('enforces the minimum password length', async ({ request }) => {
    const response = await request.post('/api/v1/auth/register', {
      data: { email: `short-${randomUUID()}@example.com`, password: 'short', displayName: 'Someone' },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
  });

  test('never returns the password or its hash', async ({ request }) => {
    const email = `plain-${randomUUID()}@example.com`;
    const response = await request.post('/api/v1/auth/register', {
      data: { email, password: 'correct-horse-battery-staple', displayName: 'Plain Text Check' },
    });
    const body = await response.json();
    expect(body.data.user).not.toHaveProperty('password');
    expect(body.data.user).not.toHaveProperty('passwordHash');
    expect(body.data.accessToken).toBeTruthy();
    extractCookie(response, 'refreshToken'); // throws if absent
  });
});

test.describe('POST /auth/login', () => {
  test('rejects a wrong password with 401', async ({ request, testUser }) => {
    const response = await request.post('/api/v1/auth/login', {
      data: { email: testUser.email, password: 'totally-wrong-password' },
    });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
  });

  test('rejects an unknown email with the same error as a wrong password', async ({ request }) => {
    const response = await request.post('/api/v1/auth/login', {
      data: { email: `nobody-${randomUUID()}@example.com`, password: 'whatever-password' },
    });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
  });

  test('issues an access token on success', async ({ request, testUser }) => {
    const response = await request.post('/api/v1/auth/login', {
      data: { email: testUser.email, password: testUser.password },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).data.accessToken).toBeTruthy();
  });
});

test.describe('POST /auth/refresh', () => {
  test('rotates the refresh token and rejects reuse of the old one', async ({ request }) => {
    const email = `rotate-${randomUUID()}@example.com`;
    const registerResponse = await request.post('/api/v1/auth/register', {
      data: { email, password: 'correct-horse-battery-staple', displayName: 'Rotation Check' },
    });
    const firstCookie = extractCookie(registerResponse, 'refreshToken');

    const firstRefresh = await request.post('/api/v1/auth/refresh', {
      headers: { Cookie: firstCookie },
    });
    expect(firstRefresh.status()).toBe(200);
    const secondCookie = extractCookie(firstRefresh, 'refreshToken');
    expect(secondCookie).not.toBe(firstCookie);

    // Replaying the original (now-rotated) refresh token must be rejected.
    const replay = await request.post('/api/v1/auth/refresh', {
      headers: { Cookie: firstCookie },
    });
    expect(replay.status()).toBe(401);
    expect((await replay.json()).error.code).toBe('UNAUTHENTICATED');

    // The rotated (second) token still works.
    const secondRefresh = await request.post('/api/v1/auth/refresh', {
      headers: { Cookie: secondCookie },
    });
    expect(secondRefresh.status()).toBe(200);
  });

  test('rejects a missing refresh token', async ({ request }) => {
    const response = await request.post('/api/v1/auth/refresh');
    expect(response.status()).toBe(401);
  });
});
