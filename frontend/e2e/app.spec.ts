import { test, expect } from '@playwright/test';

// Smoke test for the browser E2E harness itself (T-001a).
test('renders the app shell @smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bunko' })).toBeVisible();
});
