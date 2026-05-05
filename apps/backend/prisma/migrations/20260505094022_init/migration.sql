-- DropIndex
DROP INDEX "ride_requests_single_active_per_rider_idx";

-- DropIndex
DROP INDEX "trips_single_active_per_rider_idx";

-- RenameIndex
ALTER INDEX "payment_webhook_events_provider_provider_reference_created_at_i" RENAME TO "payment_webhook_events_provider_provider_reference_created__idx";
