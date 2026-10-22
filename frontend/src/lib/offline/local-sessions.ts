import { idbDelete, idbGet, idbGetAll, idbPut } from './idb';
import { enqueue, setOpenSessionSource } from './outbox';

// A reading session started with no network (T-074). It lives only on
// this device until it ends, then uploads as one SESSION_RECORDED event;
// its id becomes the server session's id.
export interface LocalSession {
  id: string;
  editionId: string;
  copyId: string;
  startTime: string;
  lastActivity: string;
  startPosition: string | null;
  position: string | null;
}

export const OFFLINE_SESSION_PREFIX = 'offline:';

// A session nobody has touched for this long was abandoned (tab closed,
// device slept) and is closed at its last activity.
const STALE_AFTER_MS = 30 * 60_000;

export function isOfflineSessionId(sessionId: string): boolean {
  return sessionId.startsWith(OFFLINE_SESSION_PREFIX);
}

function rawId(sessionId: string): string {
  return sessionId.slice(OFFLINE_SESSION_PREFIX.length);
}

setOpenSessionSource(async () => new Set((await idbGetAll<LocalSession>('sessions')).map((session) => session.id)));

export async function startLocalSession(input: {
  editionId: string;
  copyId: string;
  startPosition: string | null;
}): Promise<string> {
  // Re-opening (or a query refetch on window focus) continues the open
  // session for this book rather than starting a second one — the same
  // rule the server applies to ACTIVE sessions.
  const open = (await idbGetAll<LocalSession>('sessions')).find((session) => session.editionId === input.editionId);
  if (open) return OFFLINE_SESSION_PREFIX + open.id;

  const now = new Date().toISOString();
  const session: LocalSession = { id: crypto.randomUUID(), lastActivity: now, startTime: now, position: null, ...input };
  await idbPut('sessions', session);
  return OFFLINE_SESSION_PREFIX + session.id;
}

export async function recordLocalProgress(sessionId: string, position: string): Promise<void> {
  const session = await idbGet<LocalSession>('sessions', rawId(sessionId));
  if (!session) return;
  await idbPut('sessions', { ...session, position, lastActivity: new Date().toISOString() });
}

async function close(session: LocalSession, endTime: string, endPosition: string | null, reflection?: string | null) {
  // Queue first, then forget the session: deleting it is what releases
  // the annotations held back behind it.
  await enqueue('SESSION_RECORDED', {
    sessionId: session.id,
    copyId: session.copyId,
    startTime: session.startTime,
    endTime,
    startPosition: session.startPosition,
    endPosition: endPosition ?? session.position,
    reflection: reflection ?? null,
  });
  await idbDelete('sessions', session.id);
}

export async function endLocalSession(
  sessionId: string,
  input: { endPosition?: string; reflection?: string | null },
): Promise<{ durationSeconds: number } | null> {
  const session = await idbGet<LocalSession>('sessions', rawId(sessionId));
  if (!session) return null;
  const endTime = new Date();
  await close(session, endTime.toISOString(), input.endPosition ?? null, input.reflection);
  return { durationSeconds: Math.round((endTime.getTime() - new Date(session.startTime).getTime()) / 1000) };
}

// Leaving the reader offline ends every open local session — the server
// never knew they existed, so there's nothing to "pause".
export async function endAllLocalSessions(): Promise<void> {
  const now = new Date().toISOString();
  for (const session of await idbGetAll<LocalSession>('sessions')) {
    await close(session, now, null);
  }
}

export async function closeStaleLocalSessions(now = Date.now()): Promise<void> {
  for (const session of await idbGetAll<LocalSession>('sessions')) {
    if (now - new Date(session.lastActivity).getTime() > STALE_AFTER_MS) {
      await close(session, session.lastActivity, null);
    }
  }
}
