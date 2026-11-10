"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { tri, type Lang } from "../lib/i18n";

/** Header avatar + dropdown (account / designer profile / admin / logout).
 *  Shared by AppShell and the landing page nav so logout is reachable everywhere. */
export default function UserMenu({ loginClass = "", dropUp = false, lang = "th" }: { loginClass?: string; dropUp?: boolean; lang?: Lang }) {
  const L = tri(lang);
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!user) return <Link className={loginClass} href="/login">{L("เข้าสู่ระบบ", "Sign in", "ログイン")}</Link>;

  const label = user.fullName?.trim() || user.email.split("@")[0];
  const initial = (label[0] ?? "?").toUpperCase();

  async function doLogout() {
    setBusy(true);
    try { await logout(); } finally {
      setBusy(false); setOpen(false);
      router.push("/");
    }
  }

  return (
    <div className="usermenu" ref={ref}>
      <button className="userbtn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="useravi">{initial}</span>
        <span className="username">{label}</span>
        <span className={`caret${open ? " up" : ""}`}>▾</span>
      </button>

      {open && (
        <div className={`usermenu-pop${dropUp ? " up" : ""}`} role="menu">
          <div className="usermenu-head">
            <b>{label}</b>
            <span className="dim">{user.email}</span>
          </div>
          <Link href="/account" role="menuitem" onClick={() => setOpen(false)}>👤 {L("บัญชีของฉัน", "My account", "マイアカウント")}</Link>
          <Link href={`/designers/${user.id}`} role="menuitem" onClick={() => setOpen(false)}>🎨 โปรไฟล์ดีไซเนอร์</Link>
          {user.role === "admin" && <Link href="/admin" role="menuitem" onClick={() => setOpen(false)}>🛠 ผู้ดูแลระบบ</Link>}
          <hr />
          <button className="logoutitem" role="menuitem" onClick={doLogout} disabled={busy}>
            {busy ? L("กำลังออก…", "Signing out…", "ログアウト中…") : `🚪 ${L("ออกจากระบบ", "Sign out", "ログアウト")}`}
          </button>
        </div>
      )}
    </div>
  );
}
