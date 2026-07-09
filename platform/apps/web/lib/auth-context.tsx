"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "./api";

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  companyName: string | null;
  bio: string | null;
  role: string;
  isVerified: boolean;
  locale: string;
}

export interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  companyName?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  register: (data: RegisterData) => Promise<{ message: string }>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Try to restore session via refresh-token cookie on first load.
  useEffect(() => {
    (async () => {
      try {
        const { accessToken } = await apiFetch<{ accessToken: string }>("/auth/refresh", { method: "POST" });
        setToken(accessToken);
        const me = await apiFetch<User>("/auth/me", { token: accessToken });
        setUser(me);
      } catch {
        // no valid session — stay logged out
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** totpCode is only needed once the account has 2FA enrolled */
  async function login(email: string, password: string, totpCode?: string) {
    const res = await apiFetch<{ accessToken: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, totpCode }),
    });
    setToken(res.accessToken);
    setUser(res.user);
  }

  async function register(data: RegisterData) {
    return apiFetch<{ message: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
