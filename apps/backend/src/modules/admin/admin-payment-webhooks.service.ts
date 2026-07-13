/**
 * AdminPaymentWebhooksService — Gestion des webhooks de paiement
 *
 * Responsabilité unique: consultation, investigation et replay des
 * événements de webhook paiement (Flutterwave, CinetPay).
 * Extrait de AdminService pour respecter le Single Responsibility Principle.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SupportTicketStatus } from '@prisma/client';
import {
  PageQueryDto,
  resolvePageQuery,
} from '../../common/dto/page-query.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { PaymentsService } from '../payments/payments.service';
import { PaymentAttemptRefundDto } from './dto/payment-attempt-refund.dto';
import { PaymentWebhookEventsQueryDto } from './dto/payment-webhook-events-query.dto';

const sensitivePayloadKeys = new Set([
  'authorization', 'card', 'cel_phone_num', 'cpm_phone_prefixe',
  'customerPhoneNumber', 'email', 'msisdn', 'phone', 'phoneNumber',
  'secret', 'signature', 'token', 'x-token',
]);

function redactPaymentPayload(value: Prisma.JsonValue): Prisma.JsonValue {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactPaymentPayload(item));
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitivePayloadKeys.has(key) ? '[redacted]' : redactPaymentPayload(entry as Prisma.JsonValue),
    ]),
  );
}

function summarizePaymentPayload(value: Prisma.JsonValue) {
  const redacted = redactPaymentPayload(value);
  if (!redacted || typeof redacted !== 'object' || Array.isArray(redacted)) return {};
  const record = redacted as Record<string, Prisma.JsonValue>;
  const fields = [
    'event', 'status', 'transactionRef', 'providerReference',
    'cpm_trans_id', 'cpm_amount', 'cpm_currency', 'payment_method', 'cpm_error_message',
  ];
  return Object.fromEntries(
    fields
      .filter((field) => record[field] !== undefined && record[field] !== null)
      .map((field) => [field, record[field]]),
  );
}

@Injectable()
export class AdminPaymentWebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async paymentWebhookEvents(
    query: PaymentWebhookEventsQueryDto = new PaymentWebhookEventsQueryDto(),
  ) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const where: Prisma.PaymentWebhookEventWhereInput = {
      provider: query.provider,
      action: query.action,
      transactionRef: query.transactionRef?.trim() || undefined,
      providerReference: query.providerReference?.trim() || undefined,
    };
    if (!query.action && query.kind) {
      where.action = {
        in: this.resolvePaymentWebhookKindActions(query.kind),
      };
    }
    const [events, total] = await Promise.all([
      this.prisma.paymentWebhookEvent.findMany({
        skip,
        take,
        where,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          provider: true,
          eventType: true,
          transactionRef: true,
          providerReference: true,
          action: true,
          reconciledAttemptCount: true,
          signatureVerified: true,
          rawBodyHash: true,
          payload: true,
          paymentAttemptId: true,
          userId: true,
          createdAt: true,
          paymentAttempt: {
            select: {
              status: true,
              amount: true,
              currency: true,
              rideRequestId: true,
              failureReason: true,
              updatedAt: true,
            },
          },
        },
      }),
      this.prisma.paymentWebhookEvent.count({
        where,
      }),
    ]);

    return {
      events: events.map((event) => ({
        id: event.id,
        provider: event.provider,
        eventType: event.eventType,
        transactionRef: event.transactionRef,
        providerReference: event.providerReference,
        action: event.action,
        reconciledAttemptCount: event.reconciledAttemptCount,
        signatureVerified: event.signatureVerified,
        rawBodyHash: event.rawBodyHash,
        payloadPreview: summarizePaymentPayload(event.payload),
        paymentAttemptId: event.paymentAttemptId,
        userId: event.userId,
        createdAt: event.createdAt.toISOString(),
        paymentAttempt: event.paymentAttempt
          ? {
              status: event.paymentAttempt.status,
              amount: Number(event.paymentAttempt.amount),
              currency: event.paymentAttempt.currency,
              rideRequestId: event.paymentAttempt.rideRequestId,
              failureReason: event.paymentAttempt.failureReason,
              updatedAt: event.paymentAttempt.updatedAt.toISOString(),
            }
          : null,
      })),
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
      summary: {
        paymentEvents: events.filter((event) =>
          event.action.startsWith('persisted_'),
        ).length,
        refundEvents: events.filter((event) =>
          event.action.startsWith('refund_'),
        ).length,
        ignoredEvents: events.filter((event) =>
          event.action.startsWith('ignored_'),
        ).length,
      },
    };
  }

  async paymentWebhookEventDetail(eventId: string) {
    const event = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        provider: true,
        eventType: true,
        transactionRef: true,
        providerReference: true,
        action: true,
        reconciledAttemptCount: true,
        signatureVerified: true,
        rawBodyHash: true,
        payload: true,
        paymentAttemptId: true,
        userId: true,
        createdAt: true,
        paymentAttempt: {
          select: {
            status: true,
            amount: true,
            currency: true,
            rideRequestId: true,
            failureReason: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Payment webhook event not found.');
    }

    return {
      event: {
        id: event.id,
        provider: event.provider,
        eventType: event.eventType,
        transactionRef: event.transactionRef,
        providerReference: event.providerReference,
        action: event.action,
        reconciledAttemptCount: event.reconciledAttemptCount,
        signatureVerified: event.signatureVerified,
        rawBodyHash: event.rawBodyHash,
        payload: redactPaymentPayload(event.payload),
        payloadPreview: summarizePaymentPayload(event.payload),
        paymentAttemptId: event.paymentAttemptId,
        userId: event.userId,
        createdAt: event.createdAt.toISOString(),
        paymentAttempt: event.paymentAttempt
          ? {
              status: event.paymentAttempt.status,
              amount: Number(event.paymentAttempt.amount),
              currency: event.paymentAttempt.currency,
              rideRequestId: event.paymentAttempt.rideRequestId,
              failureReason: event.paymentAttempt.failureReason,
              updatedAt: event.paymentAttempt.updatedAt.toISOString(),
            }
          : null,
      },
    };
  }

  async startPaymentWebhookInvestigation(
    eventId: string,
    auth: RequestAuthContext,
  ) {
    const event = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        provider: true,
        eventType: true,
        transactionRef: true,
        providerReference: true,
        action: true,
        userId: true,
        paymentAttemptId: true,
        paymentAttempt: {
          select: {
            userId: true,
            rideRequestId: true,
            status: true,
            failureReason: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Payment webhook event not found.');
    }

    const targetUserId = event.userId ?? event.paymentAttempt?.userId ?? null;
    let supportTicket: {
      id: string;
      status: SupportTicketStatus;
      priority: number;
    } | null = null;

    if (targetUserId) {
      const subject = `Investigation paiement webhook ${event.id}`;
      const existingTicket = await this.prisma.supportTicket.findFirst({
        where: {
          userId: targetUserId,
          subject,
          status: {
            in: [SupportTicketStatus.OPEN, SupportTicketStatus.IN_REVIEW],
          },
        },
        select: {
          id: true,
          status: true,
          priority: true,
        },
      });

      supportTicket =
        existingTicket ??
        (await this.prisma.supportTicket.create({
          data: {
            userId: targetUserId,
            subject,
            description: [
              `Provider: ${event.provider}`,
              `Event: ${event.eventType}`,
              `Action: ${event.action}`,
              `Transaction: ${event.transactionRef ?? 'absente'}`,
              `Reference fournisseur: ${event.providerReference ?? 'absente'}`,
              `PaymentAttempt: ${event.paymentAttemptId ?? 'absente'}`,
            ].join('\n'),
            priority:
              event.action === 'ignored_conflicting_provider_reference' ? 3 : 2,
            status: SupportTicketStatus.OPEN,
          },
          select: {
            id: true,
            status: true,
            priority: true,
          },
        }));
    }

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'PAYMENT_WEBHOOK_INVESTIGATION_STARTED',
        entityType: 'PAYMENT_WEBHOOK_EVENT',
        entityId: event.id,
        metadata: {
          provider: event.provider,
          eventType: event.eventType,
          transactionRef: event.transactionRef,
          providerReference: event.providerReference,
          webhookAction: event.action,
          paymentAttemptId: event.paymentAttemptId,
          supportTicketId: supportTicket?.id ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'payment-webhook.investigation-started',
      entityId: event.id,
      actorRole: auth.user.role,
      payload: {
        provider: event.provider,
        action: event.action,
        supportTicketId: supportTicket?.id ?? null,
      },
    });

    return {
      investigation: {
        eventId: event.id,
        status: 'STARTED',
        supportTicket: supportTicket
          ? {
              id: supportTicket.id,
              status: supportTicket.status,
              priority: supportTicket.priority,
            }
          : null,
      },
    };
  }

  async replayPaymentWebhookEvent(eventId: string, auth: RequestAuthContext) {
    const replay = await this.paymentsService.replayStoredWebhookEvent(eventId);

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'PAYMENT_WEBHOOK_REPLAYED',
        entityType: 'PAYMENT_WEBHOOK_EVENT',
        entityId: eventId,
        metadata: {
          result: {
            event: replay.result.event,
            transactionRef: replay.result.transactionRef,
            provider: replay.result.provider,
            providerReference: replay.result.providerReference ?? null,
            reconciledAttemptCount: replay.result.reconciledAttemptCount,
            nextAction: replay.result.nextAction,
          },
        } as Prisma.InputJsonValue,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'payment-webhook.replayed',
      entityId: eventId,
      actorRole: auth.user.role,
      payload: {
        nextAction: replay.result.nextAction,
        reconciledAttemptCount: replay.result.reconciledAttemptCount,
        providerReference: replay.result.providerReference ?? null,
      },
    });

    return {
      replay,
    };
  }

  async verifyPaymentAttemptWithProvider(
    paymentAttemptId: string,
    auth: RequestAuthContext,
  ) {
    const verification =
      await this.paymentsService.verifyPaymentAttemptWithProvider(
        paymentAttemptId,
      );

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'PAYMENT_ATTEMPT_PROVIDER_VERIFIED',
        entityType: 'PAYMENT_ATTEMPT',
        entityId: paymentAttemptId,
        metadata: {
          result: {
            provider: verification.provider,
            transactionRef: verification.transactionRef,
            event: verification.result.event,
            providerReference: verification.result.providerReference ?? null,
            reconciledAttemptCount: verification.result.reconciledAttemptCount,
            nextAction: verification.result.nextAction,
          },
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'payment-attempt.provider-verified',
      entityId: paymentAttemptId,
      actorRole: auth.user.role,
      payload: {
        provider: verification.provider,
        nextAction: verification.result.nextAction,
        reconciledAttemptCount: verification.result.reconciledAttemptCount,
        providerReference: verification.result.providerReference ?? null,
      },
    });

    return {
      verification,
    };
  }

  async refundPaymentAttempt(
    paymentAttemptId: string,
    payload: PaymentAttemptRefundDto,
    auth: RequestAuthContext,
  ) {
    const refund = await this.paymentsService.refundPaymentAttempt(
      paymentAttemptId,
      {
        actorUserId: auth.user.id,
        actorName: auth.user.fullName ?? null,
        reason: payload.reason?.trim() || null,
      },
    );

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action:
          refund.action === 'refund_pending'
            ? 'PAYMENT_ATTEMPT_REFUND_REQUESTED'
            : 'PAYMENT_ATTEMPT_REFUNDED',
        entityType: 'PAYMENT_ATTEMPT',
        entityId: paymentAttemptId,
        metadata: {
          action: refund.action,
          provider: refund.paymentAttempt.provider,
          transactionRef: refund.paymentAttempt.transactionRef,
          amount: refund.paymentAttempt.amount,
          currency: refund.paymentAttempt.currency,
          providerRefundReference: refund.providerRefundReference,
          walletReversal: refund.walletReversal,
          reason: payload.reason?.trim() || null,
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type:
        refund.action === 'refund_pending'
          ? 'payment-attempt.refund-requested'
          : 'payment-attempt.refunded',
      entityId: paymentAttemptId,
      actorRole: auth.user.role,
      payload: {
        action: refund.action,
        status: refund.paymentAttempt.status,
        amount: refund.paymentAttempt.amount,
        currency: refund.paymentAttempt.currency,
        provider: refund.paymentAttempt.provider,
        transactionRef: refund.paymentAttempt.transactionRef,
        providerRefundReference: refund.providerRefundReference,
      },
    });

    return {
      refund,
    };
  }

  private resolvePaymentWebhookKindActions(
    kind: NonNullable<PaymentWebhookEventsQueryDto['kind']>,
  ) {
    if (kind === 'refund') {
      return ['refund_processed', 'refund_still_pending'];
    }

    if (kind === 'ignored') {
      return [
        'ignored_amount_mismatch',
        'ignored_conflicting_provider_reference',
        'ignored_unknown_reference',
        'ignored_missing_reference',
      ];
    }

    return [
      'persisted_and_reconciled',
      'persisted_idempotent_replay',
      'persisted_wallet_top_up_credited',
      'persisted_wallet_top_up_failed',
      'persisted_wallet_top_up_replay',
    ];
  }
}
