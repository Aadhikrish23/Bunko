import { Languages, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Spinner } from '../../components/ui/Spinner';
import { useAiStatus, useRequestTranslation } from '../../lib/api/ai';
import type { ChapterTranslation } from '../../lib/api/types';
import { errorMessage } from '../../lib/error-message';
import { chapterTranslationState, progressLabel } from './translation-view';

interface TranslatePanelProps {
  editionId: string;
  chapter: { structuralId: string; label: string; length: number } | null;
  language: string | null;
  onLanguageChange: (code: string | null) => void;
  showTranslated: boolean;
  onShowTranslatedChange: (show: boolean) => void;
  translations: ChapterTranslation[] | undefined;
  onClose: () => void;
}

// The flow reader's translation controls (SRS §20.5, T-091): pick a
// language, translate the chapter being read, and switch between the
// original and the translation. Sending text happens only on the button.
export function TranslatePanel({
  editionId,
  chapter,
  language,
  onLanguageChange,
  showTranslated,
  onShowTranslatedChange,
  translations,
  onClose,
}: TranslatePanelProps) {
  const status = useAiStatus();
  const request = useRequestTranslation(editionId);
  const state = chapterTranslationState(translations, chapter?.structuralId ?? null);

  function translate() {
    if (!chapter || !language) return;
    request.mutate({ structuralId: chapter.structuralId, targetLanguage: language });
  }

  let body: ReactNode;
  if (status.isLoading) {
    body = <Spinner className="mx-auto my-4 h-5 w-5" />;
  } else if (status.isError || !status.data) {
    body = <ErrorBanner message={errorMessage(status.error, 'Could not load translation settings.')} />;
  } else if (!status.data.consent.translation) {
    body = (
      <p className="text-sm text-paper-700">
        Chapter translation is off. It sends a chapter’s text to NVIDIA’s AI service when you ask, so it needs your
        go-ahead first.{' '}
        <Link to="/settings" className="font-medium text-moss-700 underline">
          Turn it on in Settings
        </Link>
      </p>
    );
  } else if (!status.data.available.translation) {
    body = <p className="text-sm text-paper-700">Translation isn’t set up on this server yet.</p>;
  } else {
    const languageName = status.data.translationLanguages.find((l) => l.code === language)?.name;
    body = (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-paper-700">
          Translate into
          <select
            value={language ?? ''}
            onChange={(e) => onLanguageChange(e.target.value || null)}
            className="focus-visible:focus-ring rounded-md border border-paper-300 bg-paper-50 px-2 py-1.5 text-sm text-paper-900"
          >
            <option value="">— Original only —</option>
            {status.data.translationLanguages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        {language && chapter && (
          <div className="rounded-md border border-paper-200 bg-paper-100/60 p-3 text-sm text-paper-800">
            <p className="mb-2 truncate font-medium" title={chapter.label}>
              {chapter.label}
            </p>
            {state.kind === 'none' && (
              <>
                <p className="mb-2 text-xs text-paper-600">
                  Sends this chapter’s text ({chapter.length.toLocaleString()} characters) to NVIDIA to translate into{' '}
                  {languageName}.
                </p>
                <Button size="sm" onClick={translate} isLoading={request.isPending} disabled={chapter.length === 0}>
                  Translate this chapter
                </Button>
              </>
            )}
            {state.kind === 'pending' && (
              <p className="flex items-center gap-2 text-xs text-paper-700" role="status">
                <Spinner className="h-3.5 w-3.5" /> {progressLabel(state)}
              </p>
            )}
            {state.kind === 'ready' && (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={showTranslated}
                  onChange={(e) => onShowTranslatedChange(e.target.checked)}
                />
                Show the translation
              </label>
            )}
            {state.kind === 'stale' && (
              <>
                <p className="mb-2 text-xs text-paper-600">This chapter’s text has changed since it was translated.</p>
                <Button size="sm" variant="secondary" onClick={translate} isLoading={request.isPending}>
                  Translate again
                </Button>
              </>
            )}
            {state.kind === 'failed' && (
              <>
                <p className="mb-2 text-xs text-ember-600">{state.message}</p>
                <Button size="sm" variant="secondary" onClick={translate} isLoading={request.isPending}>
                  Try again
                </Button>
              </>
            )}
          </div>
        )}

        {request.isError && <ErrorBanner message={errorMessage(request.error, 'Could not start the translation.')} />}

        <p className="text-xs leading-relaxed text-paper-600">
          Machine translation by AI. It can contain mistakes, and highlights and quotes are saved from the original
          text.
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-2 top-14 z-30 rounded-md border border-paper-200 bg-paper-50 p-3 text-left shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-72">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-paper-900">
          <Languages aria-hidden="true" className="h-4 w-4 text-moss-600" /> Translate
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close translation"
          className="focus-visible:focus-ring rounded p-1 text-paper-500 hover:bg-paper-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {body}
    </div>
  );
}
