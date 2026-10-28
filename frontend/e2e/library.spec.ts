import { test, expect } from '@playwright/test';
import { registerAndLogIn } from './fixtures/auth';

// T-038, SRS E2E-001 (registration through to a working library), moved
// onto Shelves (T-110) — there's no standalone Library page anymore.

test('register -> add a book manually -> appears on Shelves -> filter and status tab', async ({ page }) => {
  await registerAndLogIn(page);

  const title = `The Silent Orchard ${Date.now()}`;

  // A brand-new account has no books yet, so "Add a book" is the welcome
  // panel's own button rather than the page-header one.
  await page.getByRole('button', { name: 'Add a book' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a book' });
  await dialog.getByText('Can’t find your book? Add custom book manually').click();
  await dialog.getByLabel('Book Title').fill(title);
  await dialog.getByRole('button', { name: 'Add book' }).click();

  // Adding opens the book's quick-action modal, not the detail page
  // directly; a manually-added book has no edition yet, so "View book
  // details" is its only navigating action.
  await page.getByRole('button', { name: 'View book details' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Back to shelves' }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();

  // The active shelf's own filter narrows to the match.
  await page.getByPlaceholder('Filter this rack…').fill('Silent Orchard');
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();

  await page.getByPlaceholder('Filter this rack…').fill('Something Completely Unrelated');
  await expect(page.getByText('No books on this shelf match your search.')).toBeVisible();

  // Clear the filter, then the status tab should hide a Want-to-Read book
  // once switched to Currently Reading, and show it again under All books.
  await page.getByPlaceholder('Filter this rack…').fill('');
  await page.getByRole('button', { name: /^Currently Reading,/ }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveCount(0);

  await page.getByRole('button', { name: /^All books,/ }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
});
