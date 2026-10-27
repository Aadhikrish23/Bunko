import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useAiStatus, useSetAiConsent } from '../../lib/api/ai';
import { errorMessage } from '../../lib/error-message';
import { GENERATIVE_DISCLOSURE, SEMANTIC_SEARCH_DISCLOSURE, TRANSLATION_DISCLOSURE } from './ai-disclosure';
import { revokeWarning, toggleConsent, type Consent } from './consent-logic';

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-paper-200 pt-3 first:border-0 first:pt-0">
      <div>
        <p className="text-sm font-medium text-paper-900">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-paper-600">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="focus-visible:focus-ring flex min-h-[44px] shrink-0 items-center rounded-full disabled:opacity-50"
      >
        <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-moss-600' : 'bg-paper-300'}`}>
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-paper-50 shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </span>
      </button>
    </div>
  );
}

// SRS §20.4 / §38.5: both off by default, each with a plain statement of
// what it does with the reader's data, and revoking explained up front.
export function AiSettingsCard() {
  const status = useAiStatus();
  const setConsent = useSetAiConsent();
  const [pending, setPending] = useState<{ next: Consent; warning: string } | null>(null);

  const current: Consent = status.data
    ? {
        semanticSearch: status.data.consent.semanticSearch,
        generative: status.data.consent.generative,
        translation: status.data.consent.translation,
      }
    : { semanticSearch: false, generative: false, translation: false };
  const available = status.data?.available;

  function change(key: keyof Consent, on: boolean) {
    const next = toggleConsent(current, key, on);
    const warning = revokeWarning(current, next);
    if (warning) setPending({ next, warning });
    else setConsent.mutate(next);
  }

  return (
    <Card className="max-w-md p-5">
      <h2 className="mb-1 font-display text-lg text-paper-900">AI features</h2>
      <p className="mb-4 text-sm text-paper-600">Off unless you turn them on. Each works only with your own data.</p>
      {status.isError && <ErrorBanner message={errorMessage(status.error, 'Could not load AI settings.')} />}
      {setConsent.isError && <ErrorBanner message={errorMessage(setConsent.error, 'Could not save.')} />}
      {status.data && (
        <div className="flex flex-col gap-3">
          <Toggle
            label="Search by meaning"
            description={SEMANTIC_SEARCH_DISCLOSURE}
            checked={current.semanticSearch}
            disabled={setConsent.isPending}
            onChange={(on) => change('semanticSearch', on)}
          />
          <Toggle
            label="Assistant and book summaries"
            description={`${GENERATIVE_DISCLOSURE} Limited to ${status.data.dailyGenerationLimit} requests a day.`}
            checked={current.generative}
            disabled={setConsent.isPending}
            onChange={(on) => change('generative', on)}
          />
          <Toggle
            label="Chapter translation"
            description={`${TRANSLATION_DISCLOSURE} Up to ${status.data.dailyTranslationChars.toLocaleString()} characters a day.`}
            checked={current.translation}
            disabled={setConsent.isPending}
            onChange={(on) => change('translation', on)}
          />
          {available &&
            (() => {
              // Search by meaning and chapter translation run on one backend; the
              // Assistant can run on a separate one and be up when that isn't (R5-09:
              // this used to say "AI features aren't set up" while the Assistant was
              // demonstrably answering).
              const unavailable = [
                !available.semanticSearch && 'search by meaning',
                !available.generative && current.generative && 'the Assistant',
                !available.translation && current.translation && 'chapter translation',
              ].filter((v): v is string => Boolean(v));
              if (unavailable.length === 0) return null;
              return (
                <p className="text-xs text-ember-600">
                  {unavailable.length === 1 ? unavailable[0] : `${unavailable.slice(0, -1).join(', ')} and ${unavailable.at(-1)}`}
                  {unavailable.length === 1 ? " isn't" : " aren't"} set up on this server yet — your choice is saved for when{' '}
                  {unavailable.length === 1 ? 'it is' : 'they are'}.
                </p>
              );
            })()}
        </div>
      )}
      {pending && (
        <ConfirmDialog
          title="Turn this off?"
          message={pending.warning}
          confirmLabel="Turn off"
          isConfirming={setConsent.isPending}
          onConfirm={() => setConsent.mutate(pending.next, { onSuccess: () => setPending(null) })}
          onClose={() => setPending(null)}
        />
      )}
    </Card>
  );
}
