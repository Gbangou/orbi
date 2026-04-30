CREATE TABLE "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "event_type" TEXT NOT NULL,
    "transaction_ref" TEXT,
    "provider_reference" TEXT,
    "action" TEXT NOT NULL,
    "reconciled_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "signature_verified" BOOLEAN NOT NULL DEFAULT false,
    "raw_body_hash" TEXT,
    "payload" JSONB NOT NULL,
    "payment_attempt_id" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_webhook_events_provider_event_type_created_at_idx"
ON "payment_webhook_events"("provider", "event_type", "created_at");

CREATE INDEX "payment_webhook_events_provider_provider_reference_created_at_idx"
ON "payment_webhook_events"("provider", "provider_reference", "created_at");

CREATE INDEX "payment_webhook_events_transaction_ref_created_at_idx"
ON "payment_webhook_events"("transaction_ref", "created_at");

CREATE INDEX "payment_webhook_events_action_created_at_idx"
ON "payment_webhook_events"("action", "created_at");

CREATE INDEX "payment_webhook_events_payment_attempt_id_created_at_idx"
ON "payment_webhook_events"("payment_attempt_id", "created_at");

ALTER TABLE "payment_webhook_events"
ADD CONSTRAINT "payment_webhook_events_payment_attempt_id_fkey"
FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_webhook_events"
ADD CONSTRAINT "payment_webhook_events_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
