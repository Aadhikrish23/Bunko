import { Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAiStatus, useWorkSummary } from '../../lib/api/ai';
import { errorMessage } from '../../lib/error-message';
import { AiLabel } from './AiLabel';

// "Summarize my thoughts on this book" (SRS §20.1, T-083). Rendered only
// when generated insights are on and available; runs only on click.
export function BookSummaryPanel({ workId }: { workId: string }) {
  const status = useAiStatus();
  const summary = useWorkSummary(workId);
  if (!status.data?.consent.generative || !status.data.available.generative) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-paper-200 pt-4">
      <Button variant="secondary" size="sm" className="self-start" isLoading={summary.isPending} onClick={() => summary.mutate()}>
        <Sparkles aria-hidden="true" className="h-4 w-4" />
        {summary.data ? 'Summarize again' : 'Summarize my thoughts'}
      </Button>
      {summary.isError && <p className="text-sm text-ember-600">{errorMessage(summary.error, 'Could not summarize right now.')}</p>}
      {summary.data && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <AiLabel />
          <p className="whitespace-pre-line text-sm leading-relaxed text-paper-900">{summary.data.summary}</p>
          {summary.data.themes.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {summary.data.themes.map((theme) => (
                <li key={theme} className="rounded-full bg-moss-50 px-2.5 py-1 text-xs text-moss-700">
                  {theme}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
