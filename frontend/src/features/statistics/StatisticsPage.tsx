import { Flame } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card } from '../../components/ui/Card';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { useStatistics, useTrends } from '../../lib/api/statistics';
import type { TrendRange } from '../../lib/api/types';
import { errorMessage } from '../../lib/error-message';
import { ActivityChart } from './ActivityChart';
import { BreakdownList } from './BreakdownList';
import { formatMinutes, languageLabel, RANGE_WINDOW_LABEL } from './chart-format';

const RANGES: { value: TrendRange; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'all-time', label: 'All time' },
];

const FORMAT_LABELS: Record<string, string> = { PHYSICAL: 'Physical', EPUB: 'EPUB', PDF: 'PDF' };

const CHART_SUBTITLE: Record<TrendRange, string> = {
  daily: 'Per day, last 30 days',
  weekly: 'Per week (Monday start), last 12 weeks',
  monthly: 'Per month, last 12 months',
  yearly: 'Per year, since your first session',
  'all-time': 'Everything, in one total',
};

function StatTile({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="flex items-center gap-1.5 text-sm text-paper-700">
        {icon}
        {label}
      </p>
      <p className="text-2xl font-semibold text-paper-900">{value}</p>
      {hint && <p className="text-xs text-paper-600">{hint}</p>}
    </Card>
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function StatisticsPage() {
  const statistics = useStatistics();
  const [range, setRange] = useState<TrendRange>('daily');
  const trends = useTrends(range);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl text-paper-900">Statistics</h1>
        <p className="mt-1 text-sm text-paper-600">Your reading, at a glance.</p>
      </div>

      {statistics.isLoading && <PageSpinner />}
      {statistics.isError && <ErrorBanner message={errorMessage(statistics.error, 'Could not load statistics.')} />}

      {statistics.data && (
        <>
          <section aria-labelledby="stats-overview" className="flex flex-col gap-3">
            <h2 id="stats-overview" className="font-display text-lg text-paper-900">
              All time
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="Books completed" value={String(statistics.data.booksCompleted)} />
              <StatTile label="Time read" value={formatMinutes(statistics.data.totalMinutesRead)} />
              <StatTile
                label="Pages read"
                value={statistics.data.pagesRead.toLocaleString()}
                hint="EPUB pages are estimated"
              />
              <StatTile label="Reading sessions" value={statistics.data.totalSessions.toLocaleString()} />
              <StatTile
                label="Average session"
                value={
                  statistics.data.averageSessionMinutes === null
                    ? '—'
                    : formatMinutes(Math.round(statistics.data.averageSessionMinutes))
                }
              />
              <StatTile
                label="Current streak"
                value={plural(statistics.data.currentStreakDays, 'day')}
                icon={<Flame aria-hidden="true" className="h-4 w-4 text-ember-500" />}
              />
              <StatTile label="Longest streak" value={plural(statistics.data.longestStreakDays, 'day')} />
              <StatTile
                label="Reading pace"
                value={
                  statistics.data.pace.pagesPerHour === null ? '—' : `${statistics.data.pace.pagesPerHour} pages/hr`
                }
                hint={
                  statistics.data.pace.pagesPerSession === null
                    ? 'Appears after 3+ sessions with page progress'
                    : `${statistics.data.pace.pagesPerSession} pages per session`
                }
              />
            </div>
          </section>

          <section aria-labelledby="stats-library" className="flex flex-col gap-3">
            <h2 id="stats-library" className="font-display text-lg text-paper-900">
              Your library
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <BreakdownList
                title="Genres"
                entries={statistics.data.breakdowns.byGenre}
                formatLabel={(label) => label ?? 'No genre'}
              />
              <BreakdownList
                title="Authors"
                entries={statistics.data.breakdowns.byAuthor}
                formatLabel={(label) => label ?? 'Unknown author'}
              />
              <BreakdownList
                title="Languages"
                entries={statistics.data.breakdowns.byLanguage}
                formatLabel={(label) => (label ? languageLabel(label) : 'Not recorded')}
              />
              <BreakdownList
                title="Formats"
                entries={statistics.data.breakdowns.byFormat}
                formatLabel={(label) => (label ? (FORMAT_LABELS[label] ?? label) : 'Unknown')}
              />
            </div>
          </section>
        </>
      )}

      {/* The range filter sits above, and scopes, everything after it. */}
      <section aria-labelledby="stats-activity" className="flex flex-col gap-3">
        <h2 id="stats-activity" className="font-display text-lg text-paper-900">
          Reading activity
        </h2>

        <fieldset>
          <legend className="sr-only">Time range</legend>
          <div className="grid w-full grid-cols-5 rounded-lg border border-paper-200 bg-paper-100 p-1 sm:inline-flex sm:w-auto">
            {RANGES.map((option) => (
              <label key={option.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="trend-range"
                  value={option.value}
                  checked={range === option.value}
                  onChange={() => setRange(option.value)}
                  className="peer sr-only"
                />
                <span className="flex min-h-[44px] items-center justify-center rounded-md px-1 text-xs font-medium text-paper-700 transition-colors hover:text-paper-900 peer-checked:bg-paper-50 peer-checked:text-paper-900 peer-checked:shadow-sm peer-focus-visible:focus-ring sm:px-3 sm:text-sm">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {trends.isError && <ErrorBanner message={errorMessage(trends.error, 'Could not load reading activity.')} />}
        {trends.isLoading && <PageSpinner />}

        {trends.data && (
          <div className={`flex flex-col gap-3 motion-safe:transition-opacity ${trends.isPlaceholderData ? 'opacity-60' : ''}`}>
            <p className="text-sm text-paper-700">
              <span className="font-semibold text-paper-900">{formatMinutes(trends.data.totals.minutesRead)}</span> read
              across <span className="font-semibold text-paper-900">{plural(trends.data.totals.sessions, 'session')}</span>{' '}
              and <span className="font-semibold text-paper-900">{plural(trends.data.totals.pagesRead, 'page')}</span>{' '}
              {RANGE_WINDOW_LABEL[trends.data.range]}.
            </p>
            <Card className="p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-paper-900">Minutes read</h3>
                <p className="text-xs text-paper-600">{CHART_SUBTITLE[trends.data.range]}</p>
              </div>
              <ActivityChart buckets={trends.data.buckets} range={trends.data.range} />
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}
