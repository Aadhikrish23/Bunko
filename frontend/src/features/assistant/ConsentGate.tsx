import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useAiStatus, useSetAiConsent } from '../../lib/api/ai';
import { errorMessage } from '../../lib/error-message';
import { GENERATIVE_DISCLOSURE } from '../ai/ai-disclosure';

export function ConsentGate() {
  const status = useAiStatus();
  const setConsent = useSetAiConsent();
  const consent = status.data?.consent;
  return (
    <section className="max-w-lg py-6 sm:py-10" aria-labelledby="assistant-consent">
      <h2 id="assistant-consent" className="font-display text-2xl text-paper-900">
        Turn on the assistant
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-paper-700">{GENERATIVE_DISCLOSURE}</p>
      <p className="mt-3 text-sm text-paper-600">
        This also turns on Search by meaning, which it builds on. You can turn either off in Settings at any time.
      </p>
      {setConsent.isError && (
        <div className="mt-4">
          <ErrorBanner message={errorMessage(setConsent.error, 'Could not turn it on. Please try again.')} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          isLoading={setConsent.isPending}
          onClick={() =>
            setConsent.mutate({
              semanticSearch: true,
              generative: true,
              translation: consent?.translation ?? false,
            })
          }
        >
          Turn on the assistant
        </Button>
        <Link
          to="/settings"
          className="focus-visible:focus-ring rounded text-sm font-medium text-moss-700 underline underline-offset-4"
        >
          Review AI settings
        </Link>
      </div>
    </section>
  );
}
