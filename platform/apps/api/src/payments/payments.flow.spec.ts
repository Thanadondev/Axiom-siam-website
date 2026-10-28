import { describe, it, expect, beforeEach } from "vitest";
import { PaymentsService } from "./payments.service";
import { OrdersService } from "../orders/orders.service";

/**
 * The money flows end to end against an in-memory stand-in for Prisma:
 * deposit → production → balance → ship, slips and payments recorded by hand.
 */

type Row = Record<string, any>;
let db: { orders: Row[]; payments: Row[]; history: Row[]; invoices: Row[]; refunds: Row[] };
let seq = 0;
const id = () => `id-${++seq}`;

const match = (row: Row, where: Row = {}): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (k === "NOT") return !match(row, v);
    if (v && typeof v === "object" && "in" in v) return v.in.includes(row[k]);
    return row[k] === v;
  });
const withOrder = (p: Row) => ({ ...p, order: orderView(db.orders.find(o => o.id === p.orderId)!) });
const orderView = (o: Row) => ({ ...o, payments: db.payments.filter(p => p.orderId === o.id && match(p, o.__paymentWhere)) });

const prisma: any = {
  order: {
    findUnique: async ({ where, select }: any) => {
      const o = db.orders.find(r => r.id === where.id);
      if (!o) return null;
      const pw = select?.payments?.where;
      return {
        ...o,
        payments: db.payments.filter(p => p.orderId === o.id && match(p, pw)),
        refunds: db.refunds.filter(r => r.orderId === o.id),
        invoices: db.invoices.filter(i => i.orderId === o.id),
      };
    },
    update: async ({ where, data }: any) => Object.assign(db.orders.find(r => r.id === where.id)!, data),
  },
  payment: {
    findFirst: async ({ where }: any) => {
      const p = db.payments.find(r => match(r, { ...where, ...(where.status?.in ? { status: where.status } : {}) }));
      return p ? withOrder(p) : null;
    },
    findMany: async ({ where }: any) => db.payments.filter(r => match(r, where)),
    findUnique: async ({ where }: any) => { const p = db.payments.find(r => r.id === where.id); return p ? withOrder(p) : null; },
    create: async ({ data }: any) => { const p = { id: id(), createdAt: new Date(), ...data }; db.payments.push(p); return p; },
    update: async ({ where, data }: any) => Object.assign(db.payments.find(r => r.id === where.id)!, data),
  },
  orderStatusHistory: { create: async ({ data }: any) => { db.history.push(data); return data; } },
  refund: { create: async ({ data }: any) => { db.refunds.push(data); return data; } },
  invoice: {
    findFirst: async ({ where }: any) => {
      if (where.invoiceNo?.startsWith) return [...db.invoices].filter(r => r.invoiceNo.startsWith(where.invoiceNo.startsWith)).sort((a, b) => b.invoiceNo.localeCompare(a.invoiceNo))[0] ?? null;
      return db.invoices.find(r => match(r, where)) ?? null;
    },
    create: async ({ data }: any) => { const row = { id: id(), ...data }; db.invoices.push(row); return row; },
    update: async ({ where, data }: any) => Object.assign(db.invoices.find(r => r.id === where.id)!, data),
  },
  shipment: { create: async () => ({}), findFirst: async () => null },
  $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
};
const notify: any = { push: async () => {}, pushAdmins: async () => {} };
const settings: any = {
  bank: async () => ({ enabled: true, promptpayId: "0812345678", promptpayType: "phone", accountNo: "123-4-56789-0", bankName: "KBank", accountName: "Axiom", note: "" }),
};
const storage: any = { saveSlip: async (orderId: string) => `/uploads/slips/${orderId}/1-aaaa.jpg` };

const payments = new PaymentsService(prisma, notify, settings, storage);
const orders = new OrdersService(prisma, settings, notify);
const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const slip = (n: number) => ({ buffer: Buffer.concat([png, Buffer.from(String(n))]), mimetype: "image/png", size: 20 });

beforeEach(() => {
  db = { orders: [], payments: [], history: [], invoices: [], refunds: [] };
  seq = 0;
});
const addOrder = (total: number, depositAmount: number) => {
  const o = { id: id(), orderNo: `AX-${seq}`, userId: "u1", status: "pending", total, depositAmount };
  db.orders.push(o);
  return o;
};

