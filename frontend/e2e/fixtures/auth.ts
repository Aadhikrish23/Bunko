import { randomUUID } from 'crypto';
import type { Page } from '@playwright/test';

export interface TestAccount {
  email: string;
  password: string;
  displayName: string;
}

// Drives the real signup form (CODING_STANDARDS.md §7 — browser E2E
// exercises user-visible behaviour, not implementation detail) so each
// spec/test gets a fresh, isolated user (docs/TESTING_STRATEGY.md §4).
export async function registerAndLogIn(page: Page): Promise<TestAccount> {
  const account: TestAccount = {
    email: `e2e-${randomUUID()}@example.com`,
    password: 'correct-horse-battery-staple',
    displayName: 'E2E Reader',
  };

  await page.goto('/register');
  await page.getByLabel('Name').fill(account.displayName);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/library');

  return account;
}
