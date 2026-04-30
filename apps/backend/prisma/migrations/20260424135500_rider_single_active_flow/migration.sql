-- Enforce at most one active ride request per rider at the database level.
CREATE UNIQUE INDEX "ride_requests_single_active_per_rider_idx"
ON "ride_requests" ("rider_id")
WHERE "status" IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVING');

-- Enforce at most one active trip per rider at the database level.
CREATE UNIQUE INDEX "trips_single_active_per_rider_idx"
ON "trips" ("rider_id")
WHERE "status" IN ('MATCHED', 'DRIVER_ARRIVING', 'IN_PROGRESS');
