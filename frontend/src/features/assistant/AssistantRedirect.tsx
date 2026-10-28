import { useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { AppShellContext } from '../../components/layout/AppShell';

/**
 * The old /assistant page is gone (Phase 13, T-112 — the Assistant is now
 * a floating launcher, not its own page), but old bookmarks/links to it
 * should still work: redirect to Shelves and open the drawer there.
 */
export function AssistantRedirect() {
  const { openAssistant } = useOutletContext<AppShellContext>();
  const navigate = useNavigate();
  useEffect(() => {
    openAssistant();
    navigate('/shelves', { replace: true });
    // Fires once, right after this route mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
