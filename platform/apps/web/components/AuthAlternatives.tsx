"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api";

declare global {
  interface Window { google?: any }
}

/**
 * "Continue with Google" for the login and register pages.
 *
 * Hides itself entirely when GOOGLE_CLIENT_ID isn't configured, so the page
 * never shows a dead button.
 */
export default function AuthAlternatives() {
  const router = useRouter();
  const { setUser, setToken } = useAuth();
  const [google, setGoogle] = useState<{ enabled: boolean; clientId: string | null }>({ enabled: false, clientId: null });
  const [err, setErr] = useState("");
  const gBtn = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<{ google: boolean; googleClientId: string | null }>("/auth/providers")
      .then(p => setGoogle({ enabled: p.google, clientId: p.googleClientId }))
      .catch(() => {});
  }, []);

  const onGoogle = useCallback(async (resp: { credential: string }) => {
    setErr("");
    try {
      const r = await apiFetch<{ accessToken: string; user: any }>("/auth/google", {
        method: "POST", body: JSON.stringify({ credential: resp.credential }),
      });
      setToken(r.accessToken); setUser(r.user);
      router.push("/account");
    } catch (e: any) { setErr(e.message); }
  }, [router, setToken, setUser]);

  // load Google Identity Services and render the official button
  useEffect(() => {
    if (!google.enabled || !google.clientId) return;
    const id = "gsi-script";
    const init = () => {
      if (!window.google || !gBtn.current) return;
      window.google.accounts.id.initialize({ client_id: google.clientId, callback: onGoogle });
      window.google.accounts.id.renderButton(gBtn.current, { theme: "outline", size: "large", width: 320, text: "continue_with", shape: "pill" });
    };
    if (document.getElementById(id)) { init(); return; }
    const s = document.createElement("script");
    s.id = id; s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [google, onGoogle]);

  if (!google.enabled) return null; // nothing to show

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 16px", color: "var(--muted)", fontSize: 12 }}>
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />หรือ<span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div ref={gBtn} />
      </div>
      {err && <p className="err" style={{ marginTop: 10, textAlign: "center" }}>{err}</p>}
    </div>
  );
}
