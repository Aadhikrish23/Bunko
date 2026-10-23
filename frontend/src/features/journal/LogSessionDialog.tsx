import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Modal } from '../../components/ui/Modal';
import { useCreateCopy, useCreateEdition } from '../../lib/api/editions';
import { useLogSession } from '../../lib/api/sessions';
import { useWorks } from '../../lib/api/works';
import { errorMessage } from '../../lib/error-message';

const field = 'focus-visible:focus-ring w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm text-paper-900';
const label = 'flex flex-col gap-1.5 text-sm font-medium text-paper-800';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Logs reading that already happened (SRS §6.3, manual override always available): which book,
 * when, how long, and the pages, so time and pages count without running a timer. A book with
 * no copy yet gets a paper copy, since that's the reading being logged.
 */
export function LogSessionDialog({ workId, onClose }: { workId?: string; onClose: () => void }) {
  const works = useWorks({ pageSize: 100 });
  const logSession = useLogSession();
  const createEdition = useCreateEdition();
  const createCopy = useCreateCopy();
  const [bookId, setBookId] = useState(workId ?? '');
  const [date, setDate] = useState(today());
  const [minutes, setMinutes] = useState('30');
  const [fromPage, setFromPage] = useState('');
  const [toPage, setToPage] = useState('');
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const books = useMemo(() => {
    const items = works.data?.items ?? [];
    const rank = (s: string) => (s === 'READING' ? 0 : s === 'WANT_TO_READ' ? 1 : 2);
    return [...items].sort((a, b) => rank(a.status) - rank(b.status) || a.title.localeCompare(b.title));
  }, [works.data]);
  const chosen = books.find((b) => b.id === bookId);
  const busy = logSession.isPending || createEdition.isPending || createCopy.isPending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const mins = Number(minutes);
    if (!chosen) return setError('Choose the book you read.');
    if (!Number.isInteger(mins) || mins < 1 || mins > 720) return setError('Minutes should be a whole number between 1 and 720.');
    if (fromPage && toPage && Number(toPage) < Number(fromPage)) return setError('The last page should come after the first one.');
    try {
      const existing =
        chosen.editions.find((e) => e.format === 'PHYSICAL' && e.copyId) ?? chosen.editions.find((e) => e.copyId);
      let copyId = existing?.copyId ?? null;
      if (!copyId) {
        const edition = await createEdition.mutateAsync({ workId: chosen.id, format: 'PHYSICAL' });
        copyId = (await createCopy.mutateAsync({ editionId: edition.id })).id;
      }
      // Noon on the chosen day for a past date; now for today.
      const endedAt = date === today() ? new Date() : new Date(`${date}T12:00:00`);
      await logSession.mutateAsync({
        copyId,
        endedAt: endedAt.toISOString(),
        minutes: mins,
        startPosition: fromPage ? `p. ${fromPage}` : null,
        endPosition: toPage ? `p. ${toPage}` : null,
        reflection: reflection.trim() || null,
      });
      const pages = fromPage && toPage ? `, pages ${fromPage}–${toPage}` : toPage ? `, up to page ${toPage}` : '';
      setDone(`Logged ${mins} min of ${chosen.title}${pages}.`);
    } catch (err) {
      setError(errorMessage(err, 'Could not log that session.'));
    }
  }

  if (done) {
    return (
      <Modal title="Reading logged" onClose={onClose}>
        <p className="text-sm text-paper-800">{done}</p>
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Log reading" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <ErrorBanner message={error} />}
        <label className={label}>
          Book
          <select value={bookId} onChange={(e) => setBookId(e.target.value)} className={field} required>
            <option value="" disabled>
              {works.isLoading ? 'Loading your books…' : 'Choose a book'}
            </option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
                {b.authors[0] ? ` — ${b.authors[0]}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Day
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Minutes
            <input type="number" inputMode="numeric" min={1} max={720} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            From page <span className="sr-only">(optional)</span>
            <input type="number" inputMode="numeric" min={0} value={fromPage} onChange={(e) => setFromPage(e.target.value)} placeholder="Optional" className={field} />
          </label>
          <label className={label}>
            To page <span className="sr-only">(optional)</span>
            <input type="number" inputMode="numeric" min={0} value={toPage} onChange={(e) => setToPage(e.target.value)} placeholder="Optional" className={field} />
          </label>
        </div>
        <p className="-mt-2 text-xs text-paper-600">With both pages, they count toward your pages read.</p>
        <label className={label}>
          What did you make of it? <span className="font-normal text-paper-600">(optional)</span>
          <textarea value={reflection} onChange={(e) => setReflection(e.target.value)} rows={3} maxLength={5_000} className={field} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" isLoading={busy}>
            Log reading
          </Button>
        </div>
      </form>
    </Modal>
  );
}
