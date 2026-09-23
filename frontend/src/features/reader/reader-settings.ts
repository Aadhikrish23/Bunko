export type PageTurnMode = '3d-flip' | 'paginated' | 'continuous';
export type ReaderTheme = 'paper' | 'sepia' | 'charcoal' | 'dark';
export type MarginSize = 'compact' | 'standard' | 'wide';
export type ReaderFontFamily = 'serif' | 'sans' | 'mono';

export interface ReaderSettings {
  pageTurnMode: PageTurnMode;
  theme: ReaderTheme;
  brightness: number; // 20 to 100
  temperature: number; // 0 to 100
  fontScale: number; // 0.75 to 1.75
  fontFamily: ReaderFontFamily;
  lineHeight: number; // 1.2 to 2.0
  marginSize: MarginSize;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  pageTurnMode: '3d-flip',
  theme: 'paper',
  brightness: 100,
  temperature: 0,
  fontScale: 1.0,
  fontFamily: 'serif',
  lineHeight: 1.5,
  marginSize: 'standard',
};

const STORAGE_KEY = 'bunko_reader_settings_v1';

export function loadReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_READER_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_READER_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write failure
  }
}

export interface ThemeColors {
  bg: string;
  paperBg: string;
  text: string;
  border: string;
}

export const THEME_STYLES: Record<ReaderTheme, ThemeColors> = {
  paper: {
    bg: '#F5F2EB',
    paperBg: '#FDFBF7',
    text: '#1C1917',
    border: '#E7E2D8',
  },
  sepia: {
    bg: '#EFE5CE',
    paperBg: '#F4ECD8',
    text: '#432818',
    border: '#E0D4B8',
  },
  charcoal: {
    bg: '#141414',
    paperBg: '#1E1E1E',
    text: '#E5E5E5',
    border: '#2E2E2E',
  },
  dark: {
    bg: '#000000',
    paperBg: '#0A0A0A',
    text: '#D4D4D4',
    border: '#1A1A1A',
  },
};
