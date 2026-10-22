import { Card } from '../../components/ui/Card';
import type { BreakdownEntry } from '../../lib/api/types';

const MAX_ROWS = 6;

interface BreakdownListProps {
  title: string;
  entries: BreakdownEntry[];
  formatLabel: (label: string | null) => string;
}

// A ranked list of horizontal bars, one hue for every row: the bars show
// magnitude, not identity, so they never take a categorical palette.
// Values sit at the bar tip in a text token.
export function BreakdownList({ title, entries, formatLabel }: BreakdownListProps) {
  const shown = entries.slice(0, MAX_ROWS);
  const hidden = entries.length - shown.length;
  const max = shown[0]?.count ?? 0;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="text-sm font-semibold text-paper-900">{title}</h3>
      {shown.length === 0 ? (
        <p className="text-sm text-paper-600">No books yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shown.map((entry) => {
            const label = formatLabel(entry.label);
            return (
              <li key={entry.label ?? '__none'} className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 text-sm">
                <span className={`truncate ${entry.label === null ? 'text-paper-600' : 'text-paper-800'}`} title={label}>
                  {label}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2 min-w-[2px] rounded-r-[4px] bg-chart-bar"
                    style={{ width: `calc((100% - 2.5rem) * ${max ? entry.count / max : 0})` }}
                  />
                  <span className="text-xs tabular-nums text-paper-700">
                    <span className="sr-only">{label}: </span>
                    {entry.count}
                    <span className="sr-only"> {entry.count === 1 ? 'book' : 'books'}</span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {hidden > 0 && <p className="text-xs text-paper-600">+{hidden} more</p>}
    </Card>
  );
}
