"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import UserMenu from "./UserMenu";
import NotifyBell from "./NotifyBell";
import "../app/app.css";

type Theme = "light" | "dark";

export default function AppShell({ children, narrow = false, wide = false }: { children: ReactNode; narrow?: boolean; wide?: boolean }) {
  const [theme, setTheme] = useState<Theme>("light");
  const logo = theme === "light" ? "/logo-mark-blue.png" : "/logo-mark.png";

  return (
    <div className={`app theme-${theme}`}>
      <header className="app-header">
        <Link href="/" className="app-brand">
          <img src={logo} alt="AXIOM SIAM" style={{ height: 34, width: "auto", display: "block" }} />
          <b>AXIOM SIAM</b>
        </Link>
        <nav className="app-nav">
          <Link href="/">หน้าแรก</Link>
          <Link href="/templates">ตลาดลาย</Link>
          <Link href="/design">ออกแบบเสื้อ</Link>
          <NotifyBell />
          <UserMenu />
          <div className="pill" title="ธีมสี">
            <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")} aria-label="ธีมขาว-น้ำเงิน">☀</button>
            <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")} aria-label="ธีมดำ-มิ้นต์">🌙</button>
          </div>
        </nav>
      </header>
      <main className={`app-main${narrow ? " app-narrow" : ""}${wide ? " app-wide" : ""}`}>{children}</main>
      <footer style={{ textAlign: "center", padding: "24px 22px 40px", fontSize: 12.5, color: "var(--muted)" }}>
        © {new Date().getFullYear()} Axiom Siam Co.,Ltd. ·{" "}
        <Link href="/terms" style={{ color: "var(--muted)", textDecoration: "underline" }}>ข้อตกลง & เงื่อนไข</Link>
      </footer>
    </div>
  );
}
