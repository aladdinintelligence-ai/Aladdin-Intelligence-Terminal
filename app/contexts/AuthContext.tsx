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
    apiFetch<AuthUser>("/api/auth/me")
      .then((profile) => {
        setUser(profile);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
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
