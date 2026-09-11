import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <BookOpen className="h-8 w-8 text-moss-600" strokeWidth={1.5} />
          <h1 className="font-display text-2xl text-paper-900">Bunko</h1>
          <p className="text-sm italic text-paper-600">One Book. Multiple Formats. One Reading Journey.</p>
        </div>
        <div className="rounded-xl border border-paper-200 bg-paper-50 p-6 shadow-card">
          <h2 className="mb-1 font-display text-lg text-paper-900">{title}</h2>
          <p className="mb-6 text-sm text-paper-600">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
