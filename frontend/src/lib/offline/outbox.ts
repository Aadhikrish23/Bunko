import { ApiError, NetworkError, api } from '../api/client';
import { idbDelete, idbGetAll, idbPut, getOfflineUser } from './idb';
import { flushablePrefix, type OutboxEvent, type SyncEventType } from './outbox-logic';

export interface SyncStatus {
  pending: number;
  syncing: boolean;
  online: boolean;
  lastError: string | null;
}

interface EventResult {
  id: string;
  status: 'APPLIED' | 'SKIPPED' | 'CONFLICT' | 'REJECTED';
}

const BATCH_SIZE = 100;

let status: SyncStatus = {
  pending: 0,
  syncing: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastError: null,
};
const listeners = new Set<(status: SyncStatus) => void>();
const afterFlushListeners = new Set<(result: { sent: number; conflicts: number }) => void>();

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener(status));
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Lets the UI refresh server data (and check for conflicts) once queued
// changes have landed.
export function onFlushed(listener: (result: { sent: number; conflicts: number }) => void): () => void {
  afterFlushListeners.add(listener);
  return () => afterFlushListeners.delete(listener);
}

export function setOnline(online: boolean): void {
  setStatus({ online });
}

export async function pendingEvents(): Promise<OutboxEvent[]> {
  return idbGetAll<OutboxEvent>('outbox');
}

export async function refreshPendingCount(): Promise<void> {
  setStatus({ pending: (await pendingEvents()).length });
}

// Offline sessions still being read: events tied to them are held back
// (see flushablePrefix). Registered by the local-session module.
let openSessionIds: () => Promise<Set<string>> = async () => new Set();
export function setOpenSessionSource(source: () => Promise<Set<string>>): void {
  openSessionIds = source;
}

export async function enqueue(type: SyncEventType, payload: Record<string, unknown>): Promise<void> {
  if (!getOfflineUser()) return;
  const event: OutboxEvent = { id: crypto.randomUUID(), type, createdAt: new Date().toISOString(), payload };
  await idbPut('outbox', event);
  await refreshPendingCount();
  if (status.online) void flush();
}

let inFlight: Promise<void> | null = null;

// Single-flight: concurrent callers share one run. Stops quietly on a
// network failure (it'll run again on reconnect); a batch the server
// rejects as a whole stays queued with the error shown, never dropped.
export function flush(): Promise<void> {
  if (!inFlight) {
    inFlight = run().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function run(): Promise<void> {
  if (!getOfflineUser()) return;
  let sent = 0;
  let conflicts = 0;
  setStatus({ syncing: true });
  try {
    for (;;) {
      const batch = flushablePrefix(await pendingEvents(), await openSessionIds()).slice(0, BATCH_SIZE);
      if (batch.length === 0) break;

      const results = await api.post<EventResult[]>('/sync/events', {
        events: batch.map(({ id, type, createdAt, payload }) => ({ id, type, createdAt, payload })),
      });
      const done = new Set(results.map((result) => result.id));
      for (const event of batch) {
        if (done.has(event.id) && event.seq !== undefined) await idbDelete('outbox', event.seq);
      }
      sent += results.length;
      conflicts += results.filter((result) => result.status === 'CONFLICT').length;
      if (done.size < batch.length) break;
    }
    setStatus({ lastError: null, online: true });
  } catch (err) {
    if (err instanceof NetworkError) {
      setStatus({ online: false });
    } else {
      setStatus({ lastError: err instanceof ApiError ? err.message : 'Sync failed' });
    }
  } finally {
    await refreshPendingCount();
    setStatus({ syncing: false });
  }
  if (sent > 0) afterFlushListeners.forEach((listener) => listener({ sent, conflicts }));
}
