// A short badge for a book's language: the ISO 639-1 code ("JA", "TA", "EN"), never the first
// letters of the name. Truncating names produces "JAP" for Japanese, which is a slur.

const CODES: Record<string, string> = {
  arabic: 'AR', bengali: 'BN', chinese: 'ZH', czech: 'CS', danish: 'DA', dutch: 'NL', english: 'EN',
  finnish: 'FI', french: 'FR', german: 'DE', greek: 'EL', gujarati: 'GU', hebrew: 'HE', hindi: 'HI',
  hungarian: 'HU', indonesian: 'ID', italian: 'IT', japanese: 'JA', kannada: 'KN', korean: 'KO',
  latin: 'LA', malay: 'MS', malayalam: 'ML', marathi: 'MR', norwegian: 'NO', persian: 'FA', polish: 'PL',
  portuguese: 'PT', punjabi: 'PA', romanian: 'RO', russian: 'RU', sanskrit: 'SA', spanish: 'ES',
  swedish: 'SV', tamil: 'TA', telugu: 'TE', thai: 'TH', turkish: 'TR', ukrainian: 'UK', urdu: 'UR',
  vietnamese: 'VI',
};

/** "Japanese" -> "JA", "ja" -> "JA", "pt-BR" -> "PT"; null when it can't be said safely. */
export function languageCode(language: string | null | undefined): string | null {
  const value = language?.trim();
  if (!value) return null;
  if (/^[a-z]{2}(-[a-z0-9]+)*$/i.test(value)) return value.slice(0, 2).toUpperCase();
  return CODES[value.toLowerCase()] ?? null;
}
