import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useCreateWork } from '../../lib/api/works';
import type { SeriesSibling } from '../../lib/api/types';
import { BookCover } from './BookCover';

// "Other books from that collection" — the honest version of the
// series-parts request: Open Library's search API has no reliable
// series-linking data (confirmed by hand — searching a known 5-part
// series returns inconsistent, unlinked duplicate entries, not clean
// parts), so this is built on Bunko's own Series grouping instead: once
// two books share a seriesName, each one's page lists the others here.
export function SeriesPanel({ seriesName, siblings }: { seriesName: string; siblings: SeriesSibling[] }) {
  const navigate = useNavigate();
  const createWork = useCreateWork();

  if (siblings.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-display text-lg text-paper-900">More in {seriesName}</h2>
      <p className="mb-4 text-sm text-paper-500">Other books from this collection.</p>
      <div className="flex flex-wrap gap-4">
        {siblings.map((sibling) => (
          <div key={sibling.workId} className="w-28 flex-shrink-0">
            <button
              type="button"
              disabled={!sibling.inLibrary}
              onClick={() => sibling.inLibrary && navigate(`/library/${sibling.workId}`)}
              className="focus-visible:focus-ring w-full disabled:cursor-default"
            >
              <BookCover title={sibling.title} coverImageUrl={sibling.coverImageUrl} />
            </button>
            <p className="mt-1.5 line-clamp-2 text-xs font-medium text-paper-800">{sibling.title}</p>
            {sibling.inLibrary ? (
              <p className="text-xs text-moss-600">In your library</p>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="mt-1 w-full"
                isLoading={createWork.isPending}
                onClick={() => createWork.mutate({ workId: sibling.workId })}
              >
                <Plus className="h-3 w-3" /> Add
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
