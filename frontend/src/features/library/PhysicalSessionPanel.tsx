import { BookOpen, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Input } from '../../components/ui/Input';
import { useEndSession, useStartSession } from '../../lib/api/sessions';
import { errorMessage } from '../../lib/error-message';

// Manual start/end flow for a physical copy (SRS §12.9, T-039) — Bunko
// can't detect physical page-turns, so the user drives the whole
// lifecycle explicitly.
export function PhysicalSessionPanel({ copyId }: { copyId: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const [endPosition, setEndPosition] = useState('');
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ durationSeconds: number | null } | null>(null);

  const startSession = useStartSession();
  const endSession = useEndSession();

  async function handleStart() {
    setError(null);
    try {
      const session = await startSession.mutateAsync({ copyId });
      setSessionId(session.id);
      setSummary(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not start a reading session.'));
    }
  }

  async function handleEnd() {
    if (!sessionId || !endPosition.trim()) return;
    setError(null);
    try {
      const session = await endSession.mutateAsync({
        sessionId,
        endPosition: endPosition.trim(),
        reflection: reflection.trim() || undefined,
      });
      setSummary({ durationSeconds: session.durationSeconds });
      setSessionId(null);
      setIsEnding(false);
      setEndPosition('');
      setReflection('');
    } catch (err) {
      setError(errorMessage(err, 'Could not end the session.'));
    }
  }

  if (summary) {
    const minutes = summary.durationSeconds ? Math.round(summary.durationSeconds / 60) : 0;
    return (
      <div className="flex items-center gap-2 rounded-md border border-moss-200 bg-moss-50 px-3 py-2.5 text-sm text-moss-700">
        <Check className="h-4 w-4" />
        Session saved — {minutes} min. Nice reading.
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex flex-col gap-2">
        {error && <ErrorBanner message={error} />}
        <Button onClick={handleStart} isLoading={startSession.isPending}>
          <BookOpen className="h-4 w-4" /> Start Reading Session
        </Button>
      </div>
    );
  }

  if (!isEnding) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-paper-600">Session in progress…</p>
        <Button variant="secondary" onClick={() => setIsEnding(true)}>
          End Session
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-paper-200 p-3">
      {error && <ErrorBanner message={error} />}
      <Input
        label="Ending chapter / page"
        placeholder="e.g. Chapter 10"
        value={endPosition}
        onChange={(e) => setEndPosition(e.target.value)}
        autoFocus
      />
      <Input
        label="Reflection (optional)"
        placeholder="Add a quick reflection…"
        value={reflection}
        onChange={(e) => setReflection(e.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setIsEnding(false)}>
          Cancel
        </Button>
        <Button onClick={handleEnd} isLoading={endSession.isPending} disabled={!endPosition.trim()}>
          Save session
        </Button>
      </div>
    </div>
  );
}
