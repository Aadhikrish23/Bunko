import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { SyncDevice } from '../../lib/api/types';

// The devices this account reads on (T-071), so a sync conflict's "on
// another device" is something the reader can recognise.
export function DevicesList() {
  const devices = useQuery({ queryKey: ['sync-devices'], queryFn: () => api.get<SyncDevice[]>('/sync/devices') });

  if (devices.isLoading) return <p className="text-sm text-paper-600">Loading devices…</p>;
  if (devices.isError || !devices.data) return <p className="text-sm text-paper-600">Devices are shown when you’re online.</p>;

  return (
    <ul className="flex flex-col divide-y divide-paper-200">
      {devices.data.map((device) => (
        <li key={device.deviceId} className="flex items-center justify-between gap-2 py-2">
          <span className="text-sm text-paper-900">
            {device.label}
            {device.current && (
              <span className="ml-2 rounded-full bg-moss-100 px-2 py-0.5 text-[11px] font-semibold text-moss-700">
                This device
              </span>
            )}
          </span>
          <span className="text-xs text-paper-600">
            Last seen {new Date(device.lastSeenAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </span>
        </li>
      ))}
    </ul>
  );
}
