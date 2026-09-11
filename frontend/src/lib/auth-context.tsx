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
    async function restore() {
      try {
        const data = await api.post<{ accessToken: string }>('/auth/refresh');
        setAccessToken(data.accessToken);
        const profile = await api.get<AuthUser>('/users/me');
        setUser(profile);
      } catch {
        setAccessToken(null);
      } finally {
        setIsLoading(false);
      }
    }
    restore();
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
