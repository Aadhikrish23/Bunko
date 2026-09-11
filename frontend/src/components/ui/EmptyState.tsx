import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-paper-300 px-6 py-16 text-center">
      <Icon className="h-8 w-8 text-paper-400" strokeWidth={1.5} />
      <h3 className="font-display text-lg text-paper-800">{title}</h3>
      {description && <p className="max-w-sm text-sm text-paper-600">{description}</p>}
      {action}
    </div>
  );
}
