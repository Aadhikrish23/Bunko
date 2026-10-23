import { test, expect } from '@playwright/test';
import { languageCode } from './language-code';

test('language badges use ISO codes, never truncated names (R3-02)', () => {
  expect(languageCode('Japanese')).toBe('JA');
  expect(languageCode('Indonesian')).toBe('ID');
  expect(languageCode('Tamil')).toBe('TA');
  expect(languageCode('ja')).toBe('JA');
  expect(languageCode('pt-BR')).toBe('PT');
  // Unknown names get no badge rather than a guess.
  expect(languageCode('Klingon')).toBeNull();
  expect(languageCode(null)).toBeNull();
});
