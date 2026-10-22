import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { NetworkError, api } from './api/client';
import { getAccessToken, setAccessToken } from './api/token-store';
import type { AuthResponseData, AuthUser } from './api/types';
import { deleteUserDatabase, getOfflineUser, setOfflineUser } from './offline/idb';

// The last signed-in user's public profile, so the app can open offline
// (T-072). No token or password — those never touch localStorage.
const LAST_USER_KEY = 'bunko:last-user';

function rememberUser(user: AuthUser): void {
  setOfflineUser(user.id);
  try {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: user.id, email: user.email, displayName: user.displayName }));
  } catch {
    // Offline start just won't be available.
  }
}

function cachedUser(): AuthUser | null {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_USER_KEY) ?? 'null') as AuthUser | null;
    return value && typeof value.id === 'string' ? value : null;
  } catch {
    return null;
  }
}

function forgetUser(): void {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // Nothing stored.
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // On load, there's no access token in memory yet (it's never
    // persisted client-side) — try the httpOnly refresh cookie to
    // restore the session silently.
    //
    // `cancelled` guards against React StrictMode's dev-only double
    // invocation of this effect: refresh tokens rotate on every use
    // (T-008), so two concurrent restore() calls race — the second one's
    // refresh fails against the now-already-rotated cookie the first
    // call's response just set, and if that failure resolves *after*
    // the first call's success, it would clear the access token right
    // back out from under a `user` that's already set. Only the most
    // recent effect run is allowed to apply its result.
    let cancelled = false;

    async function restore() {
      try {
        const data = await api.post<{ accessToken: string }>('/auth/refresh');
        // Bail before writing anything shared (the token store) if a
        // newer effect run has already superseded this one — by the
        // time this await resolves, StrictMode's synchronous
        // mount/cleanup/remount cycle has already flipped `cancelled`
        // for a stale first run, so it never touches the token store at
        // all rather than writing then trying to "undo" it.
        if (cancelled) return;
        setAccessToken(data.accessToken);
        const profile = await api.get<AuthUser>('/users/me');
        if (cancelled) return;
        rememberUser(profile);
        setUser(profile);
      } catch (err) {
        if (cancelled) return;
        setAccessToken(null);
        // No network (not a rejected session): keep the last signed-in
        // user so their downloaded books still open (T-072). The real
        // session is restored when the network returns.
        const cached = err instanceof NetworkError ? cachedUser() : null;
        if (cached) {
          setOfflineUser(cached.id);
          setUser(cached);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    restore();

    return () => {
      cancelled = true;
    };
  }, []);

  // Started offline with a cached user: once the network is back, swap in
  // a real session — or sign out if the server no longer accepts it.
  useEffect(() => {
    async function reconnect() {
      if (getAccessToken() || !user) return;
      try {
        const data = await api.post<{ accessToken: string }>('/auth/refresh');
        setAccessToken(data.accessToken);
      } catch (err) {
        if (!(err instanceof NetworkError)) {
          setUser(null);
          setOfflineUser(null);
        }
      }
    }
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<AuthResponseData>('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    rememberUser(data.user);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const data = await api.post<AuthResponseData>('/auth/register', { email, password, displayName });
    setAccessToken(data.accessToken);
    rememberUser(data.user);
    setUser(data.user);
  }, []);

  // Signing out removes this user's offline data from the device too —
  // downloads, cached lists, and anything not yet synced (the caller warns
  // about the last one first).
  const logout = useCallback(() => {
    const offlineUserId = getOfflineUser();
    setAccessToken(null);
    setUser(null);
    setOfflineUser(null);
    forgetUser();
    if (offlineUserId) void deleteUserDatabase(offlineUserId);
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}
