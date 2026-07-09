"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api";

interface Note { id: string; title: string; body?: string | null; link?: string | null; isRead: boolean; createdAt: string }

const ago = (s: string) => {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "เมื่อครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
};

export default function NotifyBell({ dropUp = false }: { dropUp?: boolean }) {
  const { user, token } = useAuth();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const poll = useCallback(() => {
    if (!token) return;
    apiFetch<{ count: number }>("/notifications/unread-count", { token })
      .then(r => setUnread(r.count)).catch(() => { /* API may be down */ });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    poll();
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, [token, poll]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!user) return null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || !token) return;
    try {
      setNotes(await apiFetch<Note[]>("/notifications", { token }));
      await apiFetch("/notifications/read", { method: "POST", token });
      setUnread(0);
    } catch { /* ignore */ }
  }

  return (
    <div className="usermenu" ref={ref}>
      <button className="bellbtn" onClick={toggle} aria-label="การแจ้งเตือน" aria-expanded={open}>
        🔔{unread > 0 && <span className="belldot">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className={`usermenu-pop notepop${dropUp ? " up" : ""}`} role="menu">
          <div className="usermenu-head"><b>การแจ้งเตือน</b></div>
          {notes.length === 0 ? (
            <div className="dim" style={{ padding: "14px 12px" }}>ยังไม่มีการแจ้งเตือน</div>
          ) : notes.map(n => {
            const inner = (
              <>
                <div style={{ fontSize: 13, fontWeight: n.isRead ? 500 : 700 }}>{n.title}</div>
                {n.body && <div className="dim">{n.body}</div>}
                <div className="dim" style={{ fontSize: 11 }}>{ago(n.createdAt)}</div>
              </>
            );
            return n.link
              ? <Link key={n.id} href={n.link} className="noteitem" onClick={() => setOpen(false)}>{inner}</Link>
              : <div key={n.id} className="noteitem">{inner}</div>;
          })}
        </div>
      )}
    </div>
  );
}
