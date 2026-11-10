-- Full tax invoice (ใบกำกับภาษีเต็มรูป): the customer's tax details on the order,
-- and the buyer frozen onto the invoice when it is issued.
ALTER TABLE "orders" ADD COLUMN "tax_invoice" TEXT;

ALTER TABLE "invoices" ADD COLUMN "buyer_name" TEXT,
ADD COLUMN "buyer_tax_id" TEXT,
ADD COLUMN "buyer_branch" TEXT,
ADD COLUMN "buyer_address" TEXT;
