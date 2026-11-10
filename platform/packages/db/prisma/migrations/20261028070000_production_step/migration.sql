-- where each order is on the production line (0 = not started, 1-9 factory steps, 10 = shipped)
ALTER TABLE "orders" ADD COLUMN "production_step" INTEGER NOT NULL DEFAULT 0;

-- history entries can record a production step
ALTER TABLE "order_status_history" ADD COLUMN "step" INTEGER;

-- orders already past the line
UPDATE "orders" SET "production_step" = 10 WHERE "status" IN ('shipped', 'delivered', 'completed');
UPDATE "orders" SET "production_step" = 1 WHERE "status" = 'in_production';
