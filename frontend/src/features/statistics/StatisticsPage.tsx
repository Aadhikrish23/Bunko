import { BookCheck, Clock, Flame } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PageSpinner } from '../../components/ui/Spinner';
import { useStatistics } from '../../lib/api/statistics';
import { errorMessage } from '../../lib/error-message';

function StatCard({ icon: Icon, label, value }: { icon: typeof BookCheck; label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <Icon className="h-5 w-5 text-moss-600" strokeWidth={1.5} />
      <div>
        <p className="font-display text-3xl text-paper-900">{value}</p>
        <p className="text-sm text-paper-600">{label}</p>
      </div>
    </Card>
  );
}

export function StatisticsPage() {
  const statistics = useStatistics();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-paper-900">Statistics</h1>
        <p className="mt-1 text-sm text-paper-600">Your reading, at a glance.</p>
      </div>

      {statistics.isLoading && <PageSpinner />}
      {statistics.isError && <ErrorBanner message={errorMessage(statistics.error, 'Could not load statistics.')} />}

      {statistics.data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={BookCheck} label="Books completed" value={String(statistics.data.booksCompleted)} />
          <StatCard icon={Clock} label="Minutes read" value={String(statistics.data.totalMinutesRead)} />
          <StatCard icon={Flame} label="Current streak (days)" value={String(statistics.data.currentStreakDays)} />
        </div>
      )}
    </div>
  );
}
