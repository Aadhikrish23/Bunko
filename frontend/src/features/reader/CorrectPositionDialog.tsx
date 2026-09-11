import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { useCorrectPosition } from '../../lib/api/continuity';
import { errorMessage } from '../../lib/error-message';

// T-037: lets the user fix a mapping Bunko got wrong — distinct from the
// low-confidence confirmation prompt (T-036), which only appears when
// Bunko itself is unsure. This is for the case where Bunko was
// confident but still wrong, so it never showed a prompt at all.
export function CorrectPositionDialog({ journeyId, onClose }: { journeyId: string; onClose: () => void }) {
  const [chapterLabel, setChapterLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const correctPosition = useCorrectPosition();

  async function handleSubmit() {
    if (!chapterLabel.trim()) return;
    setError(null);
    try {
      await correctPosition.mutateAsync({ journeyId, chapterLabel: chapterLabel.trim() });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the correction.'));
    }
  }

  return (
    <Modal title="Not where you left off?" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <ErrorBanner message={error} />}
        <p className="text-sm text-paper-600">
          Tell us the chapter or section you were actually reading, and we&rsquo;ll remember it for next time.
        </p>
        <Input
          autoFocus
          label="Chapter / section"
          placeholder="e.g. Chapter 10"
          value={chapterLabel}
          onChange={(e) => setChapterLabel(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={correctPosition.isPending} disabled={!chapterLabel.trim()}>
            Save correction
          </Button>
        </div>
      </div>
    </Modal>
  );
}
