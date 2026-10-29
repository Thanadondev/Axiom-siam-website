import { ErpStatusSchema, type ErpStatus } from "./production-status";

/**
 * Talking to the ERP. Configured from the API's .env:
 *   ERP_BASE_URL   https://kairos.axiomsiam.com   (blank = no ERP; nothing is fetched)
 *   ERP_API_KEY    optional, sent as "Authorization: Bearer …" when set
 */
export interface ErpConfig { baseUrl: string; apiKey: string | null; timeoutMs: number; syncMinutes: number }

export function erpConfig(env: NodeJS.ProcessEnv = process.env): ErpConfig | null {
  const baseUrl = (env.ERP_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) return null;
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    baseUrl,
    apiKey: env.ERP_API_KEY?.trim() || null,
    timeoutMs: n(env.ERP_TIMEOUT_MS, 8000),
    // 0 turns the background sync off (orders still sync when opened, or from the board)
    syncMinutes: n(env.ERP_SYNC_MINUTES, 10),
  };
}

export type ErpResult =
  | { ok: true; status: ErpStatus }
  | { ok: false; notFound: boolean; error: string };

export async function fetchErpStatus(cfg: ErpConfig, orderNo: string, fetchImpl: typeof fetch = fetch): Promise<ErpResult> {
  const url = `${cfg.baseUrl}/api/public/production-status?order_no=${encodeURIComponent(orderNo)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { accept: "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (e) {
    const timeout = (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError";
    return { ok: false, notFound: false, error: timeout ? "ERP ไม่ตอบภายในเวลาที่กำหนด" : "เชื่อมต่อ ERP ไม่ได้" };
  }
  if (res.status === 404) return { ok: false, notFound: true, error: `ไม่พบออเดอร์ ${orderNo} ใน ERP` };
  if (!res.ok) return { ok: false, notFound: false, error: `ERP ตอบกลับ ${res.status}` };

  let body: unknown;
  try { body = await res.json(); } catch { return { ok: false, notFound: false, error: "ERP ตอบกลับไม่ใช่ JSON" }; }
  // some APIs answer 200 with { error } / { detail } for an unknown number
  if (body && typeof body === "object" && !("steps" in body) && ("error" in body || "detail" in body)) {
    return { ok: false, notFound: true, error: `ไม่พบออเดอร์ ${orderNo} ใน ERP` };
  }
  const parsed = ErpStatusSchema.safeParse(body);
  if (!parsed.success) return { ok: false, notFound: false, error: "ข้อมูลจาก ERP ไม่อยู่ในรูปแบบที่รู้จัก" };
  return { ok: true, status: parsed.data };
}
