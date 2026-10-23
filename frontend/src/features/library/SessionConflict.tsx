import { Button } from '../../components/ui/Button';

/**
 * Another book's session is still open (R2-05). Says which one, and offers to pause it and
 * start this one; pausing keeps that session's time.
 */
export function SessionConflict({
  message,
  onTakeOver,
  isLoading,
}: {
  message: string;
  onTakeOver: () => void;
  isLoading: boolean;
}) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-ember-400/60 bg-ember-400/10 px-3 py-2.5 text-sm text-paper-900">
      <p>{message}</p>
      <Button size="sm" variant="secondary" className="self-start" onClick={onTakeOver} isLoading={isLoading}>
        Pause that one and start here
      </Button>
    </div>
  );
}
