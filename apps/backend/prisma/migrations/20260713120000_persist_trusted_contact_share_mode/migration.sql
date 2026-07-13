CREATE TYPE "TrustedContactShareMode" AS ENUM ('MANUAL', 'NIGHT', 'ALL_TRIPS');

ALTER TABLE "rider_profiles"
ADD COLUMN "trusted_contact_share_mode" "TrustedContactShareMode" NOT NULL DEFAULT 'MANUAL';
