import { defineConfig } from '@playwright/test';

// Point the suite at an API on another port with API_BASE_URL (e.g. when 3000
// is taken); the health check follows it.
const baseURL = process.env.API_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
  },
  webServer: {
    command: 'npm run dev',
    // The assistant's API tests run against the deterministic mock model (T-103).
    env: { AI_PROVIDER: 'mock' },
    url: `${baseURL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
