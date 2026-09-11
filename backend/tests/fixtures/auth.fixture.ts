import { randomUUID } from 'crypto';
import { test as base, type APIRequestContext } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  displayName: string;
  userId: string;
  accessToken: string;
}

interface AuthFixtures {
  // A freshly registered, isolated user for this test (docs/TESTING_STRATEGY.md
  // §4 — each spec file/test gets its own user, never shared/execution-order-dependent).
  testUser: TestUser;
  // The shared `request` context, pre-authenticated with testUser's access token.
  authedRequest: APIRequestContext;
}

export const test = base.extend<AuthFixtures>({
  testUser: async ({ request }, use) => {
    const email = `test-${randomUUID()}@example.com`;
    const password = 'correct-horse-battery-staple';
    const displayName = 'Test Reader';

    const response = await request.post('/api/v1/auth/register', {
      data: { email, password, displayName },
    });
    const body = await response.json();

    await use({
      email,
      password,
      displayName,
      userId: body.data.user.id,
      accessToken: body.data.accessToken,
    });
  },

  authedRequest: async ({ playwright, testUser }, use) => {
    const context = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL ?? 'http://localhost:3000',
      extraHTTPHeaders: { Authorization: `Bearer ${testUser.accessToken}` },
    });
    await use(context);
    await context.dispose();
  },
});

export { expect } from '@playwright/test';
