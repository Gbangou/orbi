ALTER TABLE "driver_profiles"
ADD COLUMN "current_location_updated_at" TIMESTAMP(3);

UPDATE "driver_profiles"
SET "current_location_updated_at" = "updated_at"
WHERE "current_latitude" IS NOT NULL
  AND "current_longitude" IS NOT NULL;

CREATE INDEX "driver_profiles_status_verification_status_current_location_updated_at_idx"
ON "driver_profiles"("status", "verification_status", "current_location_updated_at");
