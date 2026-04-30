import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FeatureFlagsService } from '../../core/runtime/feature-flags.service';
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
  PaymentRequestContext,
  PaymentWebhookSignatureContext,
  PaymentWebhookPayload,
  RideRequestPaymentOwnership,
} from './payments.types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly featureFlagsService: FeatureFlagsService,
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

    const transactionRef = this.extractWebhookTransactionReference(payload);
    const event = payload.event ?? 'unknown';
    const provider = this.resolveProvider(this.getConfiguredProviderKey());
    const providerReference = this.extractWebhookProviderReference(payload);
    const signatureVerified =
      this.wasProviderSignatureVerified(signatureContext);
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
          provider: this.getConfiguredProviderKey(),
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
    }

    const result = {
      received: true,
      event,
      transactionRef,
      provider: this.getConfiguredProviderKey(),
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

    if (rideRequest.status !== 'REQUESTED') {
      throw new BadRequestException(
        'Payment can only be initialized while the ride request is still pending.',
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
    await this.prisma.paymentWebhookEvent.create({
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

    const expectedToken = createHmac(
      'sha256',
      secretKey,
    )
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

        return value === undefined || value === null ? '' : String(value);
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
