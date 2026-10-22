import { NetworkError } from '../api/client';
import { setOnline } from './outbox';

export function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// Try the server; only if the request never reached it (not an error the
// server returned) take the offline path instead.
export async function onlineOr<T>(online: () => Promise<T>, offline: () => Promise<T>): Promise<T> {
  if (browserOffline()) return offline();
  try {
    return await online();
  } catch (err) {
    if (!(err instanceof NetworkError)) throw err;
    setOnline(false);
    return offline();
  }
}
