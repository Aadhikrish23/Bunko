import { Compass } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

// SRS §11.4's exact prompt copy, shown only when requiresConfirmation is
// true (T-036) — the system never silently jumps on a low-confidence guess.
export function ContinuityPrompt({
  chapterLabel,
  onConfirm,
  onDismiss,
  isConfirming,
}: {
  chapterLabel: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
  isConfirming: boolean;
}) {
  return (
    <Modal title="Continue your reading journey?" onClose={onDismiss}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Compass className="mt-0.5 h-5 w-5 flex-shrink-0 text-moss-600" strokeWidth={1.5} />
          <p className="text-sm text-paper-800">
            We found a likely match near <span className="font-medium">{chapterLabel ?? 'this point'}</span>.
            Continue here?
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onDismiss}>
            Start from the beginning
          </Button>
          <Button onClick={onConfirm} isLoading={isConfirming}>
            Continue here
          </Button>
        </div>
      </div>
    </Modal>
  );
}
