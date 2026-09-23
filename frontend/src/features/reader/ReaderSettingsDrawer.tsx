import { BookOpen, Columns, AlignJustify, Sun, Thermometer, Minus, Plus, X } from 'lucide-react';
import type { MarginSize, PageTurnMode, ReaderSettings, ReaderTheme } from './reader-settings';
import { THEME_STYLES } from './reader-settings';

interface ReaderSettingsDrawerProps {
  settings: ReaderSettings;
  onChange: (newSettings: ReaderSettings) => void;
  onClose: () => void;
}

export function ReaderSettingsDrawer({ settings, onChange, onClose }: ReaderSettingsDrawerProps) {
  function update<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) {
    onChange({
      ...settings,
      [key]: value,
    });
  }

  const themes: { id: ReaderTheme; label: string }[] = [
    { id: 'paper', label: 'Paper' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'charcoal', label: 'Charcoal' },
    { id: 'dark', label: 'Dark' },
  ];

  const modes: { id: PageTurnMode; label: string; icon: typeof BookOpen }[] = [
    { id: '3d-flip', label: '3D Flip', icon: BookOpen },
    { id: 'paginated', label: 'Paginated', icon: Columns },
    { id: 'continuous', label: 'Scroll', icon: AlignJustify },
  ];

  const margins: { id: MarginSize; label: string }[] = [
    { id: 'compact', label: 'Narrow' },
    { id: 'standard', label: 'Normal' },
    { id: 'wide', label: 'Wide' },
  ];

  const fontFamilies: { id: 'serif' | 'sans' | 'mono'; label: string; class: string }[] = [
    { id: 'serif', label: 'Serif', class: 'font-serif' },
    { id: 'sans', label: 'Sans', class: 'font-sans' },
    { id: 'mono', label: 'Mono', class: 'font-mono' },
  ];

  const lineHeights: { value: number; label: string }[] = [
    { value: 1.2, label: 'Tight' },
    { value: 1.5, label: 'Normal' },
    { value: 1.8, label: 'Relaxed' },
    { value: 2.0, label: 'Loose' },
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-paper-300 bg-paper-50 p-4 shadow-2xl transition-all sm:rounded-l-2xl">
      <div className="flex items-center justify-between border-b border-paper-200 pb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-paper-800">Reader Appearance</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reader settings"
          className="focus-visible:focus-ring rounded-md p-1.5 text-paper-500 hover:bg-paper-100 hover:text-paper-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-6 text-xs">
        {/* Reading Mode */}
        <div>
          <label className="mb-2 block font-semibold text-paper-700">Reading View Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {modes.map((mode) => {
              const Icon = mode.icon;
              const active = settings.pageTurnMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => update('pageTurnMode', mode.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-all ${
                    active
                      ? 'border-moss-600 bg-moss-50/80 font-bold text-moss-900 shadow-sm'
                      : 'border-paper-200 bg-paper-100/60 text-paper-600 hover:bg-paper-100 hover:text-paper-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Color Theme Swatches */}
        <div>
          <label className="mb-2 block font-semibold text-paper-700">Reading Theme</label>
          <div className="grid grid-cols-4 gap-2">
            {themes.map((t) => {
              const active = settings.theme === t.id;
              const style = THEME_STYLES[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => update('theme', t.id)}
                  style={{ backgroundColor: style.paperBg, color: style.text, borderColor: style.border }}
                  className={`flex flex-col items-center justify-center rounded-lg border-2 py-3 font-semibold transition-all ${
                    active ? 'ring-2 ring-moss-600 ring-offset-2 scale-105 shadow-md' : 'opacity-85 hover:opacity-100'
                  }`}
                >
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Brightness Control */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="flex items-center gap-1.5 font-semibold text-paper-700">
              <Sun className="h-3.5 w-3.5 text-amber-500" />
              <span>Brightness</span>
            </label>
            <span className="font-mono text-paper-500">{settings.brightness}%</span>
          </div>
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={settings.brightness}
            onChange={(e) => update('brightness', Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-moss-600 rounded-lg bg-paper-200"
          />
        </div>

        {/* Temperature / Warmth Control */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="flex items-center gap-1.5 font-semibold text-paper-700">
              <Thermometer className="h-3.5 w-3.5 text-orange-500" />
              <span>Color Warmth / Tint</span>
            </label>
            <span className="font-mono text-paper-500">{settings.temperature}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.temperature}
            onChange={(e) => update('temperature', Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-orange-500 rounded-lg bg-paper-200"
          />
        </div>

        {/* Font Family Control */}
        <div>
          <label className="mb-2 block font-semibold text-paper-700">Font Family</label>
          <div className="grid grid-cols-3 gap-2">
            {fontFamilies.map((f) => {
              const active = settings.fontFamily === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => update('fontFamily', f.id)}
                  className={`rounded-lg border py-2 text-center text-xs font-semibold transition-all ${f.class} ${
                    active
                      ? 'border-moss-600 bg-moss-50 font-bold text-moss-900 shadow-sm'
                      : 'border-paper-200 bg-paper-100/60 text-paper-600 hover:bg-paper-100'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Font Scale Control */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="font-semibold text-paper-700">Font Scale</label>
            <span className="font-mono text-paper-500">{Math.round(settings.fontScale * 100)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => update('fontScale', Math.max(0.75, Number((settings.fontScale - 0.1).toFixed(2))))}
              className="focus-visible:focus-ring rounded-lg border border-paper-300 bg-paper-100 p-2 text-paper-700 hover:bg-paper-200"
              aria-label="Decrease font size"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="flex-1 h-2 rounded bg-paper-200 overflow-hidden">
              <div
                className="h-full bg-moss-600 transition-all"
                style={{ width: `${((settings.fontScale - 0.75) / (1.75 - 0.75)) * 100}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => update('fontScale', Math.min(1.75, Number((settings.fontScale + 0.1).toFixed(2))))}
              className="focus-visible:focus-ring rounded-lg border border-paper-300 bg-paper-100 p-2 text-paper-700 hover:bg-paper-200"
              aria-label="Increase font size"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Line Spacing */}
        <div>
          <label className="mb-2 block font-semibold text-paper-700">Line Spacing</label>
          <div className="grid grid-cols-4 gap-1.5">
            {lineHeights.map((lh) => {
              const active = settings.lineHeight === lh.value;
              return (
                <button
                  key={lh.value}
                  type="button"
                  onClick={() => update('lineHeight', lh.value)}
                  className={`rounded-lg border py-1.5 text-center font-medium transition-all ${
                    active
                      ? 'border-moss-600 bg-moss-50 font-bold text-moss-900 shadow-sm'
                      : 'border-paper-200 bg-paper-100/60 text-paper-600 hover:bg-paper-100'
                  }`}
                >
                  {lh.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Side Margins */}
        <div>
          <label className="mb-2 block font-semibold text-paper-700">Side Margins</label>
          <div className="grid grid-cols-3 gap-2">
            {margins.map((m) => {
              const active = settings.marginSize === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => update('marginSize', m.id)}
                  className={`rounded-lg border py-1.5 text-center font-medium transition-all ${
                    active
                      ? 'border-moss-600 bg-moss-50 font-bold text-moss-900 shadow-sm'
                      : 'border-paper-200 bg-paper-100/60 text-paper-600 hover:bg-paper-100'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
