-- Consolidated shipping to the agent in Japan: the agent as it was when ordered.
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery" JSONB;
