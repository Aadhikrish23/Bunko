import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  isDanger?: boolean;
  isConfirming?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// In-theme replacement for window.confirm() — the native dialog breaks
// out of the app's own visual world (raw browser chrome over the
// paper/wood system) and gives no way to show a pending/error state for
// the action it's confirming.
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  isDanger = true,
  isConfirming = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-paper-700">{message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={isConfirming}>
          Cancel
        </Button>
        <Button type="button" variant={isDanger ? 'danger' : 'primary'} onClick={onConfirm} isLoading={isConfirming}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
