import { ArrowLeft, Clock, FileText, ImagePlus, Plus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { useDeleteWork, useUpdateWorkCover, useUpdateWorkStatus, useWork } from '../../lib/api/works';
import { errorMessage } from '../../lib/error-message';
import { BookSummaryPanel } from '../ai/BookSummaryPanel';
import { BookHighlights } from '../notes/BookHighlights';
import { NotesPanel } from '../notes/NotesPanel';
import { ReviewPanel } from '../reviews/ReviewPanel';
import { BookSoundtrackPanel } from '../soundtrack/BookSoundtrackPanel';
import { OfflineDownloadButton } from '../sync/OfflineDownloadButton';
import { LogSessionDialog } from '../journal/LogSessionDialog';
import { AddEditionDialog } from './AddEditionDialog';
import { BookCover } from './BookCover';
import { ContinueReadingButton } from './ContinueReadingButton';
import { CoverPhotoUpload } from './CoverPhotoUpload';
import { PhysicalSessionPanel } from './PhysicalSessionPanel';
import { SeriesPanel } from './SeriesPanel';
import { ShelfAssignmentPanel } from './ShelfAssignmentPanel';
import { STATUS_OPTIONS } from './StatusBadge';
import { cleanSynopsis } from './synopsis';

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

/** An ISO time as the reader's local yyyy-mm-dd, for a date input. */
function toDateInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function BookDetailPage() {
  const { workId } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const work = useWork(workId);
  const updateStatus = useUpdateWorkStatus();
  const updateCover = useUpdateWorkCover();
  const deleteWork = useDeleteWork();
  const [isAddEditionOpen, setIsAddEditionOpen] = useState(false);
  const [attachTo, setAttachTo] = useState<{ editionId: string; format: 'EPUB' | 'PDF' } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [logging, setLogging] = useState(false);
  const [isEditingCover, setIsEditingCover] = useState(false);

  if (work.isLoading) return <PageSpinner />;
  if (work.isError || !work.data) {
    return <ErrorBanner message={errorMessage(work.error, 'This book could not be found.')} />;
  }

  const { data } = work;

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate('/shelves')}
        className="focus-visible:focus-ring flex items-center gap-1.5 self-start text-sm text-paper-600 hover:text-paper-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to shelves
      </button>

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <div className="w-32 sm:w-36 flex-shrink-0">
          <BookCover title={data.title} coverImageUrl={data.coverImageUrl} />
          <button
            type="button"
            onClick={() => setIsEditingCover((v) => !v)}
            className="focus-visible:focus-ring mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-paper-300 py-1.5 text-xs font-medium text-paper-700 hover:bg-paper-100"
          >
            <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
            {isEditingCover ? 'Done' : 'Change cover'}
          </button>
          {isEditingCover && (
            <div className="mt-3 flex gap-3 rounded-md border border-paper-200 bg-paper-50 p-3">
              <CoverPhotoUpload
                label="Cover photo"
                url={data.coverImageUrl}
                onChange={(url) => updateCover.mutate({ workId: data.id, coverImageUrl: url })}
              />
              <CoverPhotoUpload
                label="Spine photo"
                url={data.spineImageUrl}
                onChange={(url) => updateCover.mutate({ workId: data.id, spineImageUrl: url })}
              />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-3 w-full">
          <div>
            <h1 className="font-display text-2xl text-paper-900">{data.title}</h1>
            <p className="mt-1 text-paper-600">{data.authors.join(', ') || 'Unknown author'}</p>
            {data.seriesName && <p className="text-sm italic text-paper-700">{data.seriesName}</p>}
          </div>

          {data.description && <Synopsis text={cleanSynopsis(data.description)} />}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label htmlFor={`status-${data.id}`} className="text-sm text-paper-700">
              Status
            </label>
            <select
              id={`status-${data.id}`}
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
            {data.status === 'FINISHED' && (
              // Editable: moving a backlog over means books finished long ago (R4-05).
              <label className="flex items-center gap-2 text-sm text-paper-700">
                {data.finishedAt ? 'Finished on' : 'Finished on (add the date)'}
                <input
                  type="date"
                  value={data.finishedAt ? toDateInput(data.finishedAt) : ''}
                  max={toDateInput(new Date().toISOString())}
                  onChange={(e) =>
                    updateStatus.mutate({ workId: data.id, finishedAt: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null })
                  }
                  className="focus-visible:focus-ring rounded-md border border-paper-300 bg-paper-50 px-2 py-1 text-sm text-paper-800"
                />
              </label>
            )}
          </div>

          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="focus-visible:focus-ring flex items-center gap-1.5 self-start text-sm text-paper-700 hover:text-ember-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove from library
          </button>
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg text-paper-900">Editions</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setLogging(true)}>
              <Clock className="h-4 w-4" /> Log reading
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setIsAddEditionOpen(true)}>
              <Plus className="h-4 w-4" /> Add edition
            </Button>
          </div>
        </div>

        {data.editions.length === 0 ? (
          <p className="text-sm text-paper-700">No editions yet — add a physical copy or import a digital file.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {data.editions.map((edition) => (
              <li key={edition.id} className="flex flex-col gap-2 border-b border-paper-200 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-paper-400" />
                  <span className="text-sm font-medium text-paper-800">{FORMAT_LABELS[edition.format]}</span>
                  {edition.publisher && <span className="text-xs text-paper-700">· {edition.publisher}</span>}
                </div>
                {edition.format === 'PHYSICAL' && edition.copyId && (
                  <PhysicalSessionPanel copyId={edition.copyId} workId={data.id} />
                )}
                {edition.format !== 'PHYSICAL' && edition.copyId && (
                  <div className="flex flex-wrap items-center gap-3">
                    <ContinueReadingButton journeyId={data.journeyId} edition={edition} coverImageUrl={data.coverImageUrl} />
                    <OfflineDownloadButton editionId={edition.id} title={data.title} />
                  </div>
                )}
                {edition.format !== 'PHYSICAL' && !edition.copyId && (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-paper-700">No file yet. Upload your {FORMAT_LABELS[edition.format]} to read it here.</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setAttachTo({ editionId: edition.id, format: edition.format as 'EPUB' | 'PDF' })}
                    >
                      <Upload className="h-4 w-4" /> Upload file
                    </Button>
                  </div>
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

      <Card className="p-5">
        <h2 className="mb-3 font-display text-lg text-paper-900">Your review</h2>
        <ReviewPanel workId={data.id} />
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display text-lg text-paper-900">Notes</h2>
        <NotesPanel workId={data.id} />
        <BookSummaryPanel workId={data.id} />
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display text-lg text-paper-900">Highlights &amp; quotes</h2>
        <BookHighlights
          editionIds={data.editions.filter((e) => e.format !== 'PHYSICAL' && e.copyId).map((e) => e.id)}
        />
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display text-lg text-paper-900">Soundtrack</h2>
        <BookSoundtrackPanel workId={data.id} />
      </Card>

      {data.seriesName && <SeriesPanel seriesName={data.seriesName} siblings={data.seriesWorks} />}

      {logging && <LogSessionDialog workId={data.id} onClose={() => setLogging(false)} />}

      {attachTo && (
        <AddEditionDialog workId={data.id} attachTo={attachTo} onClose={() => setAttachTo(null)} onAdded={() => setAttachTo(null)} />
      )}

      {confirmRemove && (
        <ConfirmDialog
          title={`Remove ${data.title}?`}
          message="It comes off your shelves too. Your reading history, notes and review are kept, and you can add it back any time."
          confirmLabel="Remove from library"
          isConfirming={deleteWork.isPending}
          onConfirm={async () => {
            await deleteWork.mutateAsync(data.id);
            setConfirmRemove(false);
            navigate('/shelves');
          }}
          onClose={() => setConfirmRemove(false)}
        />
      )}

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
