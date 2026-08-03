'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';

/**
 * Auth is the only genuinely *global client* state in this application, and it
 * changes twice per session. React Context is the correct tool; see NOTES.md
 * for why no external store (Redux/Zustand) was introduced.
 */
interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = 'auction.session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore a previous session, but re-validate the token against the server
  // rather than trusting whatever is in localStorage.
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!stored) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { token: savedToken } = JSON.parse(stored) as { token: string };
        const { user: verified } = await api.me(savedToken);
        if (!cancelled) {
          setUser(verified);
          setToken(savedToken);
        }
      } catch {
        if (!cancelled) window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const result = await api.login(email, password);
      setUser(result.user);
      setToken(result.token);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: result.token }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.';
      setError(message);
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setError(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, token, isLoading, error, login, logout, isAdmin: user?.role === 'ADMIN' }),
    [user, token, isLoading, error, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
