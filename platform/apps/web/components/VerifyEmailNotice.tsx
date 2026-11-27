"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, type User } from "../lib/auth-context";
import { apiFetch } from "../lib/api";
import { tri, type Lang } from "../lib/i18n";
import { waitMinutes } from "../lib/verify-email";

export { isUnverified } from "../lib/verify-email";

/**
 * Orders only come from accounts whose email is confirmed (the API checks it too). Shown above the
 * order button while it isn't: where the link went, a button to send it again, and a check for
 * "I've clicked it", also made by itself when they come back to this tab from their mail.
 */
export default function VerifyEmailNotice({ lang = "th" }: { lang?: Lang }) {
  const { user, token, setUser } = useAuth();
  const L = tri(lang);
  const [sent, setSent] = useState<"" | "busy" | "sent" | "error">("");
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);
  // sent too often (3 an hour): about how many minutes until it can be sent again
  const [waitMin, setWaitMin] = useState(0);
  const pending = !!user && !user.isVerified;

  const recheck = useCallback(async () => {
    if (!token) return false;
    setChecking(true);
    try {
      const me = await apiFetch<User>("/auth/me", { token });
      setUser(me);
      return me.isVerified;
    } catch { return false; } finally { setChecking(false); }
  }, [token, setUser]);

  useEffect(() => {
    if (!pending) return;
    const onFocus = () => { if (document.visibilityState === "visible") recheck(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => { document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); };
  }, [pending, recheck]);

  if (!pending) return null;

  async function resend() {
    setSent("busy");
    try {
      const r = await apiFetch<{ already?: boolean }>("/auth/resend-verify", { method: "POST", token });
      if (r.already) { await recheck(); return; }
      setSent("sent");
    } catch (e) {
      setWaitMin(waitMinutes(e));
      setSent("error");
    }
  }

  return (
    <div className="verify-note" role="status">
      <b>{L("ยืนยันอีเมลก่อนสั่งผลิต", "Confirm your email to order", "ご注文の前にメールアドレスの確認が必要です")}</b>
      <p>
        {L("เราส่งลิงก์ยืนยันไปที่ ", "We sent a confirmation link to ", "確認用のリンクを次のアドレスに送りました：")}<b>{user.email}</b>
        {L(" — กดลิงก์ในอีเมล แล้วกลับมาหน้านี้ (ดูในจดหมายขยะด้วย)", " — click it, then come back to this page (check your spam folder too)", "。メール内のリンクを押してから、このページに戻ってください（迷惑メールフォルダもご確認ください）")}
      </p>
      <div className="acts">
        <button type="button" className="minibtn" disabled={sent === "busy" || sent === "sent"} onClick={resend}>
          {sent === "busy" ? L("กำลังส่ง…", "Sending…", "送信中…") : sent === "sent" ? L("ส่งแล้ว ✓", "Sent ✓", "送信しました ✓") : L("ส่งลิงก์อีกครั้ง", "Send the link again", "リンクを再送する")}
        </button>
        <button type="button" className="minibtn" disabled={checking} onClick={async () => setNotYet(!(await recheck()))}>
          {checking ? L("กำลังตรวจ…", "Checking…", "確認中…") : L("ยืนยันแล้ว", "I've confirmed it", "確認しました")}
        </button>
      </div>
      {notYet && <p className="dim">{L("ยังไม่ได้ยืนยัน — กดลิงก์ในอีเมลก่อน", "Not confirmed yet — click the link in the email first", "まだ確認されていません。先にメール内のリンクを押してください")}</p>}
      {sent === "sent" && <p className="dim">{L("ลิงก์ใหม่ใช้ได้ 24 ชั่วโมง ลิงก์เก่าใช้ไม่ได้แล้ว", "The new link works for 24 hours; earlier ones no longer do", "新しいリンクの有効期限は24時間です。以前のリンクは使えなくなりました")}</p>}
      {sent === "error" && <p className="ou-warn">⚠ {waitMin
        ? L(`ส่งบ่อยเกินไป — ส่งได้อีกครั้งในอีกราว ${waitMin} นาที ระหว่างนี้ลองหาอีเมลเดิมในจดหมายขยะ`, `Sent too often — you can send it again in about ${waitMin} min; meanwhile look for the last one in your spam folder`, `送信回数が多すぎます。約${waitMin}分後に再送できます。その間に迷惑メールフォルダをご確認ください`)
        : L("ส่งไม่สำเร็จ — ลองอีกครั้งภายหลัง", "Couldn't send it — try again a little later", "送信できませんでした。しばらくしてからお試しください")}</p>}
    </div>
  );
}
