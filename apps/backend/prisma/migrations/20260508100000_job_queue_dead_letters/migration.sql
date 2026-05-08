-- CreateEnum
CREATE TYPE "JobQueueKind" AS ENUM ('PAYMENT_WEBHOOK', 'DRIVER_DOCUMENT', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "JobQueueStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "job_queue_entries" (
    "id" TEXT NOT NULL,
    "kind" "JobQueueKind" NOT NULL,
    "status" "JobQueueStatus" NOT NULL DEFAULT 'PENDING',
    "dedupe_key" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "dead_letter_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_queue_entries_dedupe_key_key" ON "job_queue_entries"("dedupe_key");

-- CreateIndex
CREATE INDEX "job_queue_entries_kind_status_next_run_at_idx" ON "job_queue_entries"("kind", "status", "next_run_at");

-- CreateIndex
CREATE INDEX "job_queue_entries_status_failed_at_idx" ON "job_queue_entries"("status", "failed_at");

-- CreateIndex
CREATE INDEX "job_queue_entries_entity_type_entity_id_created_at_idx" ON "job_queue_entries"("entity_type", "entity_id", "created_at");
