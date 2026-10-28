import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Prose } from './Prose';
import type { Turn } from './thread';

export function AssistantTurn({
  turn,
  titles,
  onChoose,
  onRetry,
  busy,
}: {
  turn: Extract<Turn, { role: 'assistant' }>;
  titles: string[];
  onChoose: (label: string) => void;
  onRetry: (message: string) => void;
  busy: boolean;
}) {
  const problem = turn.status === 'LIMITED' || turn.status === 'UNAVAILABLE' || turn.status === 'FAILED';
  if (turn.status === 'CONFIRMATION_REQUIRED' && turn.choices) {
    return (
      <div className="w-full max-w-md rounded-xl border border-paper-200 bg-paper-50 p-4 shadow-card">
        <div className="text-[15px] font-medium leading-relaxed text-paper-900">
          <Prose text={turn.text} titles={titles} />
        </div>
        {turn.reason && <p className="mt-1.5 text-sm text-paper-700">{turn.reason}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {turn.choices.map((choice) => (
            <Button
              key={choice.label}
              size="sm"
              variant={choice.tone === 'danger' ? 'danger' : choice.tone === 'confirm' ? 'primary' : 'secondary'}
              disabled={busy}
              onClick={() => onChoose(choice.label)}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex max-w-[38rem] flex-col gap-3">
      <div className={`flex gap-2.5 text-[15px] leading-relaxed ${problem ? 'text-paper-800' : 'text-paper-900'}`}>
        {problem && (
          <AlertCircle aria-hidden="true" strokeWidth={1.75} className="mt-[0.2em] h-4 w-4 shrink-0 text-ember-600" />
        )}
        <Prose text={turn.text} titles={titles} />
      </div>
      {turn.choices && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose one">
          {turn.choices.map((choice) => (
            <Button
              key={choice.label}
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onChoose(choice.label)}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      )}
      {turn.retry && (
        <div>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRetry(turn.retry!)}>
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} /> Try again
          </Button>
        </div>
      )}
    </div>
  );
}
