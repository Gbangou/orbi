CREATE TYPE "PricingCity" AS ENUM (
    'OUAGADOUGOU',
    'BOBO_DIOULASSO',
    'KOUDOUGOU',
    'BANFORA',
    'OUAHIGOUYA'
);

CREATE TYPE "DistrictProfile" AS ENUM (
    'CBD',
    'UNIVERSITY',
    'GOVERNMENT',
    'AIRPORT',
    'RESIDENTIAL_STANDARD',
    'RESIDENTIAL_PERIPHERAL',
    'MARKET_DENSE',
    'INDUSTRIAL',
    'INTERCITY_GATE'
);

ALTER TABLE "ride_requests"
ADD COLUMN "pricing_city" "PricingCity" NOT NULL DEFAULT 'OUAGADOUGOU',
ADD COLUMN "district_profile" "DistrictProfile" NOT NULL DEFAULT 'RESIDENTIAL_STANDARD';

CREATE INDEX "ride_requests_pricing_city_district_profile_created_at_idx"
ON "ride_requests"("pricing_city", "district_profile", "created_at");
