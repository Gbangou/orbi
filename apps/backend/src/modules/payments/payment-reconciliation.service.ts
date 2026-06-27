import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { JobQueueService } from '../../common/job-queue/job-queue.service';
import { Optional } from '@nestjs/common';
import { platformCommissionRate } from './payments.constants';
import type {
  PaymentAttemptStatus,
  PaymentProviderCode,
  PaymentProviderKey,
  PaymentRefundInput,
  PaymentWebhookPayload,
  PaymentWebhookSignatureContext,
} from './payments.types';

function isPrismaUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly jobQueueService?: JobQueueService,
  ) {}

  async reconcileWebhookPayload(
    payload: PaymentWebhookPayload,
    signatureContext: PaymentWebhookSignatureContext,
    providerContext: {
      provider: PaymentProviderCode;
      providerKey: PaymentProviderKey;
    },
  ) {
    const transactionRef = this.extractWebhookTransactionReference(payload);
    const event = payload.event ?? 'unknown';
    const provider = providerContext.provider;
    const providerReference = this.extractWebhookProviderReference(payload);
    const signatureVerified =
      this.wasProviderSignatureVerified(signatureContext);

    if (this.isRefundWebhookEvent(event, payload)) {
      return this.reconcileRefundWebhookPayload(payload, signatureContext, {
        provider,
        providerKey: providerContext.providerKey,
        event,
        signatureVerified,
      });
    }

    let reconciledAttemptCount = 0;
    let paymentAttemptId: string | null = null;
    let userId: string | null = null;
    let nextAction:
      | 'persisted_and_reconciled'
      | 'persisted_idempotent_replay'
      | 'ignored_amount_mismatch'
      | 'ignored_conflicting_provider_reference'
      | 'ignored_unknown_reference'
      | 'ignored_missing_reference' = transactionRef
      ? 'ignored_unknown_reference'
      : 'ignored_missing_reference';

    if (providerReference) {
      const existingProviderAttempt =
        await this.prisma.paymentAttempt.findFirst({
          where: {
            provider,
            providerReference,
          },
          select: {
            id: true,
            transactionRef: true,
            userId: true,
            amount: true,
            currency: true,
          },
        });

      if (
        existingProviderAttempt &&
        transactionRef &&
        existingProviderAttempt.transactionRef !== transactionRef
      ) {
        paymentAttemptId = existingProviderAttempt.id;
        userId = existingProviderAttempt.userId;
        const result = {
          received: true,
          event,
          transactionRef,
          provider: providerContext.providerKey,
          providerReference,
          reconciledAttemptCount,
          nextAction: 'ignored_conflicting_provider_reference',
        };

        await this.persistWebhookEvent({
          provider,
          event,
          transactionRef,
          providerReference,
          nextAction: result.nextAction,
          reconciledAttemptCount,
          signatureVerified,
          payload,
          signatureContext,
          paymentAttemptId,
          userId,
        });

        return result;
      }

      if (existingProviderAttempt) {
        const nextStatus = this.resolveWebhookStatus(event);

        if (
          this.hasWebhookPaymentAmountMismatch(
            payload,
            existingProviderAttempt,
            nextStatus,
          )
        ) {
          paymentAttemptId = existingProviderAttempt.id;
          userId = existingProviderAttempt.userId;
          nextAction = 'ignored_amount_mismatch';

          const result = {
            received: true,
            event,
            transactionRef,
            provider: providerContext.providerKey,
            providerReference,
            reconciledAttemptCount,
            nextAction,
          };

          await this.persistWebhookEvent({
            provider,
            event,
            transactionRef,
            providerReference,
            nextAction,
            reconciledAttemptCount,
            signatureVerified,
            payload,
            signatureContext,
            paymentAttemptId,
            userId,
          });

          return result;
        }

        const reconciliation = await this.prisma.paymentAttempt.updateMany({
          where: {
            id: existingProviderAttempt.id,
            status: {
              notIn: ['REFUND_PENDING', 'REFUNDED'],
            },
          },
          data: this.buildWebhookReconciliationData(
            nextStatus,
            providerReference,
            payload,
            event,
          ),
        });

        reconciledAttemptCount = reconciliation.count;
        paymentAttemptId = existingProviderAttempt.id;
        userId = existingProviderAttempt.userId;
        nextAction = 'persisted_idempotent_replay';
        if (reconciledAttemptCount > 0) {
          await this.recordSuccessfulPaymentLedgerIfNeeded(
            existingProviderAttempt.id,
            nextStatus,
          );
        }
      }
    }

    if (!reconciledAttemptCount && transactionRef) {
      const targetAttempt = await this.prisma.paymentAttempt.findUnique({
        where: {
          transactionRef,
        },
        select: {
          id: true,
          userId: true,
          amount: true,
          currency: true,
        },
      });
      const nextStatus = this.resolveWebhookStatus(event);

      if (
        targetAttempt &&
        this.hasWebhookPaymentAmountMismatch(payload, targetAttempt, nextStatus)
      ) {
        paymentAttemptId = targetAttempt.id;
        userId = targetAttempt.userId;
        nextAction = 'ignored_amount_mismatch';
      } else {
        const reconciliation = await this.prisma.paymentAttempt.updateMany({
          where: {
            transactionRef,
            status: {
              notIn: ['REFUND_PENDING', 'REFUNDED'],
            },
          },
          data: this.buildWebhookReconciliationData(
            nextStatus,
            providerReference,
            payload,
            event,
          ),
        });
        reconciledAttemptCount = reconciliation.count;
        paymentAttemptId = targetAttempt?.id ?? null;
        userId = targetAttempt?.userId ?? null;
        nextAction =
          reconciledAttemptCount > 0
            ? 'persisted_and_reconciled'
            : 'ignored_unknown_reference';
        if (reconciledAttemptCount > 0) {
          await this.recordSuccessfulPaymentLedgerIfNeeded(
            targetAttempt?.id ?? null,
            nextStatus,
          );
        }
      }
    }

    const result = {
      received: true,
      event,
      transactionRef,
      provider: providerContext.providerKey,
      providerReference,
      reconciledAttemptCount,
      nextAction,
    };

    await this.persistWebhookEvent({
      provider,
      event,
      transactionRef,
      providerReference,
      nextAction,
      reconciledAttemptCount,
      signatureVerified,
      payload,
      signatureContext,
      paymentAttemptId,
      userId,
    });

    return result;
  }

  async finalizeProcessedRefundAttemptFromProvider(
    paymentAttemptId: string,
    providerStatus: {
      raw: Record<string, unknown>;
      source: 'webhook' | 'polling';
    },
  ) {
    let reconciledAttemptCount = 0;

    await this.prisma.$transaction(async (tx) => {
      const attemptForReversal = await tx.paymentAttempt.findUnique({
        where: {
          id: paymentAttemptId,
        },
        include: {
          rideRequest: {
            include: {
              trip: {
                select: {
                  id: true,
                  driver: {
                    select: {
                      userId: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!attemptForReversal) {
        return;
      }

      if (attemptForReversal.status === 'REFUNDED') {
        return;
      }

      if (attemptForReversal.status !== 'REFUND_PENDING') {
        return;
      }

      const existingMetadata = jsonObject(attemptForReversal.providerMetadata);
      await tx.paymentAttempt.update({
        where: {
          id: paymentAttemptId,
        },
        data: {
          status: 'REFUNDED',
          providerMetadata: {
            ...existingMetadata,
            refund: {
              ...jsonObject(existingMetadata.refund),
              providerStatus: 'processed',
              providerStatusSource: providerStatus.source,
              providerStatusCheckedAt: new Date().toISOString(),
              providerStatusResponse:
                providerStatus.raw as unknown as Prisma.InputJsonValue,
            },
          } satisfies Prisma.InputJsonObject,
        },
      });
      await this.reverseDriverWalletPayoutForRefund(tx, attemptForReversal, {
        actorUserId: 'provider-refund-verification',
        actorName: 'Provider refund verification',
        reason: 'Provider refund processed.',
      });
      reconciledAttemptCount = 1;
    });

    return reconciledAttemptCount;
  }

  async reverseDriverWalletPayoutForRefund(
    tx: {
      wallet: {
        findUnique(args: unknown): Promise<{ id: string } | null>;
        update(args: unknown): Promise<unknown>;
      };
      walletTransaction: {
        findUnique(args: unknown): Promise<{ id: string } | null>;
        create(args: unknown): Promise<unknown>;
      };
    },
    attempt: {
      id: string;
      amount: Prisma.Decimal;
      currency: string;
      provider: PaymentProviderCode;
      providerReference: string | null;
      transactionRef: string;
      rideRequestId: string;
      rideRequest: {
        trip: {
          id: string;
          driver: {
            userId: string;
          };
        } | null;
      };
    },
    input: PaymentRefundInput,
  ) {
    const driverUserId = attempt.rideRequest.trip?.driver.userId;

    if (!driverUserId) {
      return {
        applied: false,
        reason: 'no_driver_trip',
      };
    }

    const wallet = await tx.wallet.findUnique({
      where: {
        userId_currency: {
          userId: driverUserId,
          currency: attempt.currency,
        },
      },
      select: {
        id: true,
      },
    });

    if (!wallet) {
      return {
        applied: false,
        reason: 'driver_wallet_not_found',
      };
    }

    const grossAmount = Number(attempt.amount);
    const commissionAmount = Math.round(grossAmount * platformCommissionRate);
    const driverPayoutAmount = grossAmount - commissionAmount;
    const originalCreditReference = `payment:${attempt.id}:driver-payout`;
    const refundReference = `payment:${attempt.id}:driver-payout-refund`;
    const originalCredit = await tx.walletTransaction.findUnique({
      where: {
        walletId_reference: {
          walletId: wallet.id,
          reference: originalCreditReference,
        },
      },
      select: {
        id: true,
      },
    });

    if (!originalCredit) {
      return {
        applied: false,
        reason: 'driver_payout_not_credited',
      };
    }

    const existingRefund = await tx.walletTransaction.findUnique({
      where: {
        walletId_reference: {
          walletId: wallet.id,
          reference: refundReference,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingRefund) {
      return {
        applied: false,
        reason: 'already_reversed',
        walletId: wallet.id,
        amount: driverPayoutAmount,
        currency: attempt.currency,
      };
    }

    try {
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'REFUND',
          amount: new Prisma.Decimal(driverPayoutAmount),
          reference: refundReference,
          description: `Reversal payout chauffeur remboursement ${attempt.transactionRef}`,
          metadata: {
            paymentAttemptId: attempt.id,
            rideRequestId: attempt.rideRequestId,
            tripId: attempt.rideRequest.trip?.id ?? null,
            provider: attempt.provider,
            providerReference: attempt.providerReference,
            originalCreditReference,
            grossAmount,
            commissionRate: platformCommissionRate,
            commissionAmount,
            driverPayoutAmount,
            refundedByUserId: input.actorUserId,
            refundedByName: input.actorName ?? null,
            reason: input.reason ?? null,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return {
          applied: false,
          reason: 'already_reversed',
          walletId: wallet.id,
          amount: driverPayoutAmount,
          currency: attempt.currency,
        };
      }

      throw error;
    }

    await tx.wallet.update({
      where: {
        id: wallet.id,
      },
      data: {
        balance: {
          decrement: new Prisma.Decimal(driverPayoutAmount),
        },
      },
    });

    return {
      applied: true,
      walletId: wallet.id,
      amount: driverPayoutAmount,
      currency: attempt.currency,
    };
  }

  private async reconcileRefundWebhookPayload(
    payload: PaymentWebhookPayload,
    signatureContext: PaymentWebhookSignatureContext,
    context: {
      provider: PaymentProviderCode;
      providerKey: PaymentProviderKey;
      event: string;
      signatureVerified: boolean;
    },
  ) {
    const refundReference = this.extractWebhookRefundReference(payload);
    const providerTransactionReference =
      this.extractWebhookRefundTransactionReference(payload);
    const transactionRef = this.extractWebhookTransactionReference(payload);
    const providerReference =
      refundReference ?? providerTransactionReference ?? undefined;
    let reconciledAttemptCount = 0;
    let paymentAttemptId: string | null = null;
    let userId: string | null = null;
    let nextAction:
      | 'refund_processed'
      | 'refund_still_pending'
      | 'ignored_unknown_reference'
      | 'ignored_missing_reference' =
      refundReference || providerTransactionReference
        ? 'ignored_unknown_reference'
        : 'ignored_missing_reference';

    const attempt = await this.findRefundWebhookAttempt(
      context.provider,
      refundReference,
      providerTransactionReference,
    );

    if (attempt) {
      paymentAttemptId = attempt.id;
      userId = attempt.userId;

      if (
        this.isProcessedRefundStatus(this.extractWebhookRefundStatus(payload))
      ) {
        reconciledAttemptCount =
          await this.finalizeProcessedRefundAttemptFromProvider(attempt.id, {
            raw: payload as unknown as Record<string, unknown>,
            source: 'webhook',
          });
        nextAction =
          reconciledAttemptCount > 0
            ? 'refund_processed'
            : 'refund_still_pending';
      } else {
        nextAction = 'refund_still_pending';
      }
    }

    const result = {
      received: true,
      event: context.event,
      transactionRef: transactionRef ?? attempt?.transactionRef ?? null,
      provider: context.providerKey,
      providerReference,
      reconciledAttemptCount,
      nextAction,
    };

    await this.persistWebhookEvent({
      provider: context.provider,
      event: context.event,
      transactionRef: result.transactionRef,
      providerReference,
      nextAction,
      reconciledAttemptCount,
      signatureVerified: context.signatureVerified,
      payload,
      signatureContext,
      paymentAttemptId,
      userId,
    });

    return result;
  }

  private async findRefundWebhookAttempt(
    provider: PaymentProviderCode,
    refundReference: string | undefined,
    providerTransactionReference: string | undefined,
  ) {
    if (!refundReference && !providerTransactionReference) {
      return null;
    }

    return this.prisma.paymentAttempt.findFirst({
      where: {
        provider,
        OR: [
          ...(refundReference
            ? [
                {
                  providerMetadata: {
                    path: ['refund', 'providerRefundId'],
                    equals: refundReference,
                  },
                },
              ]
            : []),
          ...(providerTransactionReference
            ? [
                {
                  providerReference: providerTransactionReference,
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        userId: true,
        transactionRef: true,
      },
    });
  }

  private async recordSuccessfulPaymentLedgerIfNeeded(
    paymentAttemptId: string | null,
    nextStatus: PaymentAttemptStatus,
  ) {
    if (!paymentAttemptId || nextStatus !== 'SUCCEEDED') {
      return;
    }

    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: {
        id: paymentAttemptId,
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        provider: true,
        providerReference: true,
        transactionRef: true,
        rideRequestId: true,
        rideRequest: {
          select: {
            trip: {
              select: {
                id: true,
                driver: {
                  select: {
                    userId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const driverUserId = attempt?.rideRequest.trip?.driver.userId;

    if (!attempt || !driverUserId) {
      return;
    }

    const grossAmount = Number(attempt.amount);
    const commissionAmount = Math.round(grossAmount * platformCommissionRate);
    const driverPayoutAmount = grossAmount - commissionAmount;
    const reference = `payment:${attempt.id}:driver-payout`;

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: {
          userId_currency: {
            userId: driverUserId,
            currency: attempt.currency,
          },
        },
        create: {
          userId: driverUserId,
          currency: attempt.currency,
        },
        update: {},
        select: {
          id: true,
        },
      });
      const existingLedgerEntry = await tx.walletTransaction.findUnique({
        where: {
          walletId_reference: {
            walletId: wallet.id,
            reference,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingLedgerEntry) {
        return;
      }

      try {
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'CREDIT',
            amount: new Prisma.Decimal(driverPayoutAmount),
            reference,
            description: `Payout chauffeur paiement ${attempt.transactionRef}`,
            metadata: {
              paymentAttemptId: attempt.id,
              rideRequestId: attempt.rideRequestId,
              tripId: attempt.rideRequest.trip?.id ?? null,
              provider: attempt.provider,
              providerReference: attempt.providerReference,
              grossAmount,
              commissionRate: platformCommissionRate,
              commissionAmount,
              driverPayoutAmount,
            } as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (isPrismaUniqueConstraintError(error)) {
          return;
        }

        throw error;
      }

      await tx.wallet.update({
        where: {
          id: wallet.id,
        },
        data: {
          balance: {
            increment: new Prisma.Decimal(driverPayoutAmount),
          },
        },
      });
    });
  }

  private async persistWebhookEvent(input: {
    provider: PaymentProviderCode;
    event: string;
    transactionRef: string | null;
    providerReference: string | undefined;
    nextAction: string;
    reconciledAttemptCount: number;
    signatureVerified: boolean;
    payload: PaymentWebhookPayload;
    signatureContext: PaymentWebhookSignatureContext;
    paymentAttemptId: string | null;
    userId: string | null;
  }) {
    const webhookEvent = await this.prisma.paymentWebhookEvent.create({
      data: {
        provider: input.provider,
        eventType: input.event,
        transactionRef: input.transactionRef,
        providerReference: input.providerReference,
        action: input.nextAction,
        reconciledAttemptCount: input.reconciledAttemptCount,
        signatureVerified: input.signatureVerified,
        rawBodyHash: input.signatureContext.rawBody
          ? createHash('sha256')
              .update(input.signatureContext.rawBody)
              .digest('hex')
          : undefined,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        paymentAttemptId: input.paymentAttemptId,
        userId: input.userId,
      },
    });

    await this.jobQueueService?.enqueue({
      kind: 'PAYMENT_WEBHOOK',
      dedupeKey: `payment-webhook:${webhookEvent.id}`,
      entityType: 'payment_webhook_event',
      entityId: webhookEvent.id,
      payload: {
        eventId: webhookEvent.id,
        action: input.nextAction,
        provider: input.provider,
        transactionRef: input.transactionRef,
        providerReference: input.providerReference ?? null,
        paymentAttemptId: input.paymentAttemptId,
        userId: input.userId,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Webhook payload parsing helpers
  // ---------------------------------------------------------------------------

  private extractWebhookTransactionReference(payload: PaymentWebhookPayload) {
    if (typeof payload.transactionRef === 'string') {
      return payload.transactionRef;
    }

    // PawaPay: depositId is both the Orbi transactionRef and the provider deposit ID
    if (typeof payload.depositId === 'string') {
      return payload.depositId;
    }

    if (typeof payload.cpm_trans_id === 'string') {
      return payload.cpm_trans_id;
    }

    return null;
  }

  private extractWebhookProviderReference(payload: PaymentWebhookPayload) {
    if (typeof payload.data?.providerReference === 'string') {
      return payload.data.providerReference;
    }

    if (typeof payload.providerReference === 'string') {
      return payload.providerReference;
    }

    if (typeof payload.signature === 'string') {
      return payload.signature;
    }

    // PawaPay: correspondentIds contains provider-side references
    if (
      payload.correspondentIds &&
      typeof payload.correspondentIds === 'object'
    ) {
      const ids = payload.correspondentIds as Record<string, unknown>;
      const firstId = Object.values(ids).find(
        (v) => typeof v === 'string',
      );
      if (firstId) return firstId as string;
    }

    if (typeof payload.cpm_trans_id === 'string') {
      return payload.cpm_trans_id;
    }

    return undefined;
  }

  private extractWebhookRefundReference(payload: PaymentWebhookPayload) {
    const data = this.asRecord(payload.data);

    return (
      this.stringValue(data.refund_id) ??
      this.stringValue(data.refundId) ??
      this.stringValue(data.id) ??
      this.stringValue(payload.refund_id) ??
      this.stringValue(payload.refundId) ??
      this.stringValue(payload.id)
    );
  }

  private extractWebhookRefundTransactionReference(
    payload: PaymentWebhookPayload,
  ) {
    const data = this.asRecord(payload.data);

    return (
      this.stringValue(data.transaction_id) ??
      this.stringValue(data.transactionId) ??
      this.stringValue(data.TransactionId) ??
      this.stringValue(data.tx_id) ??
      this.stringValue(data.charge_id) ??
      this.stringValue(payload.transaction_id) ??
      this.stringValue(payload.transactionId) ??
      this.stringValue(payload.TransactionId) ??
      this.stringValue(payload.tx_id) ??
      this.stringValue(payload.charge_id)
    );
  }

  private extractWebhookRefundStatus(payload: PaymentWebhookPayload) {
    const data = this.asRecord(payload.data);

    return (
      this.stringValue(data.status) ??
      this.stringValue(data.refund_status) ??
      this.stringValue(data.refundStatus) ??
      this.stringValue(data.Status) ??
      this.stringValue(payload.status) ??
      this.stringValue(payload.refund_status) ??
      this.stringValue(payload.refundStatus) ??
      this.stringValue(payload.Status)
    );
  }

  private isRefundWebhookEvent(event: string, payload: PaymentWebhookPayload) {
    const normalizedEvent = event.toLowerCase();

    if (normalizedEvent.includes('refund')) {
      return true;
    }

    const data = this.asRecord(payload.data);

    return Boolean(
      this.stringValue(data.amount_refunded) ||
      this.stringValue(data.refund_status) ||
      this.stringValue(data.refundStatus) ||
      this.stringValue(data.AmountRefunded) ||
      this.stringValue(data.TransactionId) ||
      this.stringValue(payload.AmountRefunded) ||
      this.stringValue(payload.TransactionId),
    );
  }

  private wasProviderSignatureVerified(
    signatureContext: PaymentWebhookSignatureContext,
  ) {
    return Boolean(
      signatureContext.flutterwaveSignature ||
      signatureContext.flutterwaveVerificationHash ||
      signatureContext.cinetpayToken ||
      signatureContext.pawaPaySignatureVerified,
    );
  }

  private resolveWebhookStatus(event: string): PaymentAttemptStatus {
    if (
      [
        'payment.completed',
        'charge.completed',
        'transaction.successful',
        // PawaPay deposit status field maps to a synthetic event name
        'deposit.completed',
        'COMPLETED',
      ].includes(event)
    ) {
      return 'SUCCEEDED' as const;
    }

    if (
      [
        'payment.failed',
        'charge.failed',
        'transaction.failed',
        'deposit.failed',
        'FAILED',
      ].includes(event)
    ) {
      return 'FAILED' as const;
    }

    if (['payment.cancelled', 'transaction.cancelled'].includes(event)) {
      return 'CANCELLED' as const;
    }

    return 'PENDING' as const;
  }

  private hasWebhookPaymentAmountMismatch(
    payload: PaymentWebhookPayload,
    attempt: {
      amount: Prisma.Decimal;
      currency: string;
    },
    nextStatus: PaymentAttemptStatus,
  ) {
    if (nextStatus !== 'SUCCEEDED') {
      return false;
    }

    const providerAmount = this.extractWebhookPaymentAmount(payload);
    const providerCurrency = this.extractWebhookPaymentCurrency(payload);

    if (
      providerAmount !== undefined &&
      Math.round(providerAmount) !== Math.round(Number(attempt.amount))
    ) {
      return true;
    }

    return Boolean(
      providerCurrency &&
      providerCurrency.toUpperCase() !== attempt.currency.toUpperCase(),
    );
  }

  private extractWebhookPaymentAmount(payload: PaymentWebhookPayload) {
    const data = this.asRecord(payload.data);

    return (
      this.numberValue(data.amount) ??
      this.numberValue(data.Amount) ??
      this.numberValue(data.cpm_amount) ??
      this.numberValue(payload.amount) ??
      this.numberValue(payload.Amount) ??
      this.numberValue(payload.cpm_amount)
    );
  }

  private extractWebhookPaymentCurrency(payload: PaymentWebhookPayload) {
    const data = this.asRecord(payload.data);

    return (
      this.stringValue(data.currency) ??
      this.stringValue(data.Currency) ??
      this.stringValue(data.cpm_currency) ??
      this.stringValue(payload.currency) ??
      this.stringValue(payload.Currency) ??
      this.stringValue(payload.cpm_currency)
    );
  }

  private buildWebhookReconciliationData(
    nextStatus: PaymentAttemptStatus,
    providerReference: string | undefined,
    payload: PaymentWebhookPayload,
    event: string,
  ) {
    return {
      status: nextStatus,
      providerReference,
      reconciliationPayload: payload as unknown as Prisma.InputJsonValue,
      failureReason: this.resolveFailureReason(nextStatus, payload, event),
    };
  }

  private resolveFailureReason(
    nextStatus: PaymentAttemptStatus,
    payload: PaymentWebhookPayload,
    fallbackEvent: string,
  ) {
    if (nextStatus !== 'FAILED') {
      return null;
    }

    return typeof payload.data?.failureReason === 'string'
      ? payload.data.failureReason
      : fallbackEvent;
  }

  private isProcessedRefundStatus(status: string | undefined) {
    if (!status) {
      return false;
    }

    return new Set([
      'completed',
      'completed-bank-transfer',
      'completed-momo',
      'completed-mpgs',
      'completed-offline',
      'completed-preauth',
      'successful',
      'success',
      'succeeded',
      'processed',
    ]).has(status.toLowerCase());
  }

  // ---------------------------------------------------------------------------
  // Low-level value helpers
  // ---------------------------------------------------------------------------

  private asRecord(value: unknown): Record<string, unknown> {
    return value && !Array.isArray(value) && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringValue(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return undefined;
  }

  private numberValue(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);

      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }
}
