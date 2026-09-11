import { test, expect } from '@playwright/test';
import { registerAndLogIn } from './fixtures/auth';

// T-038, SRS E2E-001 (registration through to a working library).

test('register -> add a book manually -> appears in library -> search and filter', async ({ page }) => {
  await registerAndLogIn(page);

  const title = `The Silent Orchard ${Date.now()}`;

  await page.getByRole('button', { name: 'Add a book' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a book' });
  await dialog.getByText('Can’t find it? Add manually').click();
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Add book' }).click();

  // Adding navigates straight to the new book's detail page.
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();

  // Search narrows to the match.
  await page.getByPlaceholder('Search title or author…').fill('Silent Orchard');
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();

  await page.getByPlaceholder('Search title or author…').fill('Something Completely Unrelated');
  await expect(page.getByText('No books match')).toBeVisible();

  // Clear search, then the status filter should hide a Want-to-Read book
  // once switched to Reading, and show it again under All Books.
  await page.getByPlaceholder('Search title or author…').fill('');
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveCount(0);

  await page.getByRole('button', { name: 'All Books' }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
});
