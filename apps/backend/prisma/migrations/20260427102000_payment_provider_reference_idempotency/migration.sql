CREATE UNIQUE INDEX "payment_attempts_provider_provider_reference_key"
ON "payment_attempts"("provider", "provider_reference");
