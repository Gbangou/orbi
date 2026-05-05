-- Track prepared and paid driver payouts as first-class ops records.
CREATE TYPE "DriverPayoutStatus" AS ENUM ('PREPARED', 'PAID', 'CANCELLED');

CREATE TABLE "driver_payouts" (
  "id" TEXT NOT NULL,
  "wallet_id" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "status" "DriverPayoutStatus" NOT NULL DEFAULT 'PREPARED',
  "reference" TEXT NOT NULL,
  "prepared_lock_key" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "prepared_by_user_id" TEXT NOT NULL,
  "paid_by_user_id" TEXT,
  "prepared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "driver_payouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_payouts_reference_key"
ON "driver_payouts"("reference");

CREATE UNIQUE INDEX "driver_payouts_prepared_lock_key_key"
ON "driver_payouts"("prepared_lock_key");

CREATE INDEX "driver_payouts_wallet_id_status_created_at_idx"
ON "driver_payouts"("wallet_id", "status", "created_at");

CREATE INDEX "driver_payouts_status_created_at_idx"
ON "driver_payouts"("status", "created_at");

ALTER TABLE "driver_payouts"
ADD CONSTRAINT "driver_payouts_wallet_id_fkey"
FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_payouts"
ADD CONSTRAINT "driver_payouts_prepared_by_user_id_fkey"
FOREIGN KEY ("prepared_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_payouts"
ADD CONSTRAINT "driver_payouts_paid_by_user_id_fkey"
FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
