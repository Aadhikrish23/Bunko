import { test, expect } from '@playwright/test';
import { registerAndLogIn } from './fixtures/auth';
import { defaultChapters, generateSampleEpub } from './fixtures/generate-sample-epub';

// SRS §33.2 E2E-003: Import EPUB -> validate -> open -> read -> close ->
// reopen -> verify position. T-028/T-029/T-030/T-031.

test('import an EPUB, open it, close it, and reopen it', async ({ page }) => {
  await registerAndLogIn(page);

  const title = `Digital Reading Test ${Date.now()}`;
  await page.getByRole('button', { name: 'Add a book' }).click();
  const addDialog = page.getByRole('dialog', { name: 'Add a book' });
  await addDialog.getByText('Can’t find your book? Add custom book manually').click();
  await addDialog.getByLabel('Book Title').fill(title);
  await addDialog.getByRole('button', { name: 'Add book' }).click();
  // Adding opens the book's quick-action modal, not the detail page
  // directly; a manually-added book has no edition yet, so "View book
  // details" is its only navigating action.
  await page.getByRole('button', { name: 'View book details' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // Import a digital edition.
  await page.getByRole('button', { name: 'Add edition' }).click();
  await page.getByRole('button', { name: 'EPUB file' }).click();
  await page.getByTestId('digital-file-input').setInputFiles({
    name: 'sample.epub',
    mimeType: 'application/epub+zip',
    buffer: generateSampleEpub(defaultChapters()),
  });

  // Upload + import completes and the dialog closes on its own.
  await expect(page.getByRole('dialog', { name: 'Add an edition' })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText('EPUB', { exact: true })).toBeVisible();

  // Open the reader.
  await page.getByRole('button', { name: /^(Start|Continue) reading$/ }).click();
  await expect(page).toHaveURL(/\/read(-chapters)?\//);
  await expect(page.getByRole('button', { name: 'Close the book' })).toBeVisible();

  // Close — a session this short (opened and closed within seconds) is
  // discarded without a journal entry, so no reflection prompt appears;
  // it navigates straight back to the book (SRS §12.10's <60s rule).
  await page.getByRole('button', { name: 'Close the book' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // Reopening resumes rather than erroring — the reader manifest
  // resolves a same-edition start position from the session just ended.
  await page.getByRole('button', { name: /^(Start|Continue) reading$/ }).click();
  await expect(page).toHaveURL(/\/read(-chapters)?\//);
  await expect(page.getByRole('button', { name: 'Close the book' })).toBeVisible();
});
