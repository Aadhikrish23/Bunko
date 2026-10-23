import { Quote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useAnnotations } from '../../lib/api/annotations';
import { COLOR_HEX_MAP, type HighlightColor } from '../../lib/annotation-colors';
import { errorMessage } from '../../lib/error-message';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** What was highlighted or quoted in one digital edition, newest first, with any margin note. */
function EditionHighlights({ editionId, showEmpty }: { editionId: string; showEmpty: boolean }) {
  const annotations = useAnnotations(editionId);

  if (annotations.isLoading) return <p className="text-sm text-paper-600">Loading highlights…</p>;
  if (annotations.isError) {
    return <ErrorBanner message={errorMessage(annotations.error, 'Could not load your highlights.')} />;
  }
  const items = [...(annotations.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (items.length === 0) {
    return showEmpty ? (
      <p className="text-sm text-paper-700">Nothing highlighted yet. Select a passage while reading to keep it here.</p>
    ) : null;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((a) => (
        <li key={a.id} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-1 w-1 shrink-0 self-stretch rounded-full"
            style={{ backgroundColor: COLOR_HEX_MAP[(a.color ?? 'yellow') as HighlightColor]?.border ?? COLOR_HEX_MAP.yellow.border }}
          />
          <div className="min-w-0">
            <p className="font-display text-[15px] leading-relaxed text-paper-900">
              {a.kind === 'QUOTE' && <Quote className="mr-1 inline h-3.5 w-3.5 text-paper-600" aria-label="Quote" />}
              {a.text}
            </p>
            {a.note && <p className="mt-1 text-sm text-paper-700">{a.note}</p>}
            <p className="mt-1 text-xs text-paper-600">
              {formatDate(a.createdAt)} ·{' '}
              <Link to={`/read-chapters/${editionId}`} className="focus-visible:focus-ring rounded text-moss-700 underline underline-offset-2">
                Open the book
              </Link>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Highlights and quotes from every digital edition of a book (R2-18). */
export function BookHighlights({ editionIds }: { editionIds: string[] }) {
  if (editionIds.length === 0) {
    return <p className="text-sm text-paper-700">Highlights you make while reading an EPUB or PDF of this book show up here.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {editionIds.map((id, i) => (
        <EditionHighlights key={id} editionId={id} showEmpty={i === 0 && editionIds.length === 1} />
      ))}
    </div>
  );
}
