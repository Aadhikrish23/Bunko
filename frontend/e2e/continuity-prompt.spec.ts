import { test, expect } from '@playwright/test';
import { registerAndLogIn } from './fixtures/auth';
import { defaultChapters, generateSampleEpub } from './fixtures/generate-sample-epub';

// SRS §11.9's worked example, end to end through the UI: read physically
// to "Chapter 10", then open an EPUB whose chapter is titled "Chapter 10:
// The Reckoning" — a title match, confidence ~0.865, which per T-036
// must show the confirmation prompt before navigating (not silently
// jump, and not skip the prompt just because 0.865 clears the default
// 0.6 "is there even a candidate" threshold).

test('physical progress maps to a digital edition via the confirmation prompt', async ({ page }) => {
  await registerAndLogIn(page);

  const title = `Continuity Prompt Test ${Date.now()}`;
  await page.getByRole('button', { name: 'Add a book' }).click();
  const addDialog = page.getByRole('dialog', { name: 'Add a book' });
  await addDialog.getByText('Can’t find it? Add manually').click();
  await addDialog.getByLabel('Title').fill(title);
  await addDialog.getByRole('button', { name: 'Add book' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // Physical reading up to "Chapter 10" — this becomes the journey's
  // canonical position (reading-sessions.service.ts's endSession hook).
  await page.getByRole('button', { name: 'Add edition' }).click();
  await page.getByRole('button', { name: 'Physical copy' }).click();
  await expect(page.getByRole('dialog', { name: 'Add an edition' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start Reading Session' }).click();
  await page.getByRole('button', { name: 'End Session' }).click();
  await page.getByLabel('Ending chapter / page').fill('Chapter 10');
  await page.getByRole('button', { name: 'Save session' }).click();
  await expect(page.getByText(/Session saved/)).toBeVisible();

  // Now add a digital edition whose matching chapter has a fuller title.
  await page.getByRole('button', { name: 'Add edition' }).click();
  await page.getByRole('button', { name: 'EPUB file' }).click();
  await page.getByTestId('digital-file-input').setInputFiles({
    name: 'sample.epub',
    mimeType: 'application/epub+zip',
    buffer: generateSampleEpub(defaultChapters()),
  });
  await expect(page.getByRole('dialog', { name: 'Add an edition' })).toHaveCount(0, { timeout: 30_000 });

  await page.getByRole('button', { name: 'Continue Reading' }).click();

  const prompt = page.getByRole('dialog', { name: 'Continue your reading journey?' });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByText('Chapter 10: The Reckoning')).toBeVisible();

  await prompt.getByRole('button', { name: 'Continue here' }).click();
  await expect(page).toHaveURL(/\/read\//);
});
