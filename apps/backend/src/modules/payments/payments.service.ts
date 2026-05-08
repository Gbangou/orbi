import {
  BadRequestException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FeatureFlagsService } from '../../core/runtime/feature-flags.service';
import { JobQueueService } from '../../common/job-queue/job-queue.service';
import {
  DEFAULT_PAYMENT_CURRENCY,
  DEFAULT_PAYMENT_PROVIDER,
} from './payments.constants';
import { serializeCheckoutIntent } from './payments.presenter';
import type {
  CreateCheckoutIntentInput,
  PaymentAttemptCreateData,
  PaymentAttemptStatus,
  PaymentProviderCode,
  PaymentProviderKey,
  PaymentRefundInput,
  PaymentRefundProviderResult,
  PaymentRequestContext,
  ProviderVerificationPayload,
  PaymentWebhookSignatureContext,
  PaymentWebhookPayload,
  RideRequestPaymentOwnership,
} from './payments.types';

const platformCommissionRate = 0.18;

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
export class PaymentsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly featureFlagsService: FeatureFlagsService,
    @Optional()
    private readonly jobQueueService?: JobQueueService,
  ) {}

  async createCheckoutIntent(
    auth: PaymentRequestContext,
    payload: CreateCheckoutIntentInput,
    idempotencyKey?: string,
  ) {
    if (
      !this.featureFlagsService.isEnabled('payments', {
        actorId: auth.user.id,
      })
    ) {
      throw new BadRequestException(
        'Payments are temporarily unavailable for this actor while rollout controls are active.',
      );
    }

    if (auth.user.role === UserRole.RIDER && !auth.user.riderProfile?.id) {
      throw new BadRequestException('Authenticated rider profile is missing.');
    }

    const rideRequest = await this.findRideRequestOwnership(
      payload.rideRequestId,
    );
    this.assertPaymentAccess(auth, rideRequest);
    const amount = this.resolveCheckoutAmount(rideRequest, payload.amount);

    const providerKey = this.getConfiguredProviderKey();
    const provider = this.resolveProvider(providerKey);
    const currency = this.getConfiguredCurrency();
    const normalizedIdempotencyKey =
      this.normalizeIdempotencyKey(idempotencyKey);
    const idempotencyHash = this.buildIdempotencyHash(
      auth.user.id,
      payload,
      provider,
      amount,
      rideRequest.currency || currency,
    );
    const existingAttempt = normalizedIdempotencyKey
      ? await this.prisma.paymentAttempt.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: auth.user.id,
              idempotencyKey: normalizedIdempotencyKey,
            },
          },
        })
      : null;

    if (existingAttempt) {
      if (existingAttempt.idempotencyHash !== idempotencyHash) {
        throw new BadRequestException(
          'The provided idempotency key was already used with a different payment payload.',
        );
      }

      return this.serializeExistingCheckoutIntent(existingAttempt);
    }

    const transactionRef = this.buildTransactionReference(
      payload.rideRequestId,
    );
    const checkoutIntent = this.buildCheckoutIntent(
      provider,
      payload,
      amount,
      transactionRef,
      rideRequest.currency || currency,
    );

    await this.prisma.paymentAttempt.create({
      data: this.buildPaymentAttemptCreateData(
        auth,
        payload,
        amount,
        normalizedIdempotencyKey,
        idempotencyHash,
        provider,
        rideRequest.currency || currency,
        transactionRef,
        checkoutIntent.providerMetadata,
      ),
    });

    return checkoutIntent;
  }

  async handleWebhook(
    secret: string | undefined,
    payload: PaymentWebhookPayload,
    signatureContext: PaymentWebhookSignatureContext = {},
  ) {
    const expectedSecret = this.configService.get<string>(
      'payments.webhookSecret',
    );

    if (expectedSecret && secret !== expectedSecret) {
      throw new UnauthorizedException('Webhook secret is invalid.');
    }

    this.assertProviderWebhookSignature(payload, signatureContext);

    const providerKey = this.getConfiguredProviderKey();
    const provider = this.resolveProvider(providerKey);

    return this.reconcileWebhookPayload(payload, signatureContext, {
      provider,
      providerKey,
    });
  }

  async replayStoredWebhookEvent(eventId: string) {
    const storedEvent = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        provider: true,
        payload: true,
      },
    });

    if (!storedEvent) {
      throw new BadRequestException('Payment webhook event was not found.');
    }

    const payload = storedEvent.payload as PaymentWebhookPayload;
    const storedProvider = storedEvent.provider as PaymentProviderCode;
    const providerKey = this.resolveProviderKey(storedProvider);
    const result = await this.reconcileWebhookPayload(
      payload,
      {},
      {
        provider: storedProvider,
        providerKey,
      },
    );

    return {
      replayed: true,
      sourceEventId: storedEvent.id,
      result,
    };
  }

  async verifyPaymentAttemptWithProvider(paymentAttemptId: string) {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: {
        id: paymentAttemptId,
      },
      select: {
        id: true,
        provider: true,
        status: true,
        transactionRef: true,
        amount: true,
        currency: true,
        providerMetadata: true,
      },
    });

    if (!attempt) {
      throw new BadRequestException('Payment attempt was not found.');
    }

    const providerKey = this.resolveProviderKey(attempt.provider);

    if (attempt.status === 'REFUND_PENDING') {
      return this.verifyPendingRefundWithProvider(attempt, providerKey);
    }

    const providerPayload =
      providerKey === 'flutterwave'
        ? await this.fetchFlutterwaveVerification(attempt.transactionRef)
        : await this.fetchCinetPayVerification(attempt.transactionRef);

    this.assertProviderVerificationMatchesAttempt(providerPayload, attempt);

    const result = await this.reconcileWebhookPayload(
      providerPayload,
      {},
      {
        provider: attempt.provider,
        providerKey,
      },
    );

    return {
      verified: true,
      paymentAttemptId: attempt.id,
      provider: providerKey,
      transactionRef: attempt.transactionRef,
      result,
    };
  }

  async refundPaymentAttempt(
    paymentAttemptId: string,
    input: PaymentRefundInput,
  ) {
    const refundedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.paymentAttempt.findUnique({
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

      if (!attempt) {
        throw new BadRequestException('Payment attempt was not found.');
      }

      if (
        attempt.status === 'REFUNDED' ||
        attempt.status === 'REFUND_PENDING'
      ) {
        return {
          action:
            attempt.status === 'REFUNDED'
              ? ('already_refunded' as const)
              : ('refund_pending' as const),
          paymentAttempt: this.serializeRefundedPaymentAttempt(attempt),
          providerRefundReference: this.resolveProviderRefundReference(attempt),
          walletReversal: {
            applied: false,
            reason:
              attempt.status === 'REFUNDED'
                ? 'already_refunded'
                : 'refund_pending',
          },
        };
      }

      if (attempt.status !== 'SUCCEEDED') {
        throw new BadRequestException(
          'Only succeeded payment attempts can be refunded.',
        );
      }

      const providerRefundReference =
        this.resolveProviderRefundReference(attempt);
      const providerRefund = await this.initiateRefundWithProvider(
        attempt,
        input,
        providerRefundReference,
      );
      const nextStatus =
        providerRefund.status === 'processed' ? 'REFUNDED' : 'REFUND_PENDING';
      const updatedProviderMetadata = {
        ...jsonObject(attempt.providerMetadata),
        refund: {
          providerRefundReference,
          requestedAt: refundedAt.toISOString(),
          requestedByUserId: input.actorUserId,
          requestedByName: input.actorName ?? null,
          reason: input.reason ?? null,
          providerMode: providerRefund.providerMode,
          providerStatus: providerRefund.status,
          providerRefundId: providerRefund.providerRefundReference,
          providerResponse:
            providerRefund.raw as unknown as Prisma.InputJsonValue,
        },
      } satisfies Prisma.InputJsonObject;
      const updatedAttempt = await tx.paymentAttempt.update({
        where: {
          id: attempt.id,
        },
        data: {
          status: nextStatus,
          providerMetadata: updatedProviderMetadata,
          failureReason: input.reason
            ? `${nextStatus === 'REFUNDED' ? 'Refunded' : 'Refund pending'}: ${
                input.reason
              }`
            : nextStatus === 'REFUNDED'
              ? 'Refunded by operations.'
              : 'Refund requested with provider.',
        },
      });
      const walletReversal =
        nextStatus === 'REFUNDED'
          ? await this.reverseDriverWalletPayoutForRefund(tx, attempt, input)
          : {
              applied: false,
              reason: 'refund_pending',
            };

      return {
        action:
          nextStatus === 'REFUNDED'
            ? ('refunded' as const)
            : ('refund_pending' as const),
        paymentAttempt: this.serializeRefundedPaymentAttempt(updatedAttempt),
        providerRefundReference,
        walletReversal,
      };
    });
  }

  private async reconcileWebhookPayload(
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
        },
      });
      const nextStatus = this.resolveWebhookStatus(event);

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

  private getConfiguredProviderKey(): PaymentProviderKey {
    return (this.configService.get<string>('payments.provider') ??
      DEFAULT_PAYMENT_PROVIDER) as PaymentProviderKey;
  }

  private getConfiguredCurrency() {
    return (
      this.configService.get<string>('payments.currency') ??
      DEFAULT_PAYMENT_CURRENCY
    );
  }

  private async findRideRequestOwnership(
    rideRequestId: string,
  ): Promise<RideRequestPaymentOwnership> {
    const rideRequest = await this.prisma.rideRequest.findUnique({
      where: {
        id: rideRequestId,
      },
      select: {
        id: true,
        status: true,
        estimatedFare: true,
        currency: true,
        rider: {
          select: {
            userId: true,
          },
        },
        trip: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!rideRequest) {
      throw new BadRequestException('Ride request was not found.');
    }

    return rideRequest;
  }

  private assertPaymentAccess(
    auth: PaymentRequestContext,
    rideRequest: RideRequestPaymentOwnership,
  ) {
    if (
      auth.user.role === UserRole.RIDER &&
      rideRequest.rider.userId !== auth.user.id
    ) {
      throw new BadRequestException(
        'Riders can only initialize payment for their own request.',
      );
    }

    if (
      rideRequest.status !== 'REQUESTED' &&
      rideRequest.trip?.status !== 'COMPLETED'
    ) {
      throw new BadRequestException(
        'Payment can only be initialized while the ride request is pending or after a completed trip.',
      );
    }
  }

  private buildTransactionReference(rideRequestId: string) {
    return `mobilis_${Date.now()}_${rideRequestId}`;
  }

  // The response returned to the client should stay provider-agnostic enough to
  // allow us to switch aggregators without rewriting rider and admin surfaces.
  private buildCheckoutIntent(
    provider: PaymentProviderCode,
    payload: CreateCheckoutIntentInput,
    amount: number,
    transactionRef: string,
    currency: string,
  ) {
    if (provider === 'FLUTTERWAVE') {
      return serializeCheckoutIntent({
        provider,
        transactionRef,
        amount,
        currency,
        channel: payload.channel,
        callbackUrl:
          payload.redirectUrl ??
          this.configService.get<string>('payments.defaultRedirectUrl') ??
          null,
        publicKeyPresent: Boolean(
          this.configService.get<string>('payments.flutterwave.publicKey'),
        ),
      });
    }

    return serializeCheckoutIntent({
      provider,
      transactionRef,
      amount,
      currency,
      channel: payload.channel,
      notifyUrl:
        this.configService.get<string>('payments.defaultWebhookUrl') ?? null,
      siteIdPresent: Boolean(
        this.configService.get<string>('payments.cinetpay.siteId'),
      ),
    });
  }

  private buildPaymentAttemptCreateData(
    auth: PaymentRequestContext,
    payload: CreateCheckoutIntentInput,
    amount: number,
    idempotencyKey: string | undefined,
    idempotencyHash: string | undefined,
    provider: PaymentProviderCode,
    currency: string,
    transactionRef: string,
    providerMetadata: Prisma.InputJsonValue,
  ): PaymentAttemptCreateData {
    return {
      userId: auth.user.id,
      rideRequestId: payload.rideRequestId,
      idempotencyKey,
      idempotencyHash,
      provider,
      channel: payload.channel,
      status: 'INITIATED',
      amount: new Prisma.Decimal(amount),
      currency,
      mobileMoneyNetwork: payload.mobileMoneyNetwork,
      transactionRef,
      customerPhoneNumber: payload.customerPhoneNumber,
      redirectUrl: payload.redirectUrl,
      providerMetadata,
    };
  }

  private normalizeIdempotencyKey(idempotencyKey?: string) {
    const normalized = idempotencyKey?.trim();

    if (!normalized) {
      return undefined;
    }

    if (normalized.length < 8 || normalized.length > 128) {
      throw new BadRequestException(
        'Idempotency key must be between 8 and 128 characters.',
      );
    }

    return normalized;
  }

  private buildIdempotencyHash(
    userId: string,
    payload: CreateCheckoutIntentInput,
    provider: PaymentProviderCode,
    amount: number,
    currency: string,
  ) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          userId,
          rideRequestId: payload.rideRequestId,
          channel: payload.channel,
          amount,
          provider,
          currency,
          mobileMoneyNetwork: payload.mobileMoneyNetwork ?? null,
          customerPhoneNumber: payload.customerPhoneNumber ?? null,
          redirectUrl: payload.redirectUrl ?? null,
        }),
      )
      .digest('hex');
  }

  private serializeExistingCheckoutIntent(attempt: {
    provider: PaymentProviderCode;
    transactionRef: string;
    amount: Prisma.Decimal;
    currency: string;
    channel: CreateCheckoutIntentInput['channel'];
    providerMetadata: Prisma.JsonValue | null;
  }) {
    const providerMetadata =
      (attempt.providerMetadata as Record<string, unknown> | null) ?? {};

    return serializeCheckoutIntent({
      provider: attempt.provider,
      transactionRef: attempt.transactionRef,
      amount: Number(attempt.amount),
      currency: attempt.currency,
      channel: attempt.channel,
      callbackUrl:
        typeof providerMetadata.callbackUrl === 'string'
          ? providerMetadata.callbackUrl
          : null,
      notifyUrl:
        typeof providerMetadata.notifyUrl === 'string'
          ? providerMetadata.notifyUrl
          : null,
      publicKeyPresent: Boolean(providerMetadata.publicKeyPresent),
      siteIdPresent: Boolean(providerMetadata.siteIdPresent),
    });
  }

  private resolveProvider(providerKey: PaymentProviderKey) {
    if (providerKey === 'flutterwave') {
      return 'FLUTTERWAVE' as const;
    }

    if (providerKey === 'cinetpay') {
      return 'CINETPAY' as const;
    }

    const unsupportedProvider: string = providerKey;
    throw new BadRequestException(
      `Unsupported payment provider: ${unsupportedProvider}`,
    );
  }

  private resolveProviderKey(
    provider: PaymentProviderCode,
  ): PaymentProviderKey {
    if (provider === 'FLUTTERWAVE') {
      return 'flutterwave';
    }

    return 'cinetpay';
  }

  private async fetchFlutterwaveVerification(transactionRef: string) {
    const secretKey = this.configService.get<string>(
      'payments.flutterwave.secretKey',
    );

    if (!secretKey) {
      throw new BadRequestException(
        'Flutterwave secret key is required to verify provider status.',
      );
    }

    const url = new URL(
      'https://api.flutterwave.com/v3/transactions/verify_by_reference',
    );
    url.searchParams.set('tx_ref', transactionRef);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });
    const body = await this.readProviderJson(response);
    const data = this.asRecord(body.data);

    return {
      event:
        this.stringValue(data.status) === 'successful'
          ? 'payment.completed'
          : 'payment.failed',
      transactionRef,
      data: {
        providerReference:
          this.stringValue(data.flw_ref) ??
          this.stringValue(data.id) ??
          this.stringValue(data.tx_ref),
        status: this.stringValue(data.status),
        amount: this.numberValue(data.amount),
        currency: this.stringValue(data.currency),
        raw: body,
      },
    } satisfies ProviderVerificationPayload;
  }

  private async fetchCinetPayVerification(transactionRef: string) {
    const apiKey = this.configService.get<string>('payments.cinetpay.apiKey');
    const siteId = this.configService.get<string>('payments.cinetpay.siteId');

    if (!apiKey || !siteId) {
      throw new BadRequestException(
        'CinetPay API key and site id are required to verify provider status.',
      );
    }

    const response = await fetch(
      'https://api-checkout.cinetpay.com/v2/payment/check',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mobilis/1.0',
        },
        body: JSON.stringify({
          apikey: apiKey,
          site_id: siteId,
          transaction_id: transactionRef,
        }),
      },
    );
    const body = await this.readProviderJson(response);
    const data = this.asRecord(body.data);
    const status = this.stringValue(data.status) ?? this.stringValue(body.code);

    return {
      event: this.resolveCinetPayVerificationEvent(status),
      transactionRef,
      data: {
        providerReference:
          this.stringValue(data.payment_token) ??
          this.stringValue(data.operator_id) ??
          transactionRef,
        status,
        amount: this.numberValue(data.amount),
        currency: this.stringValue(data.currency),
        raw: body,
      },
    } satisfies ProviderVerificationPayload;
  }

  private async verifyPendingRefundWithProvider(
    attempt: {
      id: string;
      provider: PaymentProviderCode;
      transactionRef: string;
      amount: Prisma.Decimal;
      currency: string;
      providerMetadata: Prisma.JsonValue | null;
    },
    providerKey: PaymentProviderKey,
  ) {
    const refundMetadata = jsonObject(
      jsonObject(attempt.providerMetadata).refund,
    );
    const providerRefundId = this.stringValue(refundMetadata.providerRefundId);

    if (!providerRefundId) {
      throw new BadRequestException(
        'Provider refund id is required to verify refund status.',
      );
    }

    const refundStatus =
      providerKey === 'flutterwave'
        ? await this.fetchFlutterwaveRefundStatus(providerRefundId)
        : await this.fetchCinetPayRefundStatus();
    const nextAction =
      refundStatus.status === 'processed'
        ? 'refund_processed'
        : 'refund_still_pending';
    let reconciledAttemptCount = 0;

    if (refundStatus.status === 'processed') {
      reconciledAttemptCount =
        await this.finalizeProcessedRefundAttemptFromProvider(attempt.id, {
          raw: refundStatus.raw,
          source: 'polling',
        });
    }

    return {
      verified: true,
      paymentAttemptId: attempt.id,
      provider: providerKey,
      transactionRef: attempt.transactionRef,
      result: {
        received: true,
        event:
          refundStatus.status === 'processed'
            ? 'refund.processed'
            : 'refund.pending',
        transactionRef: attempt.transactionRef,
        provider: providerKey,
        providerReference: providerRefundId,
        reconciledAttemptCount,
        nextAction,
      },
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

  private async finalizeProcessedRefundAttemptFromProvider(
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

  private async fetchFlutterwaveRefundStatus(
    providerRefundId: string,
  ): Promise<PaymentRefundProviderResult> {
    const secretKey = this.configService.get<string>(
      'payments.flutterwave.secretKey',
    );

    if (!secretKey) {
      throw new BadRequestException(
        'Flutterwave secret key is required to verify provider refund status.',
      );
    }

    const response = await fetch(
      `https://api.flutterwave.com/v3/refunds/${encodeURIComponent(
        providerRefundId,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    const body = await this.readProviderJson(response, 'refund verification');
    const data = this.asRecord(body.data ?? body);
    const providerStatus =
      this.stringValue(data.status) ?? this.stringValue(body.status);

    return {
      providerRefundReference: providerRefundId,
      status: this.isProcessedRefundStatus(providerStatus)
        ? 'processed'
        : 'pending',
      providerMode: 'provider_api',
      raw: body,
    };
  }

  private fetchCinetPayRefundStatus(): Promise<PaymentRefundProviderResult> {
    throw new BadRequestException(
      'CinetPay provider refund status checks are not enabled: configure a supported refund endpoint or use manual operations.',
    );
  }

  private async initiateRefundWithProvider(
    attempt: {
      id: string;
      provider: PaymentProviderCode;
      providerReference: string | null;
      transactionRef: string;
      amount: Prisma.Decimal;
      currency: string;
    },
    input: PaymentRefundInput,
    providerRefundReference: string,
  ): Promise<PaymentRefundProviderResult> {
    const refundMode =
      this.configService.get<string>('payments.refunds.mode') ?? 'manual';

    if (refundMode !== 'provider') {
      return {
        providerRefundReference,
        status: 'processed',
        providerMode: 'manual_or_provider_console',
        raw: {
          mode: 'manual',
        },
      };
    }

    const providerKey = this.resolveProviderKey(attempt.provider);

    if (providerKey === 'flutterwave') {
      return this.initiateFlutterwaveRefund(
        attempt,
        input,
        providerRefundReference,
      );
    }

    return this.initiateCinetPayRefund();
  }

  private async initiateFlutterwaveRefund(
    attempt: {
      providerReference: string | null;
      transactionRef: string;
      amount: Prisma.Decimal;
      currency: string;
    },
    input: PaymentRefundInput,
    providerRefundReference: string,
  ): Promise<PaymentRefundProviderResult> {
    const secretKey = this.configService.get<string>(
      'payments.flutterwave.secretKey',
    );
    const transactionId = attempt.providerReference;

    if (!secretKey) {
      throw new BadRequestException(
        'Flutterwave secret key is required to initiate provider refunds.',
      );
    }

    if (!transactionId) {
      throw new BadRequestException(
        'Flutterwave provider reference is required to initiate a refund.',
      );
    }

    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(
        transactionId,
      )}/refund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': providerRefundReference,
        },
        body: JSON.stringify({
          amount: Math.round(Number(attempt.amount)),
          comments: input.reason ?? `Mobilis refund ${attempt.transactionRef}`,
        }),
      },
    );
    const body = await this.readProviderJson(response, 'refund');
    const data = this.asRecord(body.data);
    const providerStatus =
      this.stringValue(data.status) ?? this.stringValue(body.status);
    const normalizedStatus = providerStatus?.toLowerCase();
    return {
      providerRefundReference:
        this.stringValue(data.id) ??
        this.stringValue(data.flw_ref) ??
        providerRefundReference,
      status:
        normalizedStatus && this.isProcessedRefundStatus(normalizedStatus)
          ? 'processed'
          : 'pending',
      providerMode: 'provider_api',
      raw: body,
    };
  }

  private initiateCinetPayRefund(): Promise<PaymentRefundProviderResult> {
    throw new BadRequestException(
      'CinetPay provider refunds are not enabled: configure a supported refund endpoint or use manual operations.',
    );
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

  private async readProviderJson(
    response: Response,
    operation = 'verification',
  ) {
    let body: unknown;

    try {
      body = await response.json();
    } catch {
      body = {};
    }

    if (!response.ok) {
      throw new BadRequestException(
        `Provider ${operation} failed with status ${response.status}.`,
      );
    }

    return this.asRecord(body);
  }

  private assertProviderVerificationMatchesAttempt(
    payload: ProviderVerificationPayload,
    attempt: {
      amount: Prisma.Decimal;
      currency: string;
    },
  ) {
    const providerAmount = payload.data.amount;
    const providerCurrency = payload.data.currency;

    if (
      providerAmount !== undefined &&
      Math.round(providerAmount) !== Math.round(Number(attempt.amount))
    ) {
      throw new BadRequestException(
        'Provider verification amount does not match the payment attempt.',
      );
    }

    if (
      providerCurrency &&
      providerCurrency.toUpperCase() !== attempt.currency.toUpperCase()
    ) {
      throw new BadRequestException(
        'Provider verification currency does not match the payment attempt.',
      );
    }
  }

  private resolveCinetPayVerificationEvent(status: string | undefined) {
    if (status === 'ACCEPTED') {
      return 'payment.completed';
    }

    if (status === 'REFUSED' || status === 'CANCELLED') {
      return 'payment.failed';
    }

    return 'payment.pending';
  }

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

  private resolveCheckoutAmount(
    rideRequest: RideRequestPaymentOwnership,
    requestedAmount?: number,
  ) {
    const estimatedFare = Number(rideRequest.estimatedFare ?? 0);

    if (!estimatedFare || estimatedFare <= 0) {
      throw new BadRequestException(
        'Ride request fare is unavailable for payment initialization.',
      );
    }

    if (
      requestedAmount !== undefined &&
      Math.round(requestedAmount) !== Math.round(estimatedFare)
    ) {
      throw new BadRequestException(
        'Payment amount must match the current ride request fare.',
      );
    }

    return estimatedFare;
  }

  private resolveWebhookStatus(event: string): PaymentAttemptStatus {
    if (
      [
        'payment.completed',
        'charge.completed',
        'transaction.successful',
      ].includes(event)
    ) {
      return 'SUCCEEDED' as const;
    }

    if (
      ['payment.failed', 'charge.failed', 'transaction.failed'].includes(event)
    ) {
      return 'FAILED' as const;
    }

    if (['payment.cancelled', 'transaction.cancelled'].includes(event)) {
      return 'CANCELLED' as const;
    }

    return 'PENDING' as const;
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

    if (typeof payload.cpm_trans_id === 'string') {
      return payload.cpm_trans_id;
    }

    return undefined;
  }

  private extractWebhookTransactionReference(payload: PaymentWebhookPayload) {
    if (typeof payload.transactionRef === 'string') {
      return payload.transactionRef;
    }

    if (typeof payload.cpm_trans_id === 'string') {
      return payload.cpm_trans_id;
    }

    return null;
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

  private async reverseDriverWalletPayoutForRefund(
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

  private resolveProviderRefundReference(attempt: {
    id: string;
    provider: PaymentProviderCode;
  }) {
    return `${attempt.provider.toLowerCase()}_refund_${attempt.id}`;
  }

  private serializeRefundedPaymentAttempt(attempt: {
    id: string;
    provider: PaymentProviderCode;
    status: PaymentAttemptStatus;
    amount: Prisma.Decimal;
    currency: string;
    transactionRef: string;
    providerReference: string | null;
    updatedAt: Date;
  }) {
    return {
      id: attempt.id,
      provider: attempt.provider,
      status: attempt.status,
      amount: Number(attempt.amount),
      currency: attempt.currency,
      transactionRef: attempt.transactionRef,
      providerReference: attempt.providerReference,
      updatedAt: attempt.updatedAt.toISOString(),
    };
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

  private wasProviderSignatureVerified(
    signatureContext: PaymentWebhookSignatureContext,
  ) {
    return Boolean(
      signatureContext.flutterwaveSignature ||
      signatureContext.flutterwaveVerificationHash ||
      signatureContext.cinetpayToken,
    );
  }

  private assertProviderWebhookSignature(
    payload: PaymentWebhookPayload,
    signatureContext: PaymentWebhookSignatureContext,
  ) {
    const providerKey = this.getConfiguredProviderKey();

    if (providerKey === 'flutterwave') {
      this.assertFlutterwaveSignature(signatureContext);
      return;
    }

    if (providerKey === 'cinetpay') {
      this.assertCinetPaySignature(payload, signatureContext);
    }
  }

  private assertFlutterwaveSignature(
    signatureContext: PaymentWebhookSignatureContext,
  ) {
    const secretHash = this.configService.get<string>(
      'payments.flutterwave.webhookSecretHash',
    );

    if (!secretHash) {
      return;
    }

    const expectedHmac = signatureContext.rawBody
      ? createHmac('sha256', secretHash)
          .update(signatureContext.rawBody)
          .digest('base64')
      : null;

    if (
      !this.secureEquals(
        signatureContext.flutterwaveVerificationHash,
        secretHash,
      ) &&
      !this.secureEquals(signatureContext.flutterwaveSignature, expectedHmac)
    ) {
      throw new UnauthorizedException('Webhook provider signature is invalid.');
    }
  }

  private assertCinetPaySignature(
    payload: PaymentWebhookPayload,
    signatureContext: PaymentWebhookSignatureContext,
  ) {
    const secretKey = this.configService.get<string>(
      'payments.cinetpay.secretKey',
    );

    if (!secretKey) {
      return;
    }

    const expectedToken = createHmac('sha256', secretKey)
      .update(this.buildCinetPaySignaturePayload(payload))
      .digest('hex');

    if (!this.secureEquals(signatureContext.cinetpayToken, expectedToken)) {
      throw new UnauthorizedException('Webhook provider signature is invalid.');
    }
  }

  private buildCinetPaySignaturePayload(payload: PaymentWebhookPayload) {
    const data = {
      ...payload,
      ...(payload.data ?? {}),
    };
    const fields = [
      'cpm_site_id',
      'cpm_trans_id',
      'cpm_trans_date',
      'cpm_amount',
      'cpm_currency',
      'signature',
      'payment_method',
      'cel_phone_num',
      'cpm_phone_prefixe',
      'cpm_language',
      'cpm_version',
      'cpm_payment_config',
      'cpm_page_action',
      'cpm_custom',
      'cpm_designation',
      'cpm_error_message',
    ];

    return fields
      .map((field) => {
        const value = data[field];

        if (value === undefined || value === null) {
          return '';
        }

        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          typeof value === 'bigint'
        ) {
          return String(value);
        }

        return JSON.stringify(value);
      })
      .join('');
  }

  private secureEquals(left: string | undefined | null, right: string | null) {
    if (!left || !right) {
      return false;
    }

    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
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
}
