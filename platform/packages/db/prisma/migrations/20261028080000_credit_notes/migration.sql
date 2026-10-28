-- ใบลดหนี้ (credit notes): lower the value of an issued invoice
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "credit_no" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "refund_id" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "buyer_name" TEXT,
    "buyer_tax_id" TEXT,
    "buyer_branch" TEXT,
    "buyer_address" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_notes_credit_no_key" ON "credit_notes"("credit_no");
CREATE UNIQUE INDEX "credit_notes_refund_id_key" ON "credit_notes"("refund_id");
CREATE INDEX "credit_notes_order_id_idx" ON "credit_notes"("order_id");

ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
