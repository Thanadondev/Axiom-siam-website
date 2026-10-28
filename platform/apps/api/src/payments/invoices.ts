/**
 * Invoice numbers run in sequence per year: INV-2026-00001, INV-2026-00002, …
 * Credit notes (ใบลดหนี้) have their own: CN-2026-00001, …
 * (a Thai tax document needs a running number with no gaps or repeats; this
 * gives one — the zero padding keeps text order equal to number order).
 */

export const INVOICE_PREFIX = "INV";
export const CREDIT_PREFIX = "CN";

export function formatDocNo(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(5, "0")}`;
}
export const formatInvoiceNo = (year: number, seq: number) => formatDocNo(INVOICE_PREFIX, year, seq);

/** the running number of a document from that year, or null (e.g. an older random-style number) */
export function docSeq(prefix: string, no: string, year: number): number | null {
  const m = new RegExp(`^${prefix}-${year}-(\\d{5,})$`).exec(no);
  return m ? Number(m[1]) : null;
}
export const invoiceSeq = (no: string, year: number) => docSeq(INVOICE_PREFIX, no, year);

type DocTable = {
  findFirst(args: any): Promise<any>;
  create(args: any): Promise<any>;
};
type InvoiceDb = { invoice: DocTable };
type CreditDb = { invoice: DocTable; creditNote: DocTable & { findMany(args: any): Promise<{ amount: number }[]> } };

/**
 * Create a document with the next number of the year. Two admins at the same
 * moment race for the same number: the unique index stops the second, which
 * takes the next one.
 */
async function withNextNo<T>(table: DocTable, field: string, prefix: string, now: Date, create: (no: string) => Promise<T>): Promise<T> {
  const year = now.getFullYear();
  for (let attempt = 0; attempt < 8; attempt++) {
    const last = await table.findFirst({
      where: { [field]: { startsWith: `${prefix}-${year}-` } },
      orderBy: { [field]: "desc" },
      select: { [field]: true },
    });
    const no = formatDocNo(prefix, year, (last ? docSeq(prefix, last[field], year) ?? 0 : 0) + 1);
    try {
      return await create(no);
    } catch (e: any) {
      if (e?.code !== "P2002") throw e; // only a taken number is worth another try
    }
  }
  throw new Error(`could not allocate a ${prefix} number`);
}

export interface InvoiceBuyer { name: string; taxId: string; branch: string; address: string }

/** Issue the order's invoice once (idempotent), with the next number of the year. */
export async function issueInvoice(db: InvoiceDb, orderId: string, amount: number, now = new Date(), buyer?: InvoiceBuyer | null): Promise<string | null> {
  const existing = await db.invoice.findFirst({ where: { orderId } });
  if (existing) return existing.invoiceNo;
  return withNextNo(db.invoice, "invoiceNo", INVOICE_PREFIX, now, async invoiceNo => {
    await db.invoice.create({
      data: {
        orderId, invoiceNo, amount, taxId: process.env.COMPANY_TAX_ID ?? null,
        // the buyer is frozen onto the invoice: a tax invoice never changes after it is issued
        ...(buyer ? { buyerName: buyer.name, buyerTaxId: buyer.taxId, buyerBranch: buyer.branch, buyerAddress: buyer.address } : {}),
      },
    });
    return invoiceNo;
  });
}

/**
 * ใบลดหนี้ against the order's invoice. A refund lowers the value by what was
 * given back; when the sale is called off (`whole`), whatever value is left on
 * the invoice is credited. Never credits more than the invoice still carries,
 * and nothing is issued for an order that was never invoiced.
 */
export async function issueCreditNote(
  db: CreditDb,
  args: { orderId: string; refundId?: string | null; amount: number; reason: string; whole?: boolean },
  now = new Date(),
): Promise<{ creditNo: string; amount: number } | null> {
  const inv = await db.invoice.findFirst({ where: { orderId: args.orderId } });
  if (!inv) return null;
  const prior = await db.creditNote.findMany({ where: { invoiceId: inv.id }, select: { amount: true } });
  const left = inv.amount - prior.reduce((n, c) => n + c.amount, 0);
  const amount = args.whole ? left : Math.min(args.amount, left);
  if (!(amount > 0)) return null;
  return withNextNo(db.creditNote, "creditNo", CREDIT_PREFIX, now, async creditNo => {
    await db.creditNote.create({
      data: {
        creditNo, orderId: args.orderId, invoiceId: inv.id, refundId: args.refundId ?? null, amount, reason: args.reason,
        buyerName: inv.buyerName ?? null, buyerTaxId: inv.buyerTaxId ?? null, buyerBranch: inv.buyerBranch ?? null, buyerAddress: inv.buyerAddress ?? null,
      },
    });
    return { creditNo, amount };
  });
}
