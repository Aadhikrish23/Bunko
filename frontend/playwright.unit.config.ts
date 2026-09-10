import { defineConfig } from '@playwright/test';

// "Unit-style" tests: pure TS logic exercised via Playwright Test without
// the `page` fixture, so no browser install is required to run this
// (see docs/TESTING_STRATEGY.md §1 and .github/workflows/ci.yml).
export default defineConfig({
  testDir: 'src',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
});
