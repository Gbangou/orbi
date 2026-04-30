ALTER TABLE "ride_requests"
ADD COLUMN "assigned_driver_id" TEXT,
ADD COLUMN "assignment_expires_at" TIMESTAMP(3);

CREATE INDEX "ride_requests_assigned_driver_id_assignment_expires_at_idx"
ON "ride_requests"("assigned_driver_id", "assignment_expires_at");
