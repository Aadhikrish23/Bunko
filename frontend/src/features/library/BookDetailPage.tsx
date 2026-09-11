import { ArrowLeft, FileText, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { useDeleteWork, useUpdateWorkStatus, useWork } from '../../lib/api/works';
import { errorMessage } from '../../lib/error-message';
import { AddEditionDialog } from './AddEditionDialog';
import { BookCover } from './BookCover';
import { ContinueReadingButton } from './ContinueReadingButton';
import { PhysicalSessionPanel } from './PhysicalSessionPanel';
import { SeriesPanel } from './SeriesPanel';
import { ShelfAssignmentPanel } from './ShelfAssignmentPanel';
import { STATUS_OPTIONS, StatusBadge } from './StatusBadge';

const SYNOPSIS_COLLAPSE_LENGTH = 320;

function Synopsis({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > SYNOPSIS_COLLAPSE_LENGTH;
  const shown = expanded || !isLong ? text : `${text.slice(0, SYNOPSIS_COLLAPSE_LENGTH).trimEnd()}…`;

  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-paper-700">
      {shown}{' '}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="focus-visible:focus-ring font-medium text-moss-600 hover:underline"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </p>
  );
}

const FORMAT_LABELS = { PHYSICAL: 'Physical', EPUB: 'EPUB', PDF: 'PDF' } as const;

export function BookDetailPage() {
  const { workId } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const work = useWork(workId);
  const updateStatus = useUpdateWorkStatus();
  const deleteWork = useDeleteWork();
  const [isAddEditionOpen, setIsAddEditionOpen] = useState(false);

  if (work.isLoading) return <PageSpinner />;
  if (work.isError || !work.data) {
    return <ErrorBanner message={errorMessage(work.error, 'This book could not be found.')} />;
  }

  const { data } = work;

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate('/library')}
        className="focus-visible:focus-ring flex items-center gap-1.5 self-start text-sm text-paper-600 hover:text-paper-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to library
      </button>

      <div className="flex gap-6">
        <div className="w-36 flex-shrink-0">
          <BookCover title={data.title} coverImageUrl={data.coverImageUrl} />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div>
            <h1 className="font-display text-2xl text-paper-900">{data.title}</h1>
            <p className="mt-1 text-paper-600">{data.authors.join(', ') || 'Unknown author'}</p>
            {data.seriesName && <p className="text-sm italic text-paper-500">{data.seriesName}</p>}
          </div>

          {data.description && <Synopsis text={data.description} />}

          <div className="flex items-center gap-3">
            <StatusBadge status={data.status} />
            <select
              value={data.status}
              onChange={(e) =>
                updateStatus.mutate({ workId: data.id, status: e.target.value as (typeof STATUS_OPTIONS)[number]['value'] })
              }
              className="focus-visible:focus-ring rounded-md border border-paper-300 bg-paper-50 px-2 py-1 text-sm text-paper-700"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={async () => {
              if (!confirm('Remove this book from your library? Your reading history is kept.')) return;
              await deleteWork.mutateAsync(data.id);
              navigate('/library');
            }}
            className="focus-visible:focus-ring flex items-center gap-1.5 self-start text-sm text-paper-500 hover:text-ember-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove from library
          </button>
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg text-paper-900">Editions</h2>
          <Button size="sm" variant="secondary" onClick={() => setIsAddEditionOpen(true)}>
            <Plus className="h-4 w-4" /> Add edition
          </Button>
        </div>

        {data.editions.length === 0 ? (
          <p className="text-sm text-paper-500">No editions yet — add a physical copy or import a digital file.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {data.editions.map((edition) => (
              <li key={edition.id} className="flex flex-col gap-2 border-b border-paper-200 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-paper-400" />
                  <span className="text-sm font-medium text-paper-800">{FORMAT_LABELS[edition.format]}</span>
                  {edition.publisher && <span className="text-xs text-paper-500">· {edition.publisher}</span>}
                </div>
                {edition.format === 'PHYSICAL' && edition.copyId && <PhysicalSessionPanel copyId={edition.copyId} />}
                {edition.format !== 'PHYSICAL' && edition.copyId && (
                  <ContinueReadingButton journeyId={data.journeyId} edition={edition} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display text-lg text-paper-900">Shelves</h2>
        <ShelfAssignmentPanel workId={data.id} shelfIds={data.shelfIds} />
      </Card>

      {data.seriesName && <SeriesPanel seriesName={data.seriesName} siblings={data.seriesWorks} />}

      {isAddEditionOpen && (
        <AddEditionDialog
          workId={data.id}
          onClose={() => setIsAddEditionOpen(false)}
          onAdded={() => setIsAddEditionOpen(false)}
        />
      )}
    </div>
  );
}
