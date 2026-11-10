import { z } from "zod";
import { SHIP_STEP, LAST_FLOOR_STEP } from "../orders/production-steps";

/**
 * The factory's ERP (Kairos) says where each job is on the line:
 *   GET {ERP_BASE_URL}/api/public/production-status?order_no=HJ-447
 *
 * Its ten steps are the same line as ours, in the same order, so they're
 * matched by number (the names differ a little: "จัดไฟล์พิมพ์" is our "ทำไฟล์").
 * This file only reads the answer; erp-sync.service.ts fetches and applies it.
 */

const str = z.string().nullish().transform(v => v ?? null);

const ErpStepSchema = z.object({
  no: z.coerce.number().int(),
  name: z.string().catch(""),
  status: z.string().catch(""),
  status_label: str.catch(null),
  started_on: str.catch(null),
  finished_on: str.catch(null),
});

export const ErpStatusSchema = z.object({
  order_no: z.string(),
  status: z.string().catch(""),
  status_label: str.catch(null),
  product: str.catch(null),
  total_qty: z.coerce.number().nullish().catch(null),
  due_date: str.catch(null),
  // a number, an object with `no`, or null when nothing is running right now
  current_step: z.unknown().optional(),
  steps: z.array(ErpStepSchema).catch([]),
  updated_at: str.catch(null),
});
export type ErpStatus = z.infer<typeof ErpStatusSchema>;

/** what the web keeps of an ERP answer (Order.erpStatus) and shows the customer */
export interface ErpSnapshot {
  status: string;
  statusLabel: string | null;
  dueDate: string | null;
  updatedAt: string | null;
  step: number;
  steps: { no: number; name: string; status: string; label: string | null; startedOn: string | null; finishedOn: string | null }[];
}

const DONE = new Set(["done", "finished", "completed", "complete"]);
const SHIPPED = new Set(["shipped", "delivered", "completed"]);

export const stepDone = (s: { status: string; finished_on?: string | null }) =>
  DONE.has(s.status.toLowerCase()) || Boolean(s.finished_on);

const stepStarted = (s: { status: string; started_on?: string | null; finished_on?: string | null }) =>
  stepDone(s) || Boolean(s.started_on) || ["in_progress", "doing", "working", "started", "active"].includes(s.status.toLowerCase());

function currentNo(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  if (v && typeof v === "object" && "no" in v) return currentNo((v as { no: unknown }).no);
  return null;
}

/**
 * The step the job is on, 0–10, by our numbering: the ERP's current step when
 * it names one, otherwise the furthest step that has started. Shipped is 10.
 */
export function erpStep(e: ErpStatus): number {
  const steps = e.steps.filter(s => s.no >= 1 && s.no <= SHIP_STEP);
  if (SHIPPED.has(e.status.toLowerCase())) return SHIP_STEP;
  if (steps.length && steps.length >= SHIP_STEP && steps.every(stepDone)) return SHIP_STEP;
  const cur = currentNo(e.current_step);
  if (cur && cur >= 1 && cur <= SHIP_STEP) return cur;
  return steps.filter(stepStarted).reduce((n, s) => Math.max(n, s.no), 0);
}

/**
 * The step the web order moves to. 1–9 follow the ERP; 10 (shipped) stays with
 * marking the order shipped on the web, which needs the tracking number and
 * the money in full — so a job the ERP has finished waits at 9 until then.
 */
export const webStep = (erp: number) => Math.min(erp, LAST_FLOOR_STEP);

export function snapshot(e: ErpStatus): ErpSnapshot {
  return {
    status: e.status,
    statusLabel: e.status_label,
    dueDate: e.due_date,
    updatedAt: e.updated_at,
    step: erpStep(e),
    steps: e.steps
      .filter(s => s.no >= 1 && s.no <= SHIP_STEP)
      .sort((a, b) => a.no - b.no)
      .map(s => ({ no: s.no, name: s.name, status: s.status, label: s.status_label, startedOn: s.started_on, finishedOn: s.finished_on })),
  };
}

/** ERP order numbers as people paste them: " HJ-447 " → "HJ-447" */
export const normalizeErpNo = (s: string) => s.replace(/\s+/g, "");
