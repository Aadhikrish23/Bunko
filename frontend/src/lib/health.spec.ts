import { test, expect } from '@playwright/test';
import { isHealthy } from './health';

// Smoke test for the unit-style Playwright harness itself (T-001a).
test('isHealthy recognises the ok status', () => {
  expect(isHealthy('ok')).toBe(true);
  expect(isHealthy('down')).toBe(false);
});
