import { test, expect } from '@playwright/test';

// Smoke test for the Playwright harness itself (T-001a) — proves the API
// test fixture can boot the server and hit a real route.
test('GET /health returns ok', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.data).toEqual({ status: 'ok' });
  expect(body.meta.requestId).toBeTruthy();
});

test('unmatched route returns the standard NOT_FOUND envelope', async ({ request }) => {
  const response = await request.get('/no-such-route');
  expect(response.status()).toBe(404);
  const body = await response.json();
  expect(body.error.code).toBe('NOT_FOUND');
  expect(body.meta.requestId).toBeTruthy();
});
