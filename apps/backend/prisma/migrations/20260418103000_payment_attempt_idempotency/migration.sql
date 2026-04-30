ALTER TABLE "payment_attempts"
ADD COLUMN "idempotency_key" TEXT,
ADD COLUMN "idempotency_hash" TEXT;

CREATE UNIQUE INDEX "payment_attempts_user_id_idempotency_key_key"
ON "payment_attempts"("user_id", "idempotency_key");

CREATE INDEX "payment_attempts_idempotency_key_created_at_idx"
ON "payment_attempts"("idempotency_key", "created_at");
