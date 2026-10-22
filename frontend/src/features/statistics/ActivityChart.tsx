import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { TrendBucket, TrendRange } from '../../lib/api/types';
import { axisLabelIndices, bucketLabel, compactNumber, formatMinutes, niceTicks } from './chart-format';

const PERIOD_NOUN: Record<TrendRange, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
  'all-time': 'period',
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function describe(bucket: TrendBucket, range: TrendRange): string {
  return `${bucketLabel(bucket.start, range, 'full')}: ${formatMinutes(bucket.minutesRead)}, ${plural(bucket.sessions, 'session')}, ${plural(bucket.pagesRead, 'page')}`;
}

// Single-series column chart of minutes read per bucket. Hover or arrow
// keys select a column; the tooltip, the live region, and the table view
// all carry the same values, so nothing is hover-only.
export function ActivityChart({ buckets, range }: { buckets: TrendBucket[]; range: TrendRange }) {
  const [active, setActive] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const hintId = useId();

  const max = Math.max(0, ...buckets.map((bucket) => bucket.minutesRead));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const labelled = axisLabelIndices(buckets.length);
  const isEmpty = max === 0;
  const activeBucket = active !== null ? buckets[active] : undefined;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = buckets.length - 1;
    const current = active ?? last;
    const next =
      event.key === 'ArrowLeft'
        ? Math.max(0, current - 1)
        : event.key === 'ArrowRight'
          ? Math.min(last, current + 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  function tooltipAnchor(index: number): string {
    const position = (index + 0.5) / buckets.length;
    if (position < 0.2) return '-15%';
    if (position > 0.8) return '-85%';
    return '-50%';
  }

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex">
        {/* y-axis ticks */}
        <div className="relative h-44 w-10 shrink-0" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-2 translate-y-1/2 text-[11px] tabular-nums text-paper-700"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {compactNumber(tick)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* gridlines: solid hairlines one step off the surface */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-44" aria-hidden="true">
            {ticks.map((tick) => (
              <div key={tick} className="absolute inset-x-0 h-px bg-paper-200" style={{ bottom: `${(tick / top) * 100}%` }} />
            ))}
          </div>

          <div
            ref={plotRef}
            role="group"
            tabIndex={0}
            aria-label={`Minutes read per ${PERIOD_NOUN[range]}`}
            aria-describedby={hintId}
            onKeyDown={handleKeyDown}
            onFocus={() => setActive((current) => current ?? buckets.length - 1)}
            onBlur={() => setActive(null)}
            onPointerLeave={() => {
              if (document.activeElement !== plotRef.current) setActive(null);
            }}
            className="focus-visible:focus-ring relative flex h-44 items-end gap-[2px] rounded-sm"
          >
            {buckets.map((bucket, index) => (
              <div
                key={bucket.start}
                className="flex h-full min-w-0 flex-1 items-end justify-center"
                onPointerEnter={() => setActive(index)}
              >
                {bucket.minutesRead > 0 && (
                  <div
                    className={`w-full max-w-[24px] rounded-t-[4px] ${active === index ? 'bg-chart-bar-hover' : 'bg-chart-bar'}`}
                    style={{ height: `max(2px, ${(bucket.minutesRead / top) * 100}%)` }}
                  />
                )}
              </div>
            ))}

            {isEmpty && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-paper-600">
                No reading sessions in this period yet.
              </p>
            )}

            {activeBucket && active !== null && (
              <div
                role="presentation"
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-paper-200 bg-paper-50 px-2.5 py-1.5 text-xs shadow-card"
                style={{
                  left: `${((active + 0.5) / buckets.length) * 100}%`,
                  bottom: `calc(${(activeBucket.minutesRead / top) * 100}% + 8px)`,
                  transform: `translateX(${tooltipAnchor(active)})`,
                }}
              >
                <p className="text-sm font-semibold text-paper-900">{formatMinutes(activeBucket.minutesRead)}</p>
                <p className="text-paper-700">{bucketLabel(activeBucket.start, range, 'full')}</p>
                <p className="text-paper-700">
                  {plural(activeBucket.sessions, 'session')} · {plural(activeBucket.pagesRead, 'page')}
                </p>
              </div>
            )}
          </div>

          {/* x-axis labels: ~6, always including the latest bucket */}
          <div className="relative flex h-6 gap-[2px]" aria-hidden="true">
            {buckets.map((bucket, index) => (
              <div key={bucket.start} className="relative min-w-0 flex-1">
                {labelled.has(index) && (
                  <span
                    className={`absolute top-1.5 whitespace-nowrap text-[11px] text-paper-700 ${
                      index === buckets.length - 1 && buckets.length > 1
                        ? 'right-0'
                        : index === 0 && buckets.length > 1
                          ? 'left-0'
                          : 'left-1/2 -translate-x-1/2'
                    }`}
                  >
                    {bucketLabel(bucket.start, range, 'axis')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Use the left and right arrow keys to read each {PERIOD_NOUN[range]}.
      </p>
      <p className="sr-only" aria-live="polite">
        {activeBucket ? describe(activeBucket, range) : ''}
      </p>

      <details className="text-sm">
        <summary className="focus-visible:focus-ring w-fit cursor-pointer rounded-md py-2 text-paper-700 hover:text-paper-900">
          View as table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-paper-700">
              <tr className="border-b border-paper-200">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Period
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Time read
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Sessions
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Pages
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-paper-800">
              {[...buckets].reverse().map((bucket) => (
                <tr key={bucket.start} className="border-b border-paper-100 last:border-0">
                  <th scope="row" className="py-1.5 pr-4 font-normal">
                    {bucketLabel(bucket.start, range, 'full')}
                  </th>
                  <td className="py-1.5 pr-4 text-right">{formatMinutes(bucket.minutesRead)}</td>
                  <td className="py-1.5 pr-4 text-right">{bucket.sessions}</td>
                  <td className="py-1.5 text-right">{bucket.pagesRead}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
