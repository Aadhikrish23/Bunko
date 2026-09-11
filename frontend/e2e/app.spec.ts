import { test, expect } from '@playwright/test';

// Smoke test for the browser E2E harness itself (T-001a). Goes straight
// to /login rather than "/" — "/" now redirects through RequireAuth,
// which needs a live backend to resolve; this check is meant to prove
// only that the frontend app itself renders, no backend required.
test('renders the app shell @smoke', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Bunko' })).toBeVisible();
});
