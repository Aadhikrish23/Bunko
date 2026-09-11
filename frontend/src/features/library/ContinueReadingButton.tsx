import { BookOpenText } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { useCorrectPosition, useResolvePosition } from '../../lib/api/continuity';
import type { EditionSummary } from '../../lib/api/types';
import { ContinuityPrompt } from './ContinuityPrompt';

// Decides whether opening this digital edition needs the confirmation
// prompt (T-036) before navigating, per the resolve-position confidence
// (T-034/T-035) — never auto-navigates on a low-confidence guess itself;
// that's already enforced by the backend, this just surfaces the choice.
export function ContinueReadingButton({ journeyId, edition }: { journeyId: string | null; edition: EditionSummary }) {
  const navigate = useNavigate();
  const resolvePosition = useResolvePosition();
  const correctPosition = useCorrectPosition();
  const [pendingConfirmation, setPendingConfirmation] = useState<{ chapterLabel: string | null } | null>(null);

  function openReader() {
    navigate(`/read/${edition.id}`);
  }

  async function handleClick() {
    if (!journeyId) {
      openReader();
      return;
    }
    const result = await resolvePosition.mutateAsync({ journeyId, targetEditionId: edition.id });
    if (result.requiresConfirmation && (result.chapterLabel || result.structuralId)) {
      setPendingConfirmation({ chapterLabel: result.chapterLabel });
    } else {
      openReader();
    }
  }

  async function handleConfirm() {
    if (!journeyId || !pendingConfirmation) return;
    // "Confirm" persists the resolved candidate as the definitive
    // canonical position (T-037's correction endpoint doubles as the
    // confirm primitive) so it's reused without re-prompting next time
    // (SRS §11.9).
    const result = await resolvePosition.mutateAsync({ journeyId, targetEditionId: edition.id });
    await correctPosition.mutateAsync({
      journeyId,
      structuralId: result.structuralId,
      chapterLabel: result.chapterLabel,
    });
    setPendingConfirmation(null);
    openReader();
  }

  return (
    <>
      <Button onClick={handleClick} isLoading={resolvePosition.isPending}>
        <BookOpenText className="h-4 w-4" /> Continue Reading
      </Button>
      {pendingConfirmation && (
        <ContinuityPrompt
          chapterLabel={pendingConfirmation.chapterLabel}
          isConfirming={correctPosition.isPending}
          onConfirm={handleConfirm}
          onDismiss={openReader}
        />
      )}
    </>
  );
}
