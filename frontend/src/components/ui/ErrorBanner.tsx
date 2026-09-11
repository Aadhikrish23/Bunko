import { AlertTriangle } from 'lucide-react';

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-ember-500/30 bg-ember-400/10 px-3 py-2 text-sm text-ember-600">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
      <span>{message}</span>
    </div>
  );
}
