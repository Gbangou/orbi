CREATE TYPE "RidePaymentMethod" AS ENUM ('MOBILE_MONEY', 'CASH', 'WALLET');

ALTER TABLE "ride_requests"
  ADD COLUMN "payment_method" "RidePaymentMethod" NOT NULL DEFAULT 'MOBILE_MONEY';
