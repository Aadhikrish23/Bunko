import { test, expect } from '@playwright/test';
import { registerAndLogIn } from './fixtures/auth';

// SRS §33.2 E2E-002: Add book -> mark physical -> start session ->
// update chapter -> end session -> verify journal. T-039/T-041.

test('start and end a physical reading session, then see it in the journal', async ({ page }) => {
  await registerAndLogIn(page);

  const title = `Physical Session Test ${Date.now()}`;
  await page.getByRole('button', { name: 'Add a book' }).click();
  const addDialog = page.getByRole('dialog', { name: 'Add a book' });
  await addDialog.getByText('Can’t find it? Add manually').click();
  await addDialog.getByLabel('Title').fill(title);
  await addDialog.getByRole('button', { name: 'Add book' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Add edition' }).click();
  await page.getByRole('button', { name: 'Physical copy' }).click();
  await expect(page.getByRole('dialog', { name: 'Add an edition' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Start Reading Session' }).click();
  await page.getByRole('button', { name: 'End Session' }).click();
  await page.getByLabel('Ending chapter / page').fill('Chapter 10');
  await page.getByLabel('Reflection (optional)').fill('Political tension is increasing.');
  await page.getByRole('button', { name: 'Save session' }).click();

  await expect(page.getByText(/Session saved/)).toBeVisible();

  await page.getByRole('link', { name: 'Journal' }).click();
  await expect(page).toHaveURL(/\/journal/);
  await expect(page.getByText('No sessions yet')).toHaveCount(0);
  await expect(page.getByText('Political tension is increasing.')).toBeVisible();
});
