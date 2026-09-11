import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

// Non-blocking, optional, one-tap-to-skip — matches the flow diagram in
// SRS §12.10 exactly (T-041).
export function ReflectionPrompt({
  durationSeconds,
  onSubmit,
  isSubmitting,
}: {
  durationSeconds: number | null;
  onSubmit: (reflection: string | null) => void;
  isSubmitting: boolean;
}) {
  const [reflection, setReflection] = useState('');
  const minutes = durationSeconds ? Math.max(1, Math.round(durationSeconds / 60)) : 0;

  return (
    <Modal title="Session ended" onClose={() => onSubmit(null)}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-paper-700">{minutes} min of reading. Nice work.</p>
        <textarea
          autoFocus
          placeholder="Add a quick reflection (optional)…"
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          rows={3}
          className="focus-visible:focus-ring rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm text-paper-900 placeholder:text-paper-400"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onSubmit(null)} disabled={isSubmitting}>
            Skip
          </Button>
          <Button onClick={() => onSubmit(reflection.trim() || null)} isLoading={isSubmitting}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
