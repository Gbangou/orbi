import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FeatureFlagsService } from '../../core/runtime/feature-flags.service';
import { JobQueueService } from '../../common/job-queue/job-queue.service';
import {
  DEFAULT_PAYMENT_CURRENCY,
  DEFAULT_PAYMENT_PROVIDER,
  PAWAPAY_NETWORK_TO_CORRESPONDENT,
} from './payments.constants';
import type { PawaPayCorrespondent } from './pawapay.service';
import { PawaPayService } from './pawapay.service';
import { serializeCheckoutIntent } from './payments.presenter';
import type {
  CreateCheckoutIntentInput,
  MobileMoneyNetwork,
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
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly featureFlagsService: FeatureFlagsService,
    @Optional()
    private readonly jobQueueService?: JobQueueService,
    @Optional()
    private readonly pawaPayService?: PawaPayService,
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

    const providerKey: PaymentProviderKey =
      payload.channel === 'WALLET' ? 'wallet' : this.getConfiguredProviderKey();
    const provider: PaymentProviderCode =
      payload.channel === 'WALLET'
        ? 'WALLET'
        : this.resolveProvider(providerKey);
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
      providerKey,
    );
    const checkoutIntent = this.buildCheckoutIntent(
      provider,
      payload,
      amount,
      transactionRef,
      rideRequest.currency || currency,
    );

    if (payload.channel === 'WALLET') {
      return this.settleWalletCheckout(
        auth,
        payload,
        amount,
        normalizedIdempotencyKey,
        idempotencyHash,
        rideRequest.currency || currency,
        transactionRef,
        checkoutIntent,
      );
    }

    try {
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
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error) || !normalizedIdempotencyKey) {
        throw error;
      }

      const concurrentAttempt = await this.prisma.paymentAttempt.findUnique({
        where: {
          userId_idempotencyKey: {
            userId: auth.user.id,
            idempotencyKey: normalizedIdempotencyKey,
          },
        },
      });

      if (
        !concurrentAttempt ||
        concurrentAttempt.idempotencyHash !== idempotencyHash
      ) {
        throw error;
      }

      return this.serializeExistingCheckoutIntent(concurrentAttempt);
    }

    // PawaPay is a server-push provider: we initiate the deposit directly after
    // persisting the attempt. Flutterwave/CinetPay work via redirect, so they
    // do not require an outbound API call at this stage.
    if (providerKey === 'pawapay') {
      await this.dispatchPawaPayDeposit(
        transactionRef,
        amount,
        rideRequest.currency || currency,
        payload,
        payload.rideRequestId,
      );
    }

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

    // Un paiement WALLET se règle de façon synchrone lors du checkout : il
    // n'y a pas d'agrégateur externe à interroger et il ne reste jamais
    // bloqué en INITIATED/PENDING, donc rien à vérifier côté provider.
    if (attempt.provider === 'WALLET') {
      return {
        verified: true,
        paymentAttemptId: attempt.id,
        provider: 'wallet' as const,
        transactionRef: attempt.transactionRef,
        result: {
          received: true,
          event: 'wallet.settled',
          transactionRef: attempt.transactionRef,
          provider: 'wallet' as const,
          providerReference: undefined,
          reconciledAttemptCount: 0,
          nextAction: 'persisted_idempotent_replay' as const,
        },
      };
    }

    const providerKey = this.resolveProviderKey(attempt.provider);

    if (attempt.status === 'REFUND_PENDING') {
      return this.verifyPendingRefundWithProvider(attempt, providerKey);
    }

    const providerPayload =
      providerKey === 'flutterwave'
        ? await this.fetchFlutterwaveVerification(attempt.transactionRef)
        : providerKey === 'pawapay'
          ? await this.fetchPawaPayVerification(attempt.transactionRef)
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
    const normalizedIdempotencyKey = this.normalizeIdempotencyKey(
      input.idempotencyKey ?? undefined,
    );
    const refundIdempotencyHash = normalizedIdempotencyKey
      ? this.buildRefundIdempotencyHash(paymentAttemptId, input)
      : undefined;
    const result = await this.prisma.$transaction(async (tx) => {
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
        this.assertRefundIdempotencyReplay(
          attempt.providerMetadata,
          refundIdempotencyHash,
        );

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
          riderWalletRefund: {
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
          idempotencyKey: normalizedIdempotencyKey ?? null,
          idempotencyHash: refundIdempotencyHash ?? null,
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
      const riderWalletRefund =
        nextStatus === 'REFUNDED' && attempt.provider === 'WALLET'
          ? await this.reverseRiderWalletDebitForRefund(tx, attempt, input)
          : {
              applied: false,
              reason:
                attempt.provider === 'WALLET'
                  ? 'refund_pending'
                  : 'not_wallet_payment',
            };

      return {
        action:
          nextStatus === 'REFUNDED'
            ? ('refunded' as const)
            : ('refund_pending' as const),
        paymentAttempt: this.serializeRefundedPaymentAttempt(updatedAttempt),
        providerRefundReference,
        walletReversal,
        riderWalletRefund,
      };
    });

    if (result.action === 'refund_pending') {
      await this.enqueueRefundVerificationJob(
        paymentAttemptId,
        result.providerRefundReference,
      );
    }

    return result;
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
      | 'persisted_wallet_top_up_credited'
      | 'persisted_wallet_top_up_failed'
      | 'persisted_wallet_top_up_replay'
      | 'ignored_amount_mismatch'
      | 'ignored_conflicting_provider_reference'
      | 'ignored_unknown_reference'
      | 'ignored_missing_reference' = transactionRef
      ? 'ignored_unknown_reference'
      : 'ignored_missing_reference';

    const walletTopUpReconciliation =
      providerContext.providerKey === 'pawapay' && transactionRef
        ? await this.reconcileWalletTopUpWebhook({
            depositId: transactionRef,
            event,
            payload,
          })
        : null;

    if (walletTopUpReconciliation) {
      const result = {
        received: true,
        event,
        transactionRef,
        provider: providerContext.providerKey,
        providerReference,
        reconciledAttemptCount,
        nextAction: walletTopUpReconciliation.nextAction,
        walletTopUpId: walletTopUpReconciliation.walletTopUpId,
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
        paymentAttemptId: null,
        userId: walletTopUpReconciliation.userId,
      });

      return result;
    }

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

  private buildTransactionReference(
    rideRequestId: string,
    providerKey: PaymentProviderKey = 'flutterwave',
  ) {
    // PawaPay requires a UUID v4 as depositId — it serves as both
    // the Orbi transaction reference and the PawaPay deposit identifier.
    if (providerKey === 'pawapay') {
      return randomUUID();
    }
    return `orbi_${Date.now()}_${rideRequestId}`;
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
    const redirectUrl = this.resolveCheckoutRedirectUrl(payload.redirectUrl);

    if (provider === 'FLUTTERWAVE') {
      return serializeCheckoutIntent({
        provider,
        transactionRef,
        amount,
        currency,
        channel: payload.channel,
        callbackUrl: redirectUrl,
        publicKeyPresent: Boolean(
          this.configService.get<string>('payments.flutterwave.publicKey'),
        ),
      });
    }

    if (provider === 'PAWAPAY') {
      return serializeCheckoutIntent({
        provider,
        transactionRef,
        amount,
        currency,
        channel: payload.channel,
        awaitingPhoneConfirmation: true,
        notifyUrl:
          this.configService.get<string>('payments.pawapay.webhookUrl') ??
          this.configService.get<string>('payments.defaultWebhookUrl') ??
          null,
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

  private resolvePawaPayCorrespondent(
    mobileMoneyNetwork?: MobileMoneyNetwork | string,
  ): PawaPayCorrespondent {
    const mapped =
      mobileMoneyNetwork &&
      PAWAPAY_NETWORK_TO_CORRESPONDENT[mobileMoneyNetwork.toUpperCase()];
    if (!mapped) {
      throw new BadRequestException(
        `Mobile money network '${mobileMoneyNetwork ?? ''}' is not supported via PawaPay in Burkina Faso. Use ORANGE_BFA or MOOV_BFA.`,
      );
    }
    return mapped;
  }

  private async dispatchPawaPayDeposit(
    transactionRef: string,
    amount: number,
    currency: string,
    payload: CreateCheckoutIntentInput,
    rideRequestId: string,
  ): Promise<void> {
    if (!this.pawaPayService?.isConfigured()) {
      this.logger.warn(
        'PawaPay API token is not configured — leaving deposit pending for sandbox/pre-integration testing.',
      );
      return;
    }

    const correspondent = this.resolvePawaPayCorrespondent(
      payload.mobileMoneyNetwork,
    );
    const phoneNumber = payload.customerPhoneNumber?.replace(/\D/g, '');

    if (!phoneNumber || phoneNumber.length < 8) {
      throw new BadRequestException(
        'A valid customer phone number is required for Mobile Money payment.',
      );
    }

    const response = await this.pawaPayService.initiateDeposit({
      depositId: transactionRef,
      amount: String(Math.round(amount)),
      currency: 'XOF',
      correspondent,
      payer: { type: 'MSISDN', address: { value: phoneNumber } },
      customerTimestamp: new Date().toISOString(),
      statementDescription: `Orbi Course #${rideRequestId.slice(-8)}`,
      clientReferenceId: rideRequestId,
      metadata: [
        { fieldName: 'rideRequestId', fieldValue: rideRequestId },
        { fieldName: 'orbiTransactionRef', fieldValue: transactionRef },
      ],
    });

    if (
      response.status !== 'ACCEPTED' &&
      response.status !== 'DUPLICATE_IGNORED'
    ) {
      const failCode = response.failureReason?.failureCode ?? 'UNKNOWN';
      throw new BadRequestException(
        `PawaPay deposit was rejected: ${failCode}. Please verify your phone number and try again.`,
      );
    }
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
    status: PaymentAttemptStatus = 'INITIATED',
  ): PaymentAttemptCreateData {
    return {
      userId: auth.user.id,
      rideRequestId: payload.rideRequestId,
      idempotencyKey,
      idempotencyHash,
      provider,
      channel: payload.channel,
      status,
      amount: new Prisma.Decimal(amount),
      currency,
      mobileMoneyNetwork: payload.mobileMoneyNetwork,
      transactionRef,
      customerPhoneNumber: payload.customerPhoneNumber,
      redirectUrl: payload.redirectUrl,
      providerMetadata,
    };
  }

  // Le canal WALLET n'est pas un agrégateur externe : le débit est appliqué
  // de façon synchrone et atomique sur le portefeuille Orbi du rider, sans
  // callback ni polling. On réutilise le squelette d'idempotence générique
  // (clé -> hash -> intent existant) puis on court-circuite tout dispatch
  // provider externe.
  private async resolveRiderWallet(userId: string, currency: string) {
    const existing = await this.prisma.wallet.findFirst({
      where: { userId, currency },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.wallet.create({
      data: {
        userId,
        currency,
        balance: new Prisma.Decimal(0),
      },
    });
  }

  private async settleWalletCheckout(
    auth: PaymentRequestContext,
    payload: CreateCheckoutIntentInput,
    amount: number,
    normalizedIdempotencyKey: string | undefined,
    idempotencyHash: string,
    currency: string,
    transactionRef: string,
    checkoutIntent: ReturnType<typeof serializeCheckoutIntent>,
  ) {
    const wallet = await this.resolveRiderWallet(auth.user.id, currency);
    const debitAmount = new Prisma.Decimal(amount);
    let createdAttemptId: string | null = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        const debited = await tx.wallet.updateMany({
          where: {
            id: wallet.id,
            isLocked: false,
            balance: { gte: debitAmount },
          },
          data: { balance: { decrement: debitAmount } },
        });

        if (debited.count === 0) {
          const current = await tx.wallet.findUnique({
            where: { id: wallet.id },
            select: { isLocked: true },
          });

          throw new BadRequestException(
            current?.isLocked
              ? 'Le portefeuille Orbi est verrouillé. Contactez le support.'
              : 'Solde du portefeuille Orbi insuffisant pour ce trajet.',
          );
        }

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'DEBIT',
            amount: debitAmount,
            reference: transactionRef,
            description: `Paiement course ${payload.rideRequestId.slice(-8)}`,
            metadata: {
              rideRequestId: payload.rideRequestId,
              transactionRef,
            } satisfies Prisma.InputJsonObject,
          },
        });

        const createdAttempt = await tx.paymentAttempt.create({
          data: this.buildPaymentAttemptCreateData(
            auth,
            payload,
            amount,
            normalizedIdempotencyKey ?? undefined,
            idempotencyHash,
            'WALLET',
            currency,
            transactionRef,
            checkoutIntent.providerMetadata,
            'SUCCEEDED',
          ),
          select: { id: true },
        });

        createdAttemptId = createdAttempt.id;
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (!isPrismaUniqueConstraintError(error) || !normalizedIdempotencyKey) {
        throw error;
      }

      const concurrentAttempt = await this.prisma.paymentAttempt.findUnique({
        where: {
          userId_idempotencyKey: {
            userId: auth.user.id,
            idempotencyKey: normalizedIdempotencyKey,
          },
        },
      });

      if (
        !concurrentAttempt ||
        concurrentAttempt.idempotencyHash !== idempotencyHash
      ) {
        throw error;
      }

      return this.serializeExistingCheckoutIntent(concurrentAttempt);
    }

    // Le paiement wallet est déjà SUCCEEDED en base : on déclenche
    // immédiatement le crédit chauffeur, sinon il resterait à jamais en
    // attente d'un webhook qui n'arrivera jamais pour ce canal interne.
    if (createdAttemptId) {
      await this.recordSuccessfulPaymentLedgerIfNeeded(
        createdAttemptId,
        'SUCCEEDED',
      );
    }

    return checkoutIntent;
  }

  private normalizeIdempotencyKey(idempotencyKey?: string) {
    const normalized = idempotencyKey?.trim();

    if (!normalized) {
      return undefined;
    }

    if (
      normalized.length < 8 ||
      normalized.length > 128 ||
      !/^[a-z0-9._-]+$/i.test(normalized)
    ) {
      throw new BadRequestException(
        'Idempotency key must be 8 to 128 URL-safe characters.',
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

  private buildRefundIdempotencyHash(
    paymentAttemptId: string,
    input: PaymentRefundInput,
  ) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          paymentAttemptId,
          actorUserId: input.actorUserId,
          reason: input.reason ?? null,
        }),
      )
      .digest('hex');
  }

  private assertRefundIdempotencyReplay(
    providerMetadata: unknown,
    refundIdempotencyHash: string | undefined,
  ) {
    if (!refundIdempotencyHash) {
      return;
    }

    const refund = jsonObject(jsonObject(providerMetadata).refund);
    const existingHash =
      typeof refund.idempotencyHash === 'string'
        ? refund.idempotencyHash
        : null;

    if (existingHash && existingHash !== refundIdempotencyHash) {
      throw new BadRequestException(
        'The provided idempotency key was already used with a different refund payload.',
      );
    }
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

    if (providerKey === 'pawapay') {
      return 'PAWAPAY' as const;
    }

    const unsupportedProvider: string = providerKey;
    throw new BadRequestException(
      `Unsupported payment provider: ${unsupportedProvider}`,
    );
  }

  private resolveProviderKey(
    provider: PaymentProviderCode,
  ): PaymentProviderKey {
    if (provider === 'FLUTTERWAVE') return 'flutterwave';
    if (provider === 'CINETPAY') return 'cinetpay';
    if (provider === 'PAWAPAY') return 'pawapay';
    if (provider === 'WALLET') return 'wallet';
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
          'User-Agent': 'Orbi/1.0',
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

  private resolveCheckoutRedirectUrl(redirectUrl?: string) {
    const fallbackUrl =
      this.configService.get<string>('payments.defaultRedirectUrl') ?? null;

    if (!redirectUrl) {
      return fallbackUrl;
    }

    let parsedRedirectUrl: URL;

    try {
      parsedRedirectUrl = new URL(redirectUrl);
    } catch {
      throw new BadRequestException('Payment redirect URL is invalid.');
    }

    if (!['http:', 'https:'].includes(parsedRedirectUrl.protocol)) {
      throw new BadRequestException('Payment redirect URL is invalid.');
    }

    const allowedOrigins = this.getAllowedPaymentRedirectOrigins();

    if (!allowedOrigins.has(parsedRedirectUrl.origin)) {
      throw new BadRequestException(
        'Payment redirect URL origin is not allowed.',
      );
    }

    return parsedRedirectUrl.toString();
  }

  private getAllowedPaymentRedirectOrigins() {
    const configuredOrigins =
      this.configService.get<string[] | string>('app.frontendOrigins') ?? [];
    const origins = Array.isArray(configuredOrigins)
      ? configuredOrigins
      : configuredOrigins.split(',');
    const allowedOrigins = new Set<string>();

    for (const origin of origins) {
      const normalizedOrigin = this.normalizeUrlOrigin(origin);

      if (normalizedOrigin) {
        allowedOrigins.add(normalizedOrigin);
      }
    }

    const defaultRedirectOrigin = this.normalizeUrlOrigin(
      this.configService.get<string>('payments.defaultRedirectUrl') ?? '',
    );

    if (defaultRedirectOrigin) {
      allowedOrigins.add(defaultRedirectOrigin);
    }

    return allowedOrigins;
  }

  private normalizeUrlOrigin(value: string) {
    if (!value.trim()) {
      return null;
    }

    try {
      const parsed = new URL(value.trim());

      return parsed.origin;
    } catch {
      return null;
    }
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

  private async fetchPawaPayVerification(
    depositId: string,
  ): Promise<ProviderVerificationPayload> {
    if (!this.pawaPayService?.isConfigured()) {
      throw new BadRequestException(
        'PawaPayService is not configured. Check PAWAPAY_API_TOKEN environment variable.',
      );
    }

    const deposit = await this.pawaPayService.getDepositStatus(depositId);
    const isCompleted = deposit.status === 'COMPLETED';
    const isFailed = deposit.status === 'FAILED';

    return {
      event: isCompleted
        ? 'deposit.completed'
        : isFailed
          ? 'deposit.failed'
          : 'deposit.pending',
      transactionRef: depositId,
      data: {
        providerReference: deposit.payer?.address?.value ?? depositId,
        status: deposit.status,
        amount: deposit.amount ? Number(deposit.amount) : undefined,
        currency: deposit.currency,
        raw: deposit as unknown as Record<string, unknown>,
      },
    };
  }

  private async initiatePawaPayRefund(
    attempt: {
      id: string;
      providerReference: string | null;
      transactionRef: string;
      amount: Prisma.Decimal;
      currency: string;
    },
    providerRefundReference: string,
  ): Promise<PaymentRefundProviderResult> {
    if (!this.pawaPayService?.isConfigured()) {
      return {
        providerRefundReference,
        status: 'pending',
        providerMode: 'manual_or_provider_console',
        raw: { mode: 'manual', reason: 'PawaPayService not configured' },
      };
    }

    const response = await this.pawaPayService.initiateRefund({
      refundId: providerRefundReference,
      depositId: attempt.transactionRef,
      amount: String(Math.round(Number(attempt.amount))),
      currency: attempt.currency,
    });

    const isCompleted = response.status === 'COMPLETED';
    const isAccepted =
      response.status === 'ACCEPTED' || response.status === 'DUPLICATE_IGNORED';

    if (!isCompleted && !isAccepted) {
      const failCode = response.failureReason?.failureCode ?? response.status;
      throw new BadRequestException(
        `PawaPay refund was rejected: ${failCode}.`,
      );
    }

    return {
      providerRefundReference: response.refundId ?? providerRefundReference,
      status: isCompleted ? 'processed' : 'pending',
      providerMode: 'provider_api',
      raw: response as unknown as Record<string, unknown>,
    };
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
    // Un paiement WALLET n'a jamais transité par un agrégateur externe : il
    // n'y a donc rien à rembourser côté provider. Le crédit réel au rider est
    // appliqué séparément par reverseRiderWalletDebitForRefund, dans la même
    // transaction que la mise à jour du statut de l'attempt.
    if (attempt.provider === 'WALLET') {
      return {
        providerRefundReference,
        status: 'processed',
        providerMode: 'manual_or_provider_console',
        raw: {
          mode: 'internal_wallet_reversal',
        },
      };
    }

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

    if (providerKey === 'pawapay') {
      return this.initiatePawaPayRefund(attempt, providerRefundReference);
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
          comments: input.reason ?? `Orbi refund ${attempt.transactionRef}`,
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
    const estimatedFare = this.resolveFiniteMoneyAmount(
      rideRequest.estimatedFare,
    );

    if (estimatedFare === null || estimatedFare <= 0) {
      throw new BadRequestException(
        'Ride request fare is unavailable for payment initialization.',
      );
    }

    if (requestedAmount !== undefined) {
      const normalizedRequestedAmount =
        this.resolveFiniteMoneyAmount(requestedAmount);

      if (
        normalizedRequestedAmount === null ||
        Math.round(normalizedRequestedAmount) !== Math.round(estimatedFare)
      ) {
        throw new BadRequestException(
          'Payment amount must match the current ride request fare.',
        );
      }
    }

    return estimatedFare;
  }

  private resolveFiniteMoneyAmount(value: unknown) {
    const amount = Number(value);

    return Number.isFinite(amount) ? amount : null;
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

    // PawaPay: correspondentIds contains provider-side references
    if (
      payload.correspondentIds &&
      typeof payload.correspondentIds === 'object'
    ) {
      const ids = payload.correspondentIds as Record<string, unknown>;
      const firstId = Object.values(ids).find((v) => typeof v === 'string');
      if (firstId) return firstId as string;
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

    // PawaPay: depositId is both the Orbi transactionRef and the provider deposit ID
    if (typeof payload.depositId === 'string') {
      return payload.depositId;
    }

    if (typeof payload.cpm_trans_id === 'string') {
      return payload.cpm_trans_id;
    }

    return null;
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

  private async reconcileWalletTopUpWebhook(input: {
    depositId: string;
    event: string;
    payload: PaymentWebhookPayload;
  }) {
    const topUp = await this.prisma.walletTopUp.findUnique({
      where: { depositId: input.depositId },
      select: {
        id: true,
        walletId: true,
        userId: true,
        amount: true,
        currency: true,
        status: true,
        depositId: true,
      },
    });

    if (!topUp) {
      return null;
    }

    if (topUp.status === 'COMPLETED' || topUp.status === 'FAILED') {
      return {
        walletTopUpId: topUp.id,
        userId: topUp.userId,
        nextAction: 'persisted_wallet_top_up_replay' as const,
      };
    }

    const providerStatus = this.extractWebhookTopUpStatus(
      input.event,
      input.payload,
    );

    if (providerStatus === 'COMPLETED') {
      const reference = topUp.depositId ?? topUp.id;

      try {
        await this.prisma.$transaction(async (tx) => {
          const update = await tx.walletTopUp.updateMany({
            where: {
              id: topUp.id,
              status: {
                notIn: ['COMPLETED', 'FAILED', 'CANCELLED'],
              },
            },
            data: { status: 'COMPLETED' },
          });

          if (update.count === 0) {
            return;
          }

          await tx.walletTransaction.create({
            data: {
              walletId: topUp.walletId,
              type: 'CREDIT',
              amount: topUp.amount,
              reference,
              description: `Recharge Mobile Money ${Number(topUp.amount).toLocaleString('fr-BF')} XOF`,
              metadata: {
                topUpId: topUp.id,
                depositId: topUp.depositId,
                provider: 'PAWAPAY',
                providerStatus,
              } satisfies Prisma.InputJsonObject,
            },
          });
          await tx.wallet.update({
            where: { id: topUp.walletId },
            data: { balance: { increment: topUp.amount } },
          });
        });
      } catch (error) {
        if (!isPrismaUniqueConstraintError(error)) {
          throw error;
        }

        return {
          walletTopUpId: topUp.id,
          userId: topUp.userId,
          nextAction: 'persisted_wallet_top_up_replay' as const,
        };
      }

      return {
        walletTopUpId: topUp.id,
        userId: topUp.userId,
        nextAction: 'persisted_wallet_top_up_credited' as const,
      };
    }

    await this.prisma.walletTopUp.updateMany({
      where: {
        id: topUp.id,
        status: {
          notIn: ['COMPLETED', 'FAILED', 'CANCELLED'],
        },
      },
      data: {
        status: 'FAILED',
        failureReason: 'PawaPay deposit failed',
      },
    });

    return {
      walletTopUpId: topUp.id,
      userId: topUp.userId,
      nextAction: 'persisted_wallet_top_up_failed' as const,
    };
  }

  private extractWebhookTopUpStatus(
    event: string,
    payload: PaymentWebhookPayload,
  ) {
    const data = this.asRecord(payload.data);
    const status = (
      this.stringValue(payload.status) ??
      this.stringValue(payload.Status) ??
      this.stringValue(data.status) ??
      this.stringValue(data.Status) ??
      event
    ).toUpperCase();

    return status === 'COMPLETED' || status === 'SUCCESSFUL'
      ? 'COMPLETED'
      : 'FAILED';
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

  private async reverseRiderWalletDebitForRefund(
    tx: {
      wallet: {
        findFirst(args: unknown): Promise<{ id: string } | null>;
        update(args: unknown): Promise<unknown>;
      };
      walletTransaction: {
        create(args: unknown): Promise<unknown>;
      };
    },
    attempt: {
      id: string;
      userId: string;
      amount: Prisma.Decimal;
      currency: string;
      transactionRef: string;
    },
    input: PaymentRefundInput,
  ) {
    const wallet = await tx.wallet.findFirst({
      where: {
        userId: attempt.userId,
        currency: attempt.currency,
      },
      select: {
        id: true,
      },
    });

    if (!wallet) {
      return {
        applied: false,
        reason: 'rider_wallet_not_found',
      };
    }

    const refundReference = `payment:${attempt.id}:wallet-refund`;
    const refundAmount = new Prisma.Decimal(Number(attempt.amount));

    try {
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'REFUND',
          amount: refundAmount,
          reference: refundReference,
          description: `Remboursement course ${attempt.transactionRef}`,
          metadata: {
            paymentAttemptId: attempt.id,
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
          amount: Number(attempt.amount),
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
          increment: refundAmount,
        },
      },
    });

    return {
      applied: true,
      walletId: wallet.id,
      amount: Number(attempt.amount),
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

  private async enqueueRefundVerificationJob(
    paymentAttemptId: string,
    providerRefundReference: string,
  ) {
    try {
      await this.jobQueueService?.enqueue({
        kind: 'PAYMENT_REFUND_VERIFICATION',
        dedupeKey: `payment-refund-verification:${paymentAttemptId}`,
        entityType: 'payment_attempt',
        entityId: paymentAttemptId,
        maxAttempts: 12,
        nextRunAt: new Date(Date.now() + 300_000),
        resetSucceededOnDedupe: true,
        payload: {
          paymentAttemptId,
          providerRefundReference,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue refund verification for payment ${paymentAttemptId}: ${this.errorMessage(
          error,
        )}`,
      );
    }
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

  // Le passthrough (verif ignoree si aucun secret n'est configure) n'est
  // acceptable qu'en dev/test — en production, un secret manquant ne doit
  // jamais laisser passer un webhook non verifie (perte d'argent possible).
  private assertWebhookSignatureOptionalOutsideProduction(reason: string) {
    const environment = this.configService.get<string>('app.environment');

    if (environment === 'production') {
      throw new UnauthorizedException(
        `Webhook provider signature cannot be verified: ${reason}`,
      );
    }
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
    // PAWAPAY: signature is verified upstream in handlePawaPayWebhook()
    // before this method is ever called, so no extra assertion needed here.
  }

  async handlePawaPayWebhook(
    rawBody: string,
    signature: string | undefined,
    payload: PaymentWebhookPayload,
  ) {
    const signatureVerified =
      this.pawaPayService?.verifyWebhookSignature(rawBody, signature) ?? false;

    if (this.pawaPayService && !signatureVerified) {
      throw new UnauthorizedException('PawaPay webhook signature is invalid.');
    }

    const signatureContext: PaymentWebhookSignatureContext = {
      rawBody,
      pawaPaySignatureVerified: signatureVerified,
    };

    return this.reconcileWebhookPayload(payload, signatureContext, {
      provider: 'PAWAPAY',
      providerKey: 'pawapay',
    });
  }

  private assertFlutterwaveSignature(
    signatureContext: PaymentWebhookSignatureContext,
  ) {
    const secretHash = this.configService.get<string>(
      'payments.flutterwave.webhookSecretHash',
    );

    if (!secretHash) {
      this.assertWebhookSignatureOptionalOutsideProduction(
        'Flutterwave webhook secret hash is not configured.',
      );
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
      this.assertWebhookSignatureOptionalOutsideProduction(
        'CinetPay secret key is not configured.',
      );
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

  private errorMessage(error: unknown) {
    return error instanceof Error && error.message
      ? error.message
      : 'unknown_error';
  }
}
