/**
 * Invoice numbers run in sequence per year: INV-2026-00001, INV-2026-00002, …
 * (a Thai tax invoice needs a running number with no gaps or repeats; this
 * gives one — the zero padding keeps text order equal to number order).
 */

export const INVOICE_PREFIX = "INV";

export function formatInvoiceNo(year: number, seq: number): string {
  return `${INVOICE_PREFIX}-${year}-${String(seq).padStart(5, "0")}`;
}

/** the running number of an invoice from that year, or null (e.g. an older random-style number) */
export function invoiceSeq(no: string, year: number): number | null {
  const m = new RegExp(`^${INVOICE_PREFIX}-${year}-(\\d{5,})$`).exec(no);
  return m ? Number(m[1]) : null;
}

type InvoiceDb = {
  invoice: {
    findFirst(args: any): Promise<{ invoiceNo: string } | null>;
    create(args: any): Promise<any>;
  };
};

/**
 * Issue the order's invoice once (idempotent), with the next number of the year.
 * Two admins approving at the same moment race for the same number: the unique
 * index on invoiceNo stops the second, which takes the next one.
 */
export interface InvoiceBuyer { name: string; taxId: string; branch: string; address: string }

export async function issueInvoice(db: InvoiceDb, orderId: string, amount: number, now = new Date(), buyer?: InvoiceBuyer | null): Promise<string | null> {
  const existing = await db.invoice.findFirst({ where: { orderId } });
  if (existing) return existing.invoiceNo;
  const year = now.getFullYear();
  for (let attempt = 0; attempt < 8; attempt++) {
    const last = await db.invoice.findFirst({
      where: { invoiceNo: { startsWith: `${INVOICE_PREFIX}-${year}-` } },
      orderBy: { invoiceNo: "desc" },
      select: { invoiceNo: true },
    });
    const invoiceNo = formatInvoiceNo(year, (last ? invoiceSeq(last.invoiceNo, year) ?? 0 : 0) + 1);
    try {
      await db.invoice.create({
        data: {
          orderId, invoiceNo, amount, taxId: process.env.COMPANY_TAX_ID ?? null,
          // the buyer is frozen onto the invoice: a tax invoice never changes after it is issued
          ...(buyer ? { buyerName: buyer.name, buyerTaxId: buyer.taxId, buyerBranch: buyer.branch, buyerAddress: buyer.address } : {}),
        },
      });
      return invoiceNo;
    } catch (e: any) {
      if (e?.code !== "P2002") throw e; // only a taken number is worth another try
    }
  }
  throw new Error("could not allocate an invoice number");
}
