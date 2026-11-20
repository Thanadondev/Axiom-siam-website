"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api";
import AppShell from "../../components/AppShell";
import { tri, useLang, type Lang } from "../../lib/i18n";

/** the emailed "confirm your email" link lands here — in Thai, English or Japanese */
function VerifyInner({ lang }: { lang: Lang }) {
  const L = tri(lang);
  const token = useSearchParams().get("token") || "";
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  // the API's own (Thai) words, or "no token"; shown as they are in Thai, by kind otherwise
  const [apiMsg, setApiMsg] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); return; }
    (async () => {
      try {
        const r = await apiFetch<{ message: string }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
        setStatus("ok"); setApiMsg(r.message);
      } catch (e: any) {
        setStatus("error"); setApiMsg(e.message);
      }
    })();
  }, [token]);

  const icon = status === "ok" ? "✅" : status === "error" ? "⚠️" : "⏳";
  const message = status === "loading" ? L("กำลังยืนยันอีเมล...", "Confirming your email…", "メールアドレスを確認しています…")
    : status === "ok" ? L(apiMsg || "ยืนยันอีเมลสำเร็จ", "Your email is confirmed", "メールアドレスの確認が完了しました")
    : !token ? L("ไม่พบโทเคนสำหรับยืนยันอีเมล", "This link has no confirmation code", "このリンクには確認コードがありません")
    : L(apiMsg, "This link is wrong or has expired", "このリンクは無効か期限切れです");

  return (
    <div className="acard center">
      <div style={{ fontSize: 44, marginBottom: 6 }}>{icon}</div>
      <div className="eyebrow">{L("ยืนยันอีเมล", "Confirm your email", "メールアドレスの確認")}</div>
      <h1 className="atitle">{status === "ok" ? L("ยืนยันสำเร็จ", "Confirmed", "確認完了") : status === "error" ? L("ยืนยันไม่สำเร็จ", "Not confirmed", "確認できませんでした") : L("กำลังยืนยัน...", "Confirming…", "確認中…")}</h1>
      <p className="asub">{message}</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
        <Link href="/account" className="abtn solid">{L("ไปที่บัญชีของฉัน", "Go to my account", "マイアカウントへ")}</Link>
        <Link href="/" className="abtn ghost">{L("กลับหน้าแรก", "Back to the home page", "トップページへ")}</Link>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  const [lang, setLang] = useLang();
  return (
    <AppShell auth lang={lang} onLang={setLang}>
      <Suspense fallback={<div className="acard"><p className="asub">{tri(lang)("กำลังโหลด...", "Loading…", "読み込み中…")}</p></div>}>
        <VerifyInner lang={lang} />
      </Suspense>
    </AppShell>
  );
}
