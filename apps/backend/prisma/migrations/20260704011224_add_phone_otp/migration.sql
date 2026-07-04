-- CreateEnum
CREATE TYPE "WalletTopUpStatus" AS ENUM ('INITIATED', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduledRideStatus" AS ENUM ('PENDING', 'DISPATCHING', 'MATCHED', 'CANCELLED', 'COMPLETED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "AuthProvider" ADD VALUE 'PHONE';

-- NOTE: "ride_requests_single_active_per_rider_idx", "trips_single_active_per_rider_idx",
-- and "orbi_rate_limit_counters" are managed by hand-written SQL migrations (they aren't
-- representable in schema.prisma — partial unique indexes and a raw-SQL-only table).
-- Prisma's diff engine sees them as drift and generates DROP statements for them on every
-- migrate dev run; those statements are intentionally stripped from this file. Do not
-- reintroduce them.

-- AlterTable
ALTER TABLE "promo_codes" ALTER COLUMN "valid_from" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "valid_to" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "locked_until" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "phone_otps" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_top_ups" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" "WalletTopUpStatus" NOT NULL DEFAULT 'INITIATED',
    "deposit_id" TEXT,
    "mobile_money_network" TEXT,
    "customer_phone_number" TEXT,
    "failure_reason" TEXT,
    "provider_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_top_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_rides" (
    "id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "pickup_latitude" DECIMAL(65,30),
    "pickup_longitude" DECIMAL(65,30),
    "destination_address" TEXT NOT NULL,
    "destination_latitude" DECIMAL(65,30),
    "destination_longitude" DECIMAL(65,30),
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "vehicle_type" TEXT NOT NULL DEFAULT 'MOTORCYCLE',
    "payment_method" TEXT NOT NULL DEFAULT 'MOBILE_MONEY',
    "city" TEXT NOT NULL DEFAULT 'OUAGADOUGOU',
    "status" "ScheduledRideStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "promo_code" TEXT,
    "estimated_fare" INTEGER,
    "trip_id" TEXT,
    "dispatch_started_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_rides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_otps_phone_number_role_consumed_at_expires_at_idx" ON "phone_otps"("phone_number", "role", "consumed_at", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_top_ups_deposit_id_key" ON "wallet_top_ups"("deposit_id");

-- CreateIndex
CREATE INDEX "wallet_top_ups_wallet_id_status_created_at_idx" ON "wallet_top_ups"("wallet_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "wallet_top_ups_user_id_status_created_at_idx" ON "wallet_top_ups"("user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_rides_trip_id_key" ON "scheduled_rides"("trip_id");

-- CreateIndex
CREATE INDEX "scheduled_rides_rider_id_status_idx" ON "scheduled_rides"("rider_id", "status");

-- CreateIndex
CREATE INDEX "scheduled_rides_scheduled_for_status_idx" ON "scheduled_rides"("scheduled_for", "status");

-- CreateIndex
CREATE INDEX "scheduled_rides_status_scheduled_for_idx" ON "scheduled_rides"("status", "scheduled_for");

-- AddForeignKey
ALTER TABLE "wallet_top_ups" ADD CONSTRAINT "wallet_top_ups_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_top_ups" ADD CONSTRAINT "wallet_top_ups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_rides" ADD CONSTRAINT "scheduled_rides_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
