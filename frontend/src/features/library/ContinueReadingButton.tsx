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
export function ContinueReadingButton({
  journeyId,
  edition,
  coverImageUrl,
}: {
  journeyId: string | null;
  edition: EditionSummary;
  coverImageUrl?: string | null;
}) {
  const navigate = useNavigate();
  const resolvePosition = useResolvePosition();
  const correctPosition = useCorrectPosition();
  const [pendingConfirmation, setPendingConfirmation] = useState<{ chapterLabel: string | null } | null>(null);

  function openReader() {
    // journeyId travels via router state so the reader can offer a
    // manual correction (T-037) without a separate lookup — lost on a
    // hard refresh/direct URL visit, in which case that affordance is
    // simply unavailable rather than broken.
    //
    // /read-chapters (FlowReaderPage) is the default entry point — the
    // unified chapter-text reader shared by EPUB and PDF. /read
    // (ReaderPage, format-native PdfReader/EpubReader) remains available
    // as the "View Original" escape hatch from within the reader itself.
    //
    // coverImageUrl also travels via router state (same lost-on-refresh
    // caveat as journeyId) so FlowReaderPage can show the Work's actual
    // cover art instead of a blank page for an EPUB's image-only cover
    // spine item — chapter-text extraction strips all images, so that
    // unit's text always comes out empty.
    navigate(`/read-chapters/${edition.id}`, { state: { journeyId, coverImageUrl } });
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
