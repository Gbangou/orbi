CREATE TABLE "promo_codes" (
  "id"             TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "description"    TEXT,
  "discount_bps"   INTEGER NOT NULL,
  "max_uses"       INTEGER,
  "used_count"     INTEGER NOT NULL DEFAULT 0,
  "valid_from"     TIMESTAMPTZ NOT NULL,
  "valid_to"       TIMESTAMPTZ NOT NULL,
  "first_trip_only" BOOLEAN NOT NULL DEFAULT true,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL,

  CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");
CREATE INDEX "promo_codes_active_valid_to_idx" ON "promo_codes"("active", "valid_to");
