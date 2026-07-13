CREATE TABLE "rider_trusted_contacts" (
  "id" TEXT NOT NULL,
  "rider_id" TEXT NOT NULL,
  "label" TEXT NOT NULL DEFAULT 'Contact principal',
  "phone_number" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rider_trusted_contacts_pkey" PRIMARY KEY ("id")
);

INSERT INTO "rider_trusted_contacts" (
  "id",
  "rider_id",
  "label",
  "phone_number",
  "priority",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  'rtc_' || "id",
  "id",
  'Contact principal',
  "emergency_phone",
  1,
  true,
  "created_at",
  "updated_at"
FROM "rider_profiles"
WHERE "emergency_phone" IS NOT NULL;

CREATE UNIQUE INDEX "rider_trusted_contacts_rider_id_phone_number_key"
ON "rider_trusted_contacts"("rider_id", "phone_number");

CREATE INDEX "rider_trusted_contacts_rider_id_is_active_priority_idx"
ON "rider_trusted_contacts"("rider_id", "is_active", "priority");

ALTER TABLE "rider_trusted_contacts"
ADD CONSTRAINT "rider_trusted_contacts_rider_id_fkey"
FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
