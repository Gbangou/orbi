-- Preserve database-level guards that Prisma cannot express in schema.prisma.
CREATE UNIQUE INDEX IF NOT EXISTS "ride_requests_single_active_per_rider_idx"
ON "ride_requests" ("rider_id")
WHERE "status" IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVING');

CREATE UNIQUE INDEX IF NOT EXISTS "trips_single_active_per_rider_idx"
ON "trips" ("rider_id")
WHERE "status" IN ('MATCHED', 'DRIVER_ARRIVING', 'IN_PROGRESS');
