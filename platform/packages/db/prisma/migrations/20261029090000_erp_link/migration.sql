-- Production tracking from the factory ERP: the web order's ERP order number,
-- the ERP's last answer (steps and dates) and when it was fetched.
ALTER TABLE "orders" ADD COLUMN "erp_order_no" TEXT,
ADD COLUMN "erp_status" JSONB,
ADD COLUMN "erp_synced_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "orders_erp_order_no_key" ON "orders"("erp_order_no");
