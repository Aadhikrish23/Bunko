import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';
import { Modal } from '../../components/ui/Modal';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { api } from '../../lib/api/client';
import { getAccessToken, onAccessTokenChange } from '../../lib/api/token-store';
import type { SyncConflict, SyncConflictPosition } from '../../lib/api/types';
import { getDeviceId } from '../../lib/device';
import { errorMessage } from '../../lib/error-message';
import { getSyncStatus, subscribeSyncStatus } from '../../lib/offline/outbox';
import { describePosition } from './conflict-format';

function useHasToken(): boolean {
  return useSyncExternalStore(onAccessTokenChange, () => getAccessToken() !== null);
}

function where(position: SyncConflictPosition): string {
  const device = position.deviceId === getDeviceId() ? 'this device' : (position.deviceLabel ?? 'another device');
  const when = new Date(position.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return `On ${device} · ${when}`;
}

// SRS §21.2 "user resolution for conflicting reading positions" with §30's
// wording. "Decide later" only hides it for this visit — the conflict
// stays pending on the server.
export function SyncConflictPrompt() {
  const queryClient = useQueryClient();
  const online = useSyncExternalStore(subscribeSyncStatus, () => getSyncStatus().online);
  const hasToken = useHasToken();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const conflicts = useQuery({
    queryKey: ['sync-conflicts'],
    queryFn: () => api.get<SyncConflict[]>('/sync/conflicts'),
    enabled: online && hasToken,
  });
  const resolve = useMutation({
    mutationFn: ({ id, keep }: { id: string; keep: 'SERVER' | 'DEVICE' }) =>
      api.post(`/sync/conflicts/${id}/resolve`, { keep }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sync-conflicts'] });
      void queryClient.invalidateQueries({ queryKey: ['reader-manifest'] });
    },
  });

  const conflict = conflicts.data?.find((candidate) => !dismissed.has(candidate.id));
  if (!conflict) return null;

  const options: Array<{ keep: 'SERVER' | 'DEVICE'; position: SyncConflictPosition }> = [
    { keep: 'DEVICE', position: conflict.device },
    { keep: 'SERVER', position: conflict.server },
  ];

  return (
    <Modal
      title="Choose where to continue"
      onClose={() => setDismissed((previous) => new Set(previous).add(conflict.id))}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-paper-700">
          {conflict.title ? <span className="font-medium text-paper-900">{conflict.title}</span> : 'This book'} was
          updated on another device. Choose which reading position to continue from.
        </p>
        {resolve.isError && <ErrorBanner message={errorMessage(resolve.error, 'Could not save your choice.')} />}
        {options.map(({ keep, position }) => (
          <button
            key={keep}
            type="button"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ id: conflict.id, keep })}
            className="focus-visible:focus-ring flex min-h-[44px] flex-col items-start rounded-lg border border-paper-300 bg-paper-50 px-4 py-3 text-left hover:border-moss-500 hover:bg-moss-50 disabled:opacity-60"
          >
            <span className="text-sm font-semibold text-paper-900">{describePosition(position)}</span>
            <span className="text-xs text-paper-700">{where(position)}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDismissed((previous) => new Set(previous).add(conflict.id))}
          className="focus-visible:focus-ring self-end rounded-md px-3 py-2 text-sm text-paper-700 hover:text-paper-900"
        >
          Decide later
        </button>
      </div>
    </Modal>
  );
}
