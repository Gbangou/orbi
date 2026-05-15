import { randomUUID } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

export type JobQueueKind =
  | 'PAYMENT_WEBHOOK'
  | 'PAYMENT_REFUND_VERIFICATION'
  | 'DRIVER_DOCUMENT'
  | 'NOTIFICATION'
  | 'DRIVER_RESERVATION_EXPIRY';
export type JobQueueStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'DEAD_LETTER';

export type JobQueueEntry = {
  id: string;
  kind: JobQueueKind;
  status: JobQueueStatus;
  dedupeKey: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
  nextRunAt: Date;
  lockedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  deadLetterReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type JobQueueRow = {
  id: string;
  kind: JobQueueKind;
  status: JobQueueStatus;
  dedupe_key: string | null;
  entity_type: string | null;
  entity_id: string | null;
  payload: Prisma.JsonValue;
  attempts: number;
  max_attempts: number;
  next_run_at: Date;
  locked_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  last_error: string | null;
  dead_letter_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class JobQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: {
    kind: JobQueueKind;
    payload: Prisma.InputJsonValue;
    dedupeKey?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    maxAttempts?: number;
    nextRunAt?: Date;
    resetSucceededOnDedupe?: boolean;
  }) {
    this.assertKnownKind(input.kind);
    const maxAttempts = input.maxAttempts ?? 5;

    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 25) {
      throw new BadRequestException(
        'Job maxAttempts must be between 1 and 25.',
      );
    }

    const rows = await this.prisma.$queryRaw<JobQueueRow[]>`
      INSERT INTO job_queue_entries (
        id,
        kind,
        status,
        dedupe_key,
        entity_type,
        entity_id,
        payload,
        max_attempts,
        next_run_at,
        updated_at
      )
      VALUES (
        ${randomUUID()},
        ${input.kind}::"JobQueueKind",
        'PENDING'::"JobQueueStatus",
        ${input.dedupeKey ?? null},
        ${input.entityType ?? null},
        ${input.entityId ?? null},
        ${input.payload}::jsonb,
        ${maxAttempts},
        ${input.nextRunAt ?? new Date()},
        NOW()
      )
      ON CONFLICT (dedupe_key) DO UPDATE SET
        status = CASE
          WHEN ${input.resetSucceededOnDedupe ?? false} = TRUE
            AND job_queue_entries.status = 'SUCCEEDED'::"JobQueueStatus"
            THEN 'PENDING'::"JobQueueStatus"
          ELSE job_queue_entries.status
        END,
        payload = EXCLUDED.payload,
        entity_type = EXCLUDED.entity_type,
        entity_id = EXCLUDED.entity_id,
        attempts = CASE
          WHEN ${input.resetSucceededOnDedupe ?? false} = TRUE
            AND job_queue_entries.status = 'SUCCEEDED'::"JobQueueStatus"
            THEN 0
          ELSE job_queue_entries.attempts
        END,
        next_run_at = LEAST(job_queue_entries.next_run_at, EXCLUDED.next_run_at),
        completed_at = CASE
          WHEN ${input.resetSucceededOnDedupe ?? false} = TRUE
            AND job_queue_entries.status = 'SUCCEEDED'::"JobQueueStatus"
            THEN NULL
          ELSE job_queue_entries.completed_at
        END,
        updated_at = NOW()
      RETURNING *
    `;

    return this.mapRow(rows[0]);
  }

  async claimDueJobs(input: { kinds?: JobQueueKind[]; limit?: number } = {}) {
    const limit = input.limit ?? 10;

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException(
        'Job claim limit must be between 1 and 100.',
      );
    }

    for (const kind of input.kinds ?? []) {
      this.assertKnownKind(kind);
    }

    const rows = await this.prisma.$queryRaw<JobQueueRow[]>`
      UPDATE job_queue_entries
      SET
        status = 'RUNNING'::"JobQueueStatus",
        attempts = attempts + 1,
        locked_at = NOW(),
        updated_at = NOW()
      WHERE id IN (
        SELECT id
        FROM job_queue_entries
        WHERE status = 'PENDING'::"JobQueueStatus"
          AND next_run_at <= NOW()
          AND (${input.kinds ?? []}::"JobQueueKind"[] = '{}' OR kind = ANY(${input.kinds ?? []}::"JobQueueKind"[]))
        ORDER BY next_run_at ASC, created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;

    return rows.map((row) => this.mapRow(row));
  }

  async recoverStaleRunningJobs(input: {
    olderThanMs: number;
    kinds?: JobQueueKind[];
    limit?: number;
  }) {
    const limit = input.limit ?? 25;

    if (!Number.isInteger(input.olderThanMs) || input.olderThanMs < 60_000) {
      throw new BadRequestException(
        'Stale job threshold must be at least 60000ms.',
      );
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException(
        'Stale job recovery limit must be between 1 and 100.',
      );
    }

    for (const kind of input.kinds ?? []) {
      this.assertKnownKind(kind);
    }

    const rows = await this.prisma.$queryRaw<JobQueueRow[]>`
      UPDATE job_queue_entries
      SET
        status = 'PENDING'::"JobQueueStatus",
        next_run_at = NOW(),
        locked_at = NULL,
        last_error = 'Recovered stale RUNNING job after worker interruption.',
        updated_at = NOW()
      WHERE id IN (
        SELECT id
        FROM job_queue_entries
        WHERE status = 'RUNNING'::"JobQueueStatus"
          AND locked_at IS NOT NULL
          AND locked_at <= NOW() - (${input.olderThanMs}::integer * INTERVAL '1 millisecond')
          AND (${input.kinds ?? []}::"JobQueueKind"[] = '{}' OR kind = ANY(${input.kinds ?? []}::"JobQueueKind"[]))
        ORDER BY locked_at ASC, created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;

    return rows.map((row) => this.mapRow(row));
  }

  async complete(jobId: string, input: { lockedAt?: Date | null } = {}) {
    const rows = await this.prisma.$queryRaw<JobQueueRow[]>`
      UPDATE job_queue_entries
      SET
        status = 'SUCCEEDED'::"JobQueueStatus",
        completed_at = NOW(),
        locked_at = NULL,
        last_error = NULL,
        updated_at = NOW()
      WHERE id = ${jobId}
        AND status = 'RUNNING'::"JobQueueStatus"
        AND (${input.lockedAt ?? null}::timestamp IS NULL OR locked_at = ${input.lockedAt ?? null})
      RETURNING *
    `;

    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async fail(
    jobId: string,
    input: {
      error: string;
      retryDelayMs?: number;
      deadLetterReason?: string;
      lockedAt?: Date | null;
    },
  ) {
    const error = input.error.slice(0, 1_000);
    const retryDelayMs = input.retryDelayMs ?? 60_000;

    if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0) {
      throw new BadRequestException('Job retryDelayMs must be positive.');
    }

    const rows = await this.prisma.$queryRaw<JobQueueRow[]>`
      UPDATE job_queue_entries
      SET
        status = CASE
          WHEN attempts >= max_attempts THEN 'DEAD_LETTER'::"JobQueueStatus"
          ELSE 'PENDING'::"JobQueueStatus"
        END,
        next_run_at = NOW() + (${retryDelayMs}::integer * INTERVAL '1 millisecond'),
        locked_at = NULL,
        failed_at = NOW(),
        last_error = ${error},
        dead_letter_reason = CASE
          WHEN attempts >= max_attempts THEN ${input.deadLetterReason ?? error}
          ELSE dead_letter_reason
        END,
        updated_at = NOW()
      WHERE id = ${jobId}
        AND status = 'RUNNING'::"JobQueueStatus"
        AND (${input.lockedAt ?? null}::timestamp IS NULL OR locked_at = ${input.lockedAt ?? null})
      RETURNING *
    `;

    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async list(input: {
    page: number;
    pageSize: number;
    kind?: JobQueueKind;
    status?: JobQueueStatus;
  }) {
    if (input.kind) {
      this.assertKnownKind(input.kind);
    }

    if (input.status) {
      this.assertKnownStatus(input.status);
    }

    const rows = await this.prisma.$queryRaw<JobQueueRow[]>`
      SELECT *
      FROM job_queue_entries
      WHERE (${input.kind ?? null}::"JobQueueKind" IS NULL OR kind = ${input.kind ?? null}::"JobQueueKind")
        AND (${input.status ?? null}::"JobQueueStatus" IS NULL OR status = ${input.status ?? null}::"JobQueueStatus")
      ORDER BY
        CASE WHEN status = 'DEAD_LETTER'::"JobQueueStatus" THEN 0 ELSE 1 END,
        updated_at DESC,
        created_at DESC
      LIMIT ${input.pageSize}
      OFFSET ${(input.page - 1) * input.pageSize}
    `;
    const totalRows = await this.prisma.$queryRaw<Array<{ count: string }>>`
      SELECT COUNT(*) AS count
      FROM job_queue_entries
      WHERE (${input.kind ?? null}::"JobQueueKind" IS NULL OR kind = ${input.kind ?? null}::"JobQueueKind")
        AND (${input.status ?? null}::"JobQueueStatus" IS NULL OR status = ${input.status ?? null}::"JobQueueStatus")
    `;
    const total = Number(totalRows[0]?.count ?? 0);

    return {
      jobs: rows.map((row) => this.mapRow(row)),
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        pageCount: Math.ceil(total / input.pageSize),
      },
    };
  }

  async requeueDeadLetter(jobId: string) {
    const rows = await this.prisma.$queryRaw<JobQueueRow[]>`
      UPDATE job_queue_entries
      SET
        status = 'PENDING'::"JobQueueStatus",
        next_run_at = NOW(),
        locked_at = NULL,
        completed_at = NULL,
        dead_letter_reason = NULL,
        updated_at = NOW()
      WHERE id = ${jobId}
        AND status = 'DEAD_LETTER'::"JobQueueStatus"
      RETURNING *
    `;

    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async snapshot() {
    const rows = await this.prisma.$queryRaw<
      Array<{ kind: JobQueueKind; status: JobQueueStatus; count: string }>
    >`
      SELECT kind, status, COUNT(*) AS count
      FROM job_queue_entries
      GROUP BY kind, status
      ORDER BY kind, status
    `;

    return {
      durable: true,
      families: [
        'PAYMENT_WEBHOOK',
        'PAYMENT_REFUND_VERIFICATION',
        'DRIVER_DOCUMENT',
        'NOTIFICATION',
        'DRIVER_RESERVATION_EXPIRY',
      ] as const,
      counts: rows.map((row) => ({
        kind: row.kind,
        status: row.status,
        count: Number(row.count),
      })),
    };
  }

  private mapRow(row: JobQueueRow): JobQueueEntry {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      dedupeKey: row.dedupe_key,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      nextRunAt: row.next_run_at,
      lockedAt: row.locked_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
      lastError: row.last_error,
      deadLetterReason: row.dead_letter_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private assertKnownKind(kind: string) {
    if (
      ![
        'PAYMENT_WEBHOOK',
        'PAYMENT_REFUND_VERIFICATION',
        'DRIVER_DOCUMENT',
        'NOTIFICATION',
        'DRIVER_RESERVATION_EXPIRY',
      ].includes(kind)
    ) {
      throw new BadRequestException(`Unsupported job kind ${kind}.`);
    }
  }

  private assertKnownStatus(status: string) {
    if (!['PENDING', 'RUNNING', 'SUCCEEDED', 'DEAD_LETTER'].includes(status)) {
      throw new BadRequestException(`Unsupported job status ${status}.`);
    }
  }
}
