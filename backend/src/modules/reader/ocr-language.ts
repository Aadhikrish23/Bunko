// Work/Edition.language stores a human-readable display name ("Tamil",
// "English" — see metadata.service.ts's normalizeLanguageName), not an
// ISO code, since that's what search results and manual entry both give
// us. Tesseract's own trained-data files are named by ISO 639-2/T code
// ("tam", "eng"), so OCR needs this translation step regardless of where
// the display name came from.
//
// Scoped to languages Tesseract actually ships trained data for and that
// are plausible for a personal reading library — not exhaustive, but
// covers the major scripts most likely to hit the legacy-font/scanned-
// book problem this maps into (see looksLikeGarbledText in
// pdf-indexer.ts). Falls back to English, matching the OCR pipeline's
// pre-existing default.
const DISPLAY_NAME_TO_TESSERACT_CODE: Record<string, string> = {
  english: 'eng',
  tamil: 'tam',
  hindi: 'hin',
  telugu: 'tel',
  kannada: 'kan',
  malayalam: 'mal',
  bengali: 'ben',
  gujarati: 'guj',
  marathi: 'mar',
  punjabi: 'pan',
  urdu: 'urd',
  sanskrit: 'san',
  odia: 'ori',
  assamese: 'asm',
  nepali: 'nep',
  sinhala: 'sin',
  french: 'fra',
  german: 'deu',
  spanish: 'spa',
  italian: 'ita',
  portuguese: 'por',
  russian: 'rus',
  japanese: 'jpn',
  korean: 'kor',
  'chinese (simplified)': 'chi_sim',
  'chinese (traditional)': 'chi_tra',
  chinese: 'chi_sim',
  arabic: 'ara',
};

const DEFAULT_TESSERACT_LANGUAGE = 'eng';

// `preferred` order lets the caller try the more specific signal first
// (e.g. Edition.language) and fall back to a broader one (Work.language,
// Work.originalLanguage) without the caller needing its own null-chain
// logic duplicated at every call site.
export function resolveOcrLanguage(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const code = DISPLAY_NAME_TO_TESSERACT_CODE[candidate.trim().toLowerCase()];
    if (code) return code;
  }
  return DEFAULT_TESSERACT_LANGUAGE;
}
