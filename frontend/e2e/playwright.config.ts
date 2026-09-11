import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// A dedicated port, distinct from the normal dev server's 5173 — keeps
// e2e runs from colliding with (or worse, silently reusing) whatever
// else might already be listening on the default port on a shared
// machine.
const E2E_PORT = 5183;

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.FRONTEND_BASE_URL ?? `http://localhost:${E2E_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${E2E_PORT} --strictPort`,
    // Playwright's webServer.cwd defaults to this config file's own
    // directory (frontend/e2e/), not the frontend/ project root — Vite
    // would fail to find index.html there.
    cwd: path.resolve(dirname, '..'),
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
