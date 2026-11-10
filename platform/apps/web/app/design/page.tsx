"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { apiFetch } from "../../lib/api";
import UserMenu from "../../components/UserMenu";
import "../app.css"; // user-menu styles

function DesignerBridge() {
  const { user, token } = useAuth();
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sp = useSearchParams();
  const designId = sp.get("design");
  const templateId = sp.get("template");
  // Colourway chosen on the template page. Kept as primitives, not an object:
  // an object literal is a new reference every render, so putting it in the
  // effect deps below would tear down and re-add the message listener forever.
  const vBody = sp.get("body");
  const vTrim = sp.get("trim");
  const vSize = sp.get("size");
  const vTrimLevel = sp.get("trimLevel");

  useEffect(() => {
    function reply(msg: any) {
      iframeRef.current?.contentWindow?.postMessage(msg, "*");
    }

    async function onMessage(ev: MessageEvent) {
      const m = ev.data || {};
      if (m.type === "axiom-ready") {
        reply({ type: "axiom-auth", user: user ? { id: user.id, email: user.email, name: user.fullName } : null });
        if (designId && token) {
          try {
            const d = await apiFetch<{ stateJson: any }>(`/designs/${designId}`, { token });
            reply({ type: "axiom-open", doc: d.stateJson });
          } catch {
            /* ignore */
          }
        } else if (templateId && token) {
          try {
            const d = await apiFetch<{ stateJson: any }>(`/templates/${templateId}/state`, { token });
            reply({ type: "axiom-open", doc: d.stateJson });
          } catch {
            /* ignore — not owned or not found */
          }
        }
        // Apply the colourway the buyer picked in the marketplace. Sent after
        // axiom-open so it wins over whatever the saved doc had.
        if (vBody || vTrim || vSize || vTrimLevel) {
          setTimeout(() => reply({
            type: "axiom-set-variant",
            bodyColor: vBody || undefined,
            trimColor: vTrim || undefined,
            size: vSize || undefined,
            trim: vTrimLevel || undefined,
          }), 250);
        }
      }
      if (m.type === "axiom-save") {
        if (!token) { reply({ type: "axiom-save-result", ok: false, error: "กรุณาเข้าสู่ระบบก่อนบันทึก" }); return; }
        try {
          const p = m.payload || {};
          const res = await apiFetch<{ id: string }>("/designs", {
            method: "POST",
            token,
            body: JSON.stringify({
              name: p.name || "ดีไซน์ใหม่",
              mode: p.style === 2 ? "reversible" : "single",
              stateJson: p.doc,
              previewUrl: p.preview,
            }),
          });
          reply({ type: "axiom-save-result", ok: true, id: res.id });
        } catch (e: any) {
          reply({ type: "axiom-save-result", ok: false, error: e.message });
        }
      }
      if (m.type === "axiom-save-order") {
        if (!token) { reply({ type: "axiom-save-order-result", ok: false, error: "กรุณาเข้าสู่ระบบก่อนบันทึก" }); return; }
        try {
          const p = m.payload || {};
          const nm = `${p.name || "ออเดอร์ทีม"} (${p.count || 0} ตัว)`;
          const res = await apiFetch<{ id: string }>("/designs", {
            method: "POST",
            token,
            body: JSON.stringify({
              name: nm,
              mode: p.style === 2 ? "reversible" : "single",
              stateJson: p.doc,
              previewUrl: p.preview,
            }),
          });
          reply({ type: "axiom-save-order-result", ok: true, id: res.id });

          // "สั่งผลิตเลย": hand the roster + spec to the checkout page.
          // sessionStorage rather than the URL — a 40-player roster blows past
          // the practical query-string limit.
          if (p.goOrder) {
            try {
              sessionStorage.setItem("axiom-order-draft", JSON.stringify({
                designId: res.id,
                fabric: p.fabric,
                trim: p.trim,
                reversible: !!p.reversible,
                roster: Array.isArray(p.roster) ? p.roster : [],
              }));
            } catch { /* private mode / quota — the page still works, just unprefilled */ }
            router.push(`/checkout?design=${res.id}`);
          }
        } catch (e: any) {
          reply({ type: "axiom-save-order-result", ok: false, error: e.message });
        }
      }
      if (m.type === "axiom-publish") {
        if (!token) { reply({ type: "axiom-publish-result", ok: false, error: "กรุณาเข้าสู่ระบบก่อนขายในตลาด" }); return; }
        try {
          const p = m.payload || {};
          const res = await apiFetch<{ id: string }>("/templates", {
            method: "POST",
            token,
            body: JSON.stringify({
              name: p.name,
              price: p.price ?? 0,
              category: p.category || undefined,
              description: p.description || undefined,
              previewUrl: p.preview,
              stateJson: p.doc,
              status: "published",
              agreedTerms: true,
            }),
          });
          reply({ type: "axiom-publish-result", ok: true, id: res.id });
        } catch (e: any) {
          reply({ type: "axiom-publish-result", ok: false, error: e.message });
        }
      }
      // "ขอราคา" was removed from the editor: asking for a quote mid-design
      // competes with the real path (สั่งผลิต → เห็นราคาทันที). Quotes now come
      // from the contact section on the landing page instead.
    }

    window.addEventListener("message", onMessage);
    // proactively (re)send auth whenever it changes, in case the iframe loaded first
    reply({ type: "axiom-auth", user: user ? { id: user.id, email: user.email, name: user.fullName } : null });
    return () => window.removeEventListener("message", onMessage);
  }, [user, token, designId, templateId, router, vBody, vTrim, vSize, vTrimLevel]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d0e10" }}>
      <iframe
        ref={iframeRef}
        src="/designer/index.html"
        title="Axiom Siam Designer"
        style={{ border: 0, width: "100%", height: "100%", display: "block" }}
      />
      <Link
        href="/"
        title="กลับหน้าหลัก"
        style={{ position: "fixed", left: 16, bottom: 16, zIndex: 50, display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(20,22,25,.92)", color: "#f2f0eb", textDecoration: "none", fontSize: 12.5, fontWeight: 700, padding: "9px 16px 9px 12px", borderRadius: 30, border: "1px solid #3a3d42", boxShadow: "0 6px 22px rgba(0,0,0,.4)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      >
        <span style={{ fontSize: 15, lineHeight: 1, marginTop: -1 }}>←</span> Axiom Siam
      </Link>

      {/* account + logout, opens upward so it stays on screen */}
      <div className="floatmenu">
        <UserMenu loginClass="floatlogin" dropUp />
      </div>
    </div>
  );
}

export default function DesignPage() {
  return (
    <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "#0d0e10" }} />}>
      <DesignerBridge />
    </Suspense>
  );
}
