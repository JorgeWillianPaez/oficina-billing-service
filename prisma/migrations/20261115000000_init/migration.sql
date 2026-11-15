-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL,
    "checkout_id" TEXT,
    "checkout_url" TEXT,
    "payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budgets_order_id_key" ON "budgets"("order_id");

-- CreateIndex
CREATE INDEX "budgets_customer_id_idx" ON "budgets"("customer_id");

-- CreateIndex
CREATE INDEX "budgets_status_idx" ON "budgets"("status");

