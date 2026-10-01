import { useEffect, useState } from 'react';

// SRS §31 requires respecting the OS "reduce motion" preference. Components
// with spatial animation (the reader's page-turn, hover-lift) read this to
// skip the spatial movement while still changing content/state immediately
// — the content change itself is the feedback, not the transform.
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReduced(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return reduced;
}