describe("paying with a deposit", () => {
  it("takes the deposit, starts production, then takes the balance before shipping", async () => {
    const o = addOrder(4000, 2000);

    const m1 = await payments.payMethods("u1", o.id);
    expect(m1).toMatchObject({ amount: 2000, kind: "deposit", total: 4000 });

    const s1 = await payments.submitSlip("u1", o.id, slip(1));
    expect(s1.slipUrl).toMatch(/^\/api\/v1\/payments\/slip\?f=/); // a signed link, not a public file
    await payments.approveSlip("admin", s1.id, { amount: 2000, ref: "R1" });
    expect(o.status).toBe("paid");
    expect(db.invoices).toHaveLength(1);

    await orders.adminSetStatus(o.id, "admin", { status: "in_production" } as any);
    await expect(orders.adminSetStatus(o.id, "admin", { status: "shipped", trackingNo: "TH1" } as any)).rejects.toThrow(/ค้างชำระ ฿2,000/);

    const m2 = await payments.payMethods("u1", o.id);
    expect(m2).toMatchObject({ amount: 2000, kind: "balance", paid: 2000 });
    const s2 = await payments.submitSlip("u1", o.id, slip(2));
    await payments.approveSlip("admin", s2.id, { amount: 2000, ref: "R2" });
    expect(o.status).toBe("in_production"); // the balance doesn't move the order backwards

    await expect(payments.payMethods("u1", o.id)).rejects.toThrow(/ไม่มียอดที่ต้องชำระ/);
    await orders.adminSetStatus(o.id, "admin", { status: "shipped", trackingNo: "TH1" } as any);
    expect(o.status).toBe("shipped");
  });

  it("rejects a deposit slip that is short of the deposit", async () => {
    const o = addOrder(4000, 2000);
    const s1 = await payments.submitSlip("u1", o.id, slip(3));
    await expect(payments.approveSlip("admin", s1.id, { amount: 1500 })).rejects.toThrow(/น้อยกว่ายอดที่ต้องชำระ/);
  });
});

describe("paying in full (no deposit)", () => {
  it("asks for, and is paid by, the whole total", async () => {
    const o = addOrder(3900, 3900);
    expect((await payments.payMethods("u1", o.id)).amount).toBe(3900);
    const s = await payments.submitSlip("u1", o.id, slip(4));
    await payments.approveSlip("admin", s.id, { amount: 3900 });
    expect(o.status).toBe("paid");
    const state = await payments.paymentState("u1", o.id);
    expect(state).toMatchObject({ paymentStatus: "paid", due: 0, outstanding: 0 });
  });
});

describe("money an admin records by hand", () => {
  it("is the only way besides a slip to mark an order paid", async () => {
    const o = addOrder(3900, 3900);
    await expect(orders.adminSetStatus(o.id, "admin", { status: "paid" } as any)).rejects.toThrow(/บันทึกรับเงิน/);
    const r = await payments.recordManual("admin", o.id, { amount: 3900, method: "cash", note: "รับที่หน้าร้าน" });
    expect(r.orderStatus).toBe("paid");
    expect(o.status).toBe("paid");
    expect(db.payments[0]).toMatchObject({ provider: "manual", status: "paid", amount: 3900 });
    expect(db.history.at(-1)?.note).toMatch(/เงินสด/);
  });

  it("keeps a part-payment pending until the up-front part is covered", async () => {
    const o = addOrder(4000, 2000);
    await payments.recordManual("admin", o.id, { amount: 1000, method: "transfer", note: "โอนมาครึ่งหนึ่ง" });
    expect(o.status).toBe("pending");
    expect((await payments.payMethods("u1", o.id)).amount).toBe(1000);
    await payments.recordManual("admin", o.id, { amount: 1000, method: "transfer", note: "ส่วนที่เหลือของมัดจำ" });
    expect(o.status).toBe("paid");
  });

  it("refuses more than is owed, and a slip still waiting for review", async () => {
    const o = addOrder(3900, 3900);
    await expect(payments.recordManual("admin", o.id, { amount: 5000, method: "cash", note: "เกิน" })).rejects.toThrow(/เกินยอดค้าง/);
    await payments.submitSlip("u1", o.id, slip(5));
    await expect(payments.recordManual("admin", o.id, { amount: 3900, method: "cash", note: "ซ้ำ" })).rejects.toThrow(/สลิป/);
  });
});

