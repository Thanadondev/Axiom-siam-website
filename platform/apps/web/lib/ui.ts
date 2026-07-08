import type { CSSProperties } from "react";

export const BRAND = "#2563eb";
export const BRAND_DEEP = "#1d4ed8";

export const page: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "48px 24px 80px",
};

export const card: CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: "rgba(17, 24, 39, 0.6)",
  border: "1px solid rgba(37, 99, 235, 0.28)",
  borderRadius: 16,
  padding: "32px 28px",
  backdropFilter: "blur(8px)",
};

export const cardWide: CSSProperties = { ...card, maxWidth: 640 };

export const label: CSSProperties = { fontSize: 12, color: "#93a4c4", letterSpacing: 0.5, display: "block", marginTop: 14 };

export const input: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(37,99,235,.32)",
  borderRadius: 9,
  padding: "11px 13px",
  color: "#eaf1ff",
  fontSize: 14,
  marginTop: 6,
  boxSizing: "border-box",
};

export const select: CSSProperties = { ...input, cursor: "pointer" };

export const button: CSSProperties = {
  width: "100%",
  background: BRAND,
  color: "#fff",
  border: 0,
  borderRadius: 30,
  padding: "12px",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  marginTop: 20,
};

export const buttonGhost: CSSProperties = {
  ...button,
  background: "transparent",
  color: BRAND,
  border: `1px solid ${BRAND}`,
};

export const linkStyle: CSSProperties = { color: "#3b82f6", textDecoration: "none" };
export const heading: CSSProperties = { fontSize: 26, margin: "0 0 6px", fontWeight: 700, color: "#eaf1ff" };
export const sub: CSSProperties = { color: "#93a4c4", fontSize: 13, marginBottom: 8 };
export const eyebrow: CSSProperties = { color: BRAND, fontWeight: 700, letterSpacing: 2, fontSize: 11, textTransform: "uppercase" };
export const errorBox: CSSProperties = { color: "#ff6b5e", fontSize: 13, marginTop: 14 };
export const okBox: CSSProperties = { color: "#3b82f6", fontSize: 13, marginTop: 14 };
export const row2: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
