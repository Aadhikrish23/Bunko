import type { ReadingStatus } from '../../lib/api/types';

const LABELS: Record<ReadingStatus, string> = {
  WANT_TO_READ: 'Want to Read',
  READING: 'Reading',
  FINISHED: 'Finished',
  DID_NOT_FINISH: 'Did Not Finish',
};

const STYLES: Record<ReadingStatus, string> = {
  WANT_TO_READ: 'bg-paper-200 text-paper-700',
  READING: 'bg-moss-100 text-moss-700',
  FINISHED: 'bg-ember-400/15 text-ember-600',
  DID_NOT_FINISH: 'bg-paper-200 text-paper-500',
};

export function StatusBadge({ status }: { status: ReadingStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}

export const STATUS_OPTIONS: { value: ReadingStatus; label: string }[] = Object.entries(LABELS).map(
  ([value, label]) => ({ value: value as ReadingStatus, label }),
);
