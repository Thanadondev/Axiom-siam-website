import { describe, it, expect } from "vitest";
import { formatInvoiceNo, invoiceSeq, issueInvoice } from "./invoices";

function fakeDb(existing: string[] = [], collideOnce = false) {
  const rows: { orderId: string; invoiceNo: string }[] = existing.map((n, i) => ({ orderId: `old-${i}`, invoiceNo: n }));
  let collide = collideOnce;
  return {
    rows,
    invoice: {
      findFirst: async ({ where, orderBy }: any) => {
        if (where.orderId) return rows.find(r => r.orderId === where.orderId) ?? null;
        const hits = rows.filter(r => r.invoiceNo.startsWith(where.invoiceNo.startsWith)).sort((a, b) => b.invoiceNo.localeCompare(a.invoiceNo));
        return orderBy && hits[0] ? hits[0] : null;
      },
      create: async ({ data }: any) => {
        if (collide) {
          // someone else took this number a moment ago
          collide = false;
          rows.push({ orderId: "other", invoiceNo: data.invoiceNo });
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        if (rows.some(r => r.invoiceNo === data.invoiceNo)) throw Object.assign(new Error("unique"), { code: "P2002" });
        rows.push({ orderId: data.orderId, invoiceNo: data.invoiceNo });
        return data;
      },
    },
  };
}
const y2026 = new Date("2026-10-28T03:00:00Z");

describe("invoice numbers", () => {
  it("format and parse", () => {
    expect(formatInvoiceNo(2026, 1)).toBe("INV-2026-00001");
    expect(invoiceSeq("INV-2026-00042", 2026)).toBe(42);
    expect(invoiceSeq("INV-202610-AB12C", 2026)).toBeNull(); // the older random style
    expect(invoiceSeq("INV-2025-00042", 2026)).toBeNull();
  });

  it("start at 1 each year and run on from the last one", async () => {
    const db = fakeDb(["INV-202610-XY9ZQ", "INV-2025-00310"]);
    expect(await issueInvoice(db, "o1", 100, y2026)).toBe("INV-2026-00001");
    expect(await issueInvoice(db, "o2", 100, y2026)).toBe("INV-2026-00002");
    db.rows.push({ orderId: "o9", invoiceNo: "INV-2026-00099" });
    expect(await issueInvoice(db, "o3", 100, y2026)).toBe("INV-2026-00100");
  });

  it("issue an order's invoice only once", async () => {
    const db = fakeDb();
    expect(await issueInvoice(db, "o1", 100, y2026)).toBe("INV-2026-00001");
    expect(await issueInvoice(db, "o1", 100, y2026)).toBe("INV-2026-00001");
    expect(db.rows).toHaveLength(1);
  });

  it("take the next number when two approvals race for the same one", async () => {
    const db = fakeDb([], true);
    expect(await issueInvoice(db, "o1", 100, y2026)).toBe("INV-2026-00002");
  });
});
