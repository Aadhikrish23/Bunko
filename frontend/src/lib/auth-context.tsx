import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api/client';
import { getAccessToken, setAccessToken } from './api/token-store';
import type { AuthResponseData, AuthUser } from './api/types';

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
        setUser(profile);
      } catch {
        if (!cancelled) setAccessToken(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    restore();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<AuthResponseData>('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const data = await api.post<AuthResponseData>('/auth/register', { email, password, displayName });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
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