describe("customer cancelling", () => {
  it("can't cancel once money is in", async () => {
    const o = addOrder(4000, 2000);
    await payments.recordManual("admin", o.id, { amount: 500, method: "cash", note: "บางส่วน" });
    await expect(orders.cancel(o.id, "u1")).rejects.toThrow(/ติดต่อทีมงาน/);
  });
});

describe("invoices", () => {
  it("are numbered in sequence across orders", async () => {
    const a = addOrder(1000, 1000), b = addOrder(2000, 2000);
    await payments.recordManual("admin", a.id, { amount: 1000, method: "cash", note: "หน้าร้าน" });
    await payments.recordManual("admin", b.id, { amount: 2000, method: "cash", note: "หน้าร้าน" });
    const y = new Date().getFullYear();
    expect(db.invoices.map(i => i.invoiceNo)).toEqual([`INV-${y}-00001`, `INV-${y}-00002`]);
  });
});

describe("refunds", () => {
  it("give money back, and close the order only when all of it is back", async () => {
    const o = addOrder(3900, 3900);
    await payments.recordManual("admin", o.id, { amount: 3900, method: "transfer", note: "โอนมา" });
    await expect(orders.adminSetStatus(o.id, "admin", { status: "refunded" } as any)).rejects.toThrow(/คืนเงิน/);
    await expect(orders.adminSetStatus(o.id, "admin", { status: "cancelled" } as any)).rejects.toThrow(/รับเงินไว้ ฿3,900/);

    await expect(payments.recordRefund("admin", o.id, { amount: 500, method: "transfer", reason: "ส่วนลด", close: true })).rejects.toThrow(/คืนครบ/);
    await payments.recordRefund("admin", o.id, { amount: 500, method: "transfer", reason: "ส่วนลดเสื้อตำหนิ" });
    expect(o.status).toBe("paid"); // a partial refund leaves the order where it is
    const one = await orders.getOne(o.id, "u1");
    expect(one.balance).toMatchObject({ paid: 3900, refunded: 500, outstanding: 0 });

    await expect(payments.recordRefund("admin", o.id, { amount: 5000, method: "cash", reason: "เกิน" })).rejects.toThrow(/ไม่เกินที่รับไว้ ฿3,400/);
    await payments.recordRefund("admin", o.id, { amount: 3400, method: "transfer", reason: "ลูกค้ายกเลิก", close: true });
    expect(o.status).toBe("refunded");
    await expect(payments.recordRefund("admin", o.id, { amount: 1, method: "cash", reason: "อีก" })).rejects.toThrow(/ปิดไปแล้ว/);
  });

  it("can't refund an order with no money in", async () => {
    const o = addOrder(1000, 1000);
    await expect(payments.recordRefund("admin", o.id, { amount: 100, method: "cash", reason: "ทดสอบ" })).rejects.toThrow(/ไม่มีเงิน/);
  });
});

describe("full tax invoice", () => {
  const buyer = { name: "บจก. ทีมฟุตบอล", taxId: "0105536084835", branch: "00000", address: "1 ถนนสุขุมวิท กรุงเทพฯ 10110" };

  it("is issued with the buyer when they asked before paying", async () => {
    const o = addOrder(3900, 3900);
    await orders.setTaxInvoice(o.id, "u1", buyer);
    await payments.recordManual("admin", o.id, { amount: 3900, method: "transfer", note: "โอน" });
    expect(db.invoices[0]).toMatchObject({ buyerName: buyer.name, buyerTaxId: buyer.taxId, buyerBranch: "00000" });
  });

  it("is completed when they ask after the invoice went out, then can't change", async () => {
    const o = addOrder(3900, 3900);
    await payments.recordManual("admin", o.id, { amount: 3900, method: "transfer", note: "โอน" });
    expect(db.invoices[0].buyerTaxId).toBeUndefined();
    const r = await orders.setTaxInvoice(o.id, "u1", buyer);
    expect(r.attached).toBe(true);
    expect(db.invoices[0].buyerName).toBe(buyer.name);
    await expect(orders.setTaxInvoice(o.id, "u1", { ...buyer, name: "อื่น" })).rejects.toThrow(/แก้ไขไม่ได้/);
  });

  it("is only the order owner's (or an admin's) to fill in", async () => {
    const o = addOrder(3900, 3900);
    await expect(orders.setTaxInvoice(o.id, "someone-else", buyer)).rejects.toThrow(/ไม่ใช่ของคุณ/);
    await orders.setTaxInvoice(o.id, "admin-user", buyer, true);
  });
});
