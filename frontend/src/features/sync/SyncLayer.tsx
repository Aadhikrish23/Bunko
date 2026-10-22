import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, NetworkError } from '../../lib/api/client';
import { getAccessToken, onAccessTokenChange } from '../../lib/api/token-store';
import { useAuth } from '../../lib/auth-context';
import { deviceLabel, getDeviceId } from '../../lib/device';
import { closeStaleLocalSessions } from '../../lib/offline/local-sessions';
import { flush, getSyncStatus, onFlushed, refreshPendingCount, setOnline } from '../../lib/offline/outbox';
import '../../lib/preference-registry';
import { pullPreferences } from '../../lib/preferences-sync';
import { SyncConflictPrompt } from './SyncConflictPrompt';
import { SyncStatusPill } from './SyncStatusPill';

const RETRY_INTERVAL_MS = 60_000;

// Data the outbox can change server-side; refreshed after a flush lands.
const SYNCED_QUERY_KEYS = [
  ['annotations'],
  ['bookmarks'],
  ['notes'],
  ['journal'],
  ['statistics'],
  ['works'],
  ['sync-conflicts'],
];

// Runs offline sync for the signed-in user (Phase 9). Everything here
// needs a real session, so it waits for an access token — after an
// offline start, that's once the network (and the session) are back.
export function SyncLayer() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function connect() {
      if (!getAccessToken() || !active) return;
      setOnline(true);
      await api
        .post('/sync/devices', { deviceId: getDeviceId(), label: deviceLabel(navigator.userAgent) })
        .catch(() => undefined);
      await pullPreferences().catch((err) => {
        if (err instanceof NetworkError) setOnline(false);
      });
      await closeStaleLocalSessions();
      await flush();
    }

    void refreshPendingCount();
    void connect();

    const offTokenChange = onAccessTokenChange((token) => {
      if (token) void connect();
    });
    const handleOnline = () => {
      setOnline(true);
      void connect();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const retry = window.setInterval(() => {
      if (getSyncStatus().pending > 0 && getAccessToken()) void flush();
    }, RETRY_INTERVAL_MS);
    const offFlushed = onFlushed(() => {
      SYNCED_QUERY_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    });

    return () => {
      active = false;
      offTokenChange();
      offFlushed();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(retry);
    };
  }, [user, queryClient]);

  if (!user) return null;
  return (
    <>
      <SyncStatusPill />
      <SyncConflictPrompt />
    </>
  );
}
