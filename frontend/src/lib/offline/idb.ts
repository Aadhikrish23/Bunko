// A minimal promise wrapper over IndexedDB for Bunko's offline data
// (Phase 9). One database per user, so two accounts on one browser never
// see each other's downloads or pending changes, and signing out can
// delete exactly one user's data.

export type StoreName = 'downloads' | 'snapshots' | 'outbox' | 'sessions';

const VERSION = 1;
const connections = new Map<string, Promise<IDBDatabase>>();

let currentUserId: string | null = null;

// Set by the auth layer; offline features are a no-op without a user.
export function setOfflineUser(userId: string | null): void {
  currentUserId = userId;
}

export function getOfflineUser(): string | null {
  return currentUserId;
}

function dbName(userId: string): string {
  return `bunko-offline:${userId}`;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function open(userId: string): Promise<IDBDatabase> {
  let connection = connections.get(userId);
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName(userId), VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('downloads', { keyPath: 'editionId' });
        db.createObjectStore('snapshots', { keyPath: 'key' });
        db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        db.createObjectStore('sessions', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    connections.set(userId, connection);
    connection.catch(() => connections.delete(userId));
  }
  return connection;
}

async function store(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
  if (!currentUserId || typeof indexedDB === 'undefined') return null;
  const db = await open(currentUserId);
  return db.transaction(name, mode).objectStore(name);
}

export async function idbGet<T>(name: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const s = await store(name, 'readonly');
  return s ? ((await promisify(s.get(key))) as T | undefined) : undefined;
}

export async function idbGetAll<T>(name: StoreName): Promise<T[]> {
  const s = await store(name, 'readonly');
  return s ? ((await promisify(s.getAll())) as T[]) : [];
}

export async function idbPut<T>(name: StoreName, value: T): Promise<void> {
  const s = await store(name, 'readwrite');
  if (s) await promisify(s.put(value));
}

export async function idbDelete(name: StoreName, key: IDBValidKey): Promise<void> {
  const s = await store(name, 'readwrite');
  if (s) await promisify(s.delete(key));
}

export async function idbCount(name: StoreName): Promise<number> {
  const s = await store(name, 'readonly');
  return s ? promisify(s.count()) : 0;
}

export async function deleteUserDatabase(userId: string): Promise<void> {
  const connection = connections.get(userId);
  connections.delete(userId);
  if (connection) (await connection.catch(() => null))?.close();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(dbName(userId));
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}
