"use client";
import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser } from "@/app/types/auth";
import { apiFetch } from "@/app/lib/api";

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  setAuth: (user: AuthUser) => void;
  updateUser: (user: AuthUser) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const attempt = async (retries = 2) => {
      try {
        const profile = await apiFetch<AuthUser>("/api/auth/me", {
          signal: controller.signal,
        });
        if (cancelled) return;
        setUser(profile);
        setLoading(false);
      } catch (error) {
        // Only sign out on explicit auth failure; retry on transient errors.
        const status = (error as any)?.status;
        const message = (error as Error)?.message || "";
        if (status === 401 || message.includes("Authentication required") || message.includes("Invalid or expired token")) {
          if (!cancelled) {
            setUser(null);
            setLoading(false);
          }
          return;
        }
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 250));
          if (!cancelled) {
            return attempt(retries - 1);
          }
          return;
        }
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
      }
    };
    attempt();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const setAuth = useCallback((newUser: AuthUser) => {
    setUser(newUser);
  }, []);

  const updateUser = useCallback((updatedUser: AuthUser) => {
    setUser(updatedUser);
  }, []);

  const signOut = useCallback(() => {
    apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setAuth, updateUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
