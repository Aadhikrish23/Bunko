import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-paper-200 bg-paper-50 shadow-card ${className}`}
      {...rest}
    />
  );
}
