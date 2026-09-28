"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import type { User } from "./types";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await api<User>("/auth/me"));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ user, loading, setUser, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Redirects to /login when there is no session. */
export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace("/login");
  }, [auth.loading, auth.user, router]);
  return auth;
}

/** Redirects signed-in users away from /login and /register. */
export function useRedirectIfAuthed() {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!auth.loading && auth.user) router.replace("/dashboard");
  }, [auth.loading, auth.user, router]);
  return auth;
}
