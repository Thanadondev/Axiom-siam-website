"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth-context";

/**
 * Global site header. Hidden on the marketing landing ("/"), which renders its
 * own full-bleed topbar over the 3D scene. Shown on app pages (login, account…).
 */
export default function SiteHeader() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname === "/") return null;

  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 24px",
        borderBottom: "1px solid rgba(77,191,176,.15)",
      }}
    >
      <Link
        href="/"
        style={{ color: "#e8f5f2", textDecoration: "none", fontWeight: 800, letterSpacing: 1 }}
      >
        <img src="/logo-mark.png" alt="AXIOM SIAM" style={{ height: 30, width: "auto", display: "block" }} />
      </Link>
      <div style={{ display: "flex", gap: 16, fontSize: 14, alignItems: "center" }}>
        <Link href="/design" style={{ color: "#8fa6a1", textDecoration: "none" }}>
          ออกแบบเสื้อ
        </Link>
        {user ? (
          <Link href="/account" style={{ color: "#4DBFB0", textDecoration: "none" }}>
            บัญชีของฉัน
          </Link>
        ) : (
          <>
            <Link href="/login" style={{ color: "#8fa6a1", textDecoration: "none" }}>
              เข้าสู่ระบบ
            </Link>
            <Link href="/register" style={{ color: "#4DBFB0", textDecoration: "none" }}>
              สมัครสมาชิก
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
