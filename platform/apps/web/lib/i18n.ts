"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-context";
import { apiFetch } from "./api";

/**
 * The storefront's languages (the landing page and /tracking): Thai, English,
 * Japanese. Text is written inline where it's used, as L(th, en, ja).
 */
export type Lang = "th" | "en" | "ja";
export const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: "th", label: "TH", name: "ไทย" },
  { id: "en", label: "EN", name: "English" },
  { id: "ja", label: "JA", name: "日本語" },
];

/** L(th, en, ja): the text for this language (Japanese falls back to English where it isn't written) */
export const tri = (lang: Lang) => <T,>(th: T, en: T, ja?: T): T => (lang === "th" ? th : lang === "ja" ? (ja ?? en) : en);

/** the locale for dates and numbers */
export const locale = (lang: Lang) => (lang === "th" ? "th-TH" : lang === "ja" ? "ja-JP" : "en-GB");

const KEY = "ax-lang";
const isLang = (v: unknown): v is Lang => v === "th" || v === "en" || v === "ja";

/**
 * The visitor's language, remembered between pages and visits (this browser
 * only). Starts in Thai, then switches to the saved choice once mounted, so
 * the server render and the first client render agree.
 *
 * A signed-in customer's account keeps it too (User.locale): their
 * notifications are written in it. Saved only once the browser's choice has
 * been read, so the first Thai render never overwrites a Japanese account.
 */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>("th");
  const [ready, setReady] = useState(false);
  const { user, token, setUser } = useAuth();
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (isLang(saved)) setLang(saved);
    } catch { /* storage blocked: stay in Thai */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || !user || !token || user.locale === lang) return;
    apiFetch<{ locale?: string }>("/auth/profile", { method: "PATCH", token, body: JSON.stringify({ locale: lang }) })
      .then(() => setUser({ ...user, locale: lang }))
      .catch(() => { /* notifications stay in the account's last language */ });
  }, [ready, lang, user, token, setUser]);
  const choose = useCallback((l: Lang) => {
    setLang(l);
    try { localStorage.setItem(KEY, l); } catch { /* not remembered, still switched */ }
  }, []);
  return [lang, choose];
}
