-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('draft', 'published', 'unlisted');

-- AlterTable
ALTER TABLE "quote_requests" ADD COLUMN     "admin_note" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "recovery_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "suspend_reason" TEXT,
ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totp_secret" TEXT;

-- CreateTable
CREATE TABLE "admin_audits" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_email" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" TEXT,
    "payload" JSONB,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "status" INTEGER,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "terms_acceptances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "ref" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_templates" (
    "id" TEXT NOT NULL,
    "designer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price" INTEGER NOT NULL DEFAULT 0,
    "preview_url" TEXT,
    "state_json" JSONB NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'draft',
    "sales_count" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "preview_hash" TEXT,
    "takedown_at" TIMESTAMP(3),
    "takedown_reason" TEXT,
    "earnings_frozen" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "market_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_reports" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "reporter_id" TEXT,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "admin_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designer_payouts" (
    "id" TEXT NOT NULL,
    "designer_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sales_count" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "designer_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_purchases" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "platform_fee" INTEGER NOT NULL,
    "designer_earning" INTEGER NOT NULL,
    "commission_pct" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "paid_out" BOOLEAN NOT NULL DEFAULT false,
    "payout_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audits_actor_id_idx" ON "admin_audits"("actor_id");

-- CreateIndex
CREATE INDEX "admin_audits_action_idx" ON "admin_audits"("action");

-- CreateIndex
CREATE INDEX "admin_audits_created_at_idx" ON "admin_audits"("created_at");

-- CreateIndex
CREATE INDEX "terms_acceptances_user_id_idx" ON "terms_acceptances"("user_id");

-- CreateIndex
CREATE INDEX "terms_acceptances_kind_idx" ON "terms_acceptances"("kind");

-- CreateIndex
CREATE INDEX "market_templates_status_idx" ON "market_templates"("status");

-- CreateIndex
CREATE INDEX "market_templates_designer_id_idx" ON "market_templates"("designer_id");

-- CreateIndex
CREATE INDEX "market_templates_category_idx" ON "market_templates"("category");

-- CreateIndex
CREATE INDEX "market_templates_preview_hash_idx" ON "market_templates"("preview_hash");

-- CreateIndex
CREATE INDEX "template_reports_status_idx" ON "template_reports"("status");

-- CreateIndex
CREATE INDEX "template_reports_template_id_idx" ON "template_reports"("template_id");

-- CreateIndex
CREATE INDEX "designer_payouts_designer_id_idx" ON "designer_payouts"("designer_id");

-- CreateIndex
CREATE INDEX "template_purchases_buyer_id_idx" ON "template_purchases"("buyer_id");

-- CreateIndex
CREATE INDEX "template_purchases_template_id_idx" ON "template_purchases"("template_id");

-- CreateIndex
CREATE INDEX "template_purchases_paid_out_idx" ON "template_purchases"("paid_out");

-- CreateIndex
CREATE UNIQUE INDEX "template_purchases_template_id_buyer_id_key" ON "template_purchases"("template_id", "buyer_id");

-- AddForeignKey
ALTER TABLE "admin_audits" ADD CONSTRAINT "admin_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_templates" ADD CONSTRAINT "market_templates_designer_id_fkey" FOREIGN KEY ("designer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_reports" ADD CONSTRAINT "template_reports_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "market_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_reports" ADD CONSTRAINT "template_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designer_payouts" ADD CONSTRAINT "designer_payouts_designer_id_fkey" FOREIGN KEY ("designer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_purchases" ADD CONSTRAINT "template_purchases_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "market_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_purchases" ADD CONSTRAINT "template_purchases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_purchases" ADD CONSTRAINT "template_purchases_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "designer_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
