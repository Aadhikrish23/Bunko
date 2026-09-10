import { test, expect } from '@playwright/test';

// Smoke test for the Playwright harness itself (T-001a) — proves the API
// test fixture can boot the server and hit a real route.
test('GET /health returns ok', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ data: { status: 'ok' } });
});
