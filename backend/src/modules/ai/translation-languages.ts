// Target languages for chapter translation (SRS §20.5, T-087). A fixed list
// so the API never forwards free text as the language; the source language
// is detected by the model. `rtl` tells the reader to lay the text out
// right-to-left.
export interface TranslationLanguage {
  code: string;
  name: string;
  rtl?: boolean;
}

export const TRANSLATION_LANGUAGES: readonly TranslationLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'pl', name: 'Polish' },
  { code: 'ru', name: 'Russian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ar', name: 'Arabic', rtl: true },
  { code: 'he', name: 'Hebrew', rtl: true },
  { code: 'ur', name: 'Urdu', rtl: true },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'mr', name: 'Marathi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'id', name: 'Indonesian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)' },
];

export const TRANSLATION_LANGUAGE_CODES = TRANSLATION_LANGUAGES.map((language) => language.code) as [
  string,
  ...string[],
];

export function languageName(code: string): string {
  const language = TRANSLATION_LANGUAGES.find((candidate) => candidate.code === code);
  if (!language) throw new Error(`Unknown translation language: ${code}`);
  return language.name;
}
