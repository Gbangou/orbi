import { createHash } from 'crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';
import type { PaymentWebhookPayload } from './payments.types';

describe('PaymentsService', () => {
  function loadWebhookFixture(name: string): PaymentWebhookPayload {
    return JSON.parse(
      readFileSync(
        join(process.cwd(), 'src', 'modules', 'payments', 'fixtures', name),
        'utf8',
      ),
    ) as PaymentWebhookPayload;
  }

  function prismaUniqueConstraintError() {
    return new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    );
  }

  function buildExpectedIdempotencyHash(
    userId: string,
    payload: {
      rideRequestId: string;
      channel: string;
      amount?: number;
      mobileMoneyNetwork?: string;
      customerPhoneNumber?: string;
      redirectUrl?: string;
    },
    provider: 'FLUTTERWAVE' | 'CINETPAY',
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

  function createService(provider = 'flutterwave') {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string | undefined> = {
          'payments.provider': provider,
          'payments.currency': 'XOF',
          'payments.flutterwave.publicKey': 'pk_test_xxx',
          'payments.flutterwave.secretKey': 'sk_test_xxx',
          'payments.cinetpay.siteId': 'site_123',
          'payments.cinetpay.apiKey': 'api_123',
          'payments.webhookSecret': 'secret_123',
          'payments.defaultRedirectUrl':
            'https://app.mobilis.bf/payments/return',
        };

        if (key === 'app.frontendOrigins') {
          return ['https://app.mobilis.bf', 'http://localhost:8081'];
        }

        return values[key];
      }),
    };
    const prisma = {
      rideRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ride-request-1',
          status: 'REQUESTED',
          estimatedFare: 2400,
          currency: 'XOF',
          rider: {
            userId: 'user-1',
          },
          trip: null,
        }),
      },
      paymentAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'payment-1',
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({
          count: 1,
        }),
      },
      paymentWebhookEvent: {
        create: jest.fn().mockResolvedValue({
          id: 'webhook-event-1',
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      wallet: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wallet-driver-1',
        }),
        upsert: jest.fn().mockResolvedValue({
          id: 'wallet-driver-1',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      walletTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'wallet-transaction-1',
        }),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };
    const featureFlagsService = {
      isEnabled: jest.fn().mockReturnValue(true),
    };
    const jobQueueService = {
      enqueue: jest.fn().mockResolvedValue({
        id: 'job-1',
      }),
    };

    return {
      configService,
      prisma,
      featureFlagsService,
      jobQueueService,
      service: new PaymentsService(
        configService as never,
        prisma as never,
        featureFlagsService as never,
        jobQueueService as never,
      ),
    };
  }

  it('builds and persists a Flutterwave checkout intent for mobile money', async () => {
    const { service, prisma } = createService('flutterwave');

    const result = await service.createCheckoutIntent(
      {
        user: {
          id: 'user-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      {
        rideRequestId: 'ride-request-1',
        channel: 'MOBILE_MONEY',
        amount: 2400,
        mobileMoneyNetwork: 'ORANGE_MONEY',
      },
    );

    expect(result.provider).toBe('FLUTTERWAVE');
    expect(result.supportedMobileMoneyNetworks).toContain('ORANGE_MONEY');
    expect(prisma.paymentAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: undefined,
        amount: expect.objectContaining({
          toNumber: expect.any(Function),
        }),
        currency: 'XOF',
      }),
    });
  });

  it('accepts checkout redirect URLs from configured Mobilis frontend origins', async () => {
    const { service } = createService('flutterwave');

    const result = await service.createCheckoutIntent(
      {
        user: {
          id: 'user-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      {
        rideRequestId: 'ride-request-1',
        channel: 'MOBILE_MONEY',
        amount: 2400,
        redirectUrl: 'https://app.mobilis.bf/payments/return?attempt=1',
      },
    );

    expect(result.providerMetadata.callbackUrl).toBe(
      'https://app.mobilis.bf/payments/return?attempt=1',
    );
  });

  it('rejects checkout redirect URLs outside configured Mobilis origins', async () => {
    const { service, prisma } = createService('flutterwave');

    await expect(
      service.createCheckoutIntent(
        {
          user: {
            id: 'user-1',
            role: 'RIDER',
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        {
          rideRequestId: 'ride-request-1',
          channel: 'MOBILE_MONEY',
          amount: 2400,
          redirectUrl: 'https://attacker.example/payments/return',
        },
      ),
    ).rejects.toThrow('Payment redirect URL origin is not allowed.');
    expect(prisma.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it('builds a CinetPay checkout intent when configured', async () => {
    const { service } = createService('cinetpay');

    const result = await service.createCheckoutIntent(
      {
        user: {
          id: 'user-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      {
        rideRequestId: 'ride-request-1',
        channel: 'MOBILE_MONEY',
        amount: 2400,
      },
    );

    expect(result.provider).toBe('CINETPAY');
    expect(result.supportedMobileMoneyNetworks).toContain('WAVE');
  });

  it('rejects checkout when the requested amount differs from the server fare', async () => {
    const { service } = createService();

    await expect(
      service.createCheckoutIntent(
        {
          user: {
            id: 'user-1',
            role: 'RIDER',
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        {
          rideRequestId: 'ride-request-1',
          channel: 'MOBILE_MONEY',
          amount: 1200,
        },
      ),
    ).rejects.toThrow(
      'Payment amount must match the current ride request fare.',
    );
  });

  it('rejects checkout when the ride request is no longer pending', async () => {
    const { service, prisma } = createService();

    prisma.rideRequest.findUnique.mockResolvedValue({
      id: 'ride-request-1',
      status: 'MATCHED',
      estimatedFare: 2400,
      currency: 'XOF',
      rider: {
        userId: 'user-1',
      },
      trip: null,
    });

    await expect(
      service.createCheckoutIntent(
        {
          user: {
            id: 'user-1',
            role: 'RIDER',
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        {
          rideRequestId: 'ride-request-1',
          channel: 'MOBILE_MONEY',
          amount: 2400,
        },
      ),
    ).rejects.toThrow(
      'Payment can only be initialized while the ride request is pending or after a completed trip.',
    );
  });

  it('allows checkout initialization after a trip has completed', async () => {
    const { service, prisma } = createService();

    prisma.rideRequest.findUnique.mockResolvedValue({
      id: 'ride-request-1',
      status: 'MATCHED',
      estimatedFare: 2400,
      currency: 'XOF',
      rider: {
        userId: 'user-1',
      },
      trip: {
        status: 'COMPLETED',
      },
    });

    const result = await service.createCheckoutIntent(
      {
        user: {
          id: 'user-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      {
        rideRequestId: 'ride-request-1',
        channel: 'MOBILE_MONEY',
        amount: 2400,
      },
    );

    expect(result.transactionRef).toContain('ride-request-1');
    expect(prisma.paymentAttempt.create).toHaveBeenCalled();
  });

  it('persists webhook reconciliation for a successful payment', async () => {
    const { service, prisma, jobQueueService } = createService();

    const result = await service.handleWebhook('secret_123', {
      event: 'payment.completed',
      transactionRef: 'mobilis_123_ride-request-1',
      data: {
        providerReference: 'fw_ref_123',
      },
    });

    expect(result.nextAction).toBe('persisted_and_reconciled');
    expect(result.reconciledAttemptCount).toBe(1);
    expect(prisma.paymentAttempt.updateMany).toHaveBeenCalled();
    expect(prisma.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'persisted_and_reconciled',
        eventType: 'payment.completed',
        provider: 'FLUTTERWAVE',
        providerReference: 'fw_ref_123',
      }),
    });
    expect(jobQueueService.enqueue).toHaveBeenCalledWith({
      kind: 'PAYMENT_WEBHOOK',
      dedupeKey: 'payment-webhook:webhook-event-1',
      entityType: 'payment_webhook_event',
      entityId: 'webhook-event-1',
      payload: expect.objectContaining({
        eventId: 'webhook-event-1',
        action: 'persisted_and_reconciled',
        provider: 'FLUTTERWAVE',
        transactionRef: 'mobilis_123_ride-request-1',
        providerReference: 'fw_ref_123',
      }),
    });
  });

  it('treats repeated provider references as idempotent webhook replays', async () => {
    const { service, prisma } = createService();
    prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'payment-1',
      transactionRef: 'mobilis_123_ride-request-1',
    });

    const result = await service.handleWebhook('secret_123', {
      event: 'payment.completed',
      transactionRef: 'mobilis_123_ride-request-1',
      data: {
        providerReference: 'fw_ref_123',
      },
    });

    expect(result.nextAction).toBe('persisted_idempotent_replay');
    expect(prisma.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'persisted_idempotent_replay',
        paymentAttemptId: 'payment-1',
      }),
    });
    expect(prisma.paymentAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'payment-1',
        }),
      }),
    );
  });

  it('ignores provider references already bound to another transaction', async () => {
    const { service, prisma } = createService();
    prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'payment-1',
      transactionRef: 'mobilis_existing_ride-request-1',
    });

    const result = await service.handleWebhook('secret_123', {
      event: 'payment.completed',
      transactionRef: 'mobilis_other_ride-request-2',
      data: {
        providerReference: 'fw_ref_123',
      },
    });

    expect(result.nextAction).toBe('ignored_conflicting_provider_reference');
    expect(prisma.paymentAttempt.updateMany).not.toHaveBeenCalled();
    expect(prisma.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ignored_conflicting_provider_reference',
        reconciledAttemptCount: 0,
      }),
    });
  });

  it('keeps webhook reconciliation observable when the transaction reference is unknown', async () => {
    const { service, prisma } = createService();
    prisma.paymentAttempt.updateMany.mockResolvedValue({
      count: 0,
    });

    const result = await service.handleWebhook('secret_123', {
      event: 'payment.completed',
      transactionRef: 'mobilis_unknown',
    });

    expect(result.nextAction).toBe('ignored_unknown_reference');
    expect(result.reconciledAttemptCount).toBe(0);
  });

  it('ignores successful webhooks when provider amount does not match the attempt', async () => {
    const { service, prisma } = createService();
    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      amount: { toString: () => '2400', valueOf: () => 2400 },
      currency: 'XOF',
    });

    const result = await service.handleWebhook('secret_123', {
      event: 'payment.completed',
      transactionRef: 'mobilis_123_ride-request-1',
      data: {
        providerReference: 'fw_ref_123',
        amount: 1200,
        currency: 'XOF',
      },
    });

    expect(result.nextAction).toBe('ignored_amount_mismatch');
    expect(result.reconciledAttemptCount).toBe(0);
    expect(prisma.paymentAttempt.updateMany).not.toHaveBeenCalled();
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ignored_amount_mismatch',
        paymentAttemptId: 'payment-1',
        userId: 'user-1',
      }),
    });
  });

  it('creates a driver payout ledger entry when a payment succeeds', async () => {
    const { service, prisma } = createService();

    prisma.paymentAttempt.findUnique
      .mockResolvedValueOnce({
        id: 'payment-1',
        userId: 'user-1',
        amount: { toString: () => '2400', valueOf: () => 2400 },
        currency: 'XOF',
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        amount: { toString: () => '2400', valueOf: () => 2400 },
        currency: 'XOF',
        provider: 'FLUTTERWAVE',
        providerReference: 'fw_ref_123',
        transactionRef: 'mobilis_123_ride-request-1',
        rideRequestId: 'ride-request-1',
        rideRequest: {
          trip: {
            id: 'trip-1',
            driver: {
              userId: 'driver-user-1',
            },
          },
        },
      });

    const result = await service.handleWebhook('secret_123', {
      event: 'payment.completed',
      transactionRef: 'mobilis_123_ride-request-1',
      data: {
        providerReference: 'fw_ref_123',
      },
    });

    expect(result.nextAction).toBe('persisted_and_reconciled');
    expect(prisma.wallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_currency: {
            userId: 'driver-user-1',
            currency: 'XOF',
          },
        },
      }),
    );
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletId: 'wallet-driver-1',
        type: 'CREDIT',
        reference: 'payment:payment-1:driver-payout',
        metadata: expect.objectContaining({
          grossAmount: 2400,
          commissionAmount: 432,
          driverPayoutAmount: 1968,
        }),
      }),
    });
    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: {
        id: 'wallet-driver-1',
      },
      data: {
        balance: {
          increment: expect.objectContaining({
            toNumber: expect.any(Function),
          }),
        },
      },
    });
  });

  it('does not duplicate driver payout ledger entries on replay', async () => {
    const { service, prisma } = createService();

    prisma.paymentAttempt.findUnique
      .mockResolvedValueOnce({
        id: 'payment-1',
        userId: 'user-1',
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        amount: { toString: () => '2400', valueOf: () => 2400 },
        currency: 'XOF',
        provider: 'FLUTTERWAVE',
        providerReference: 'fw_ref_123',
        transactionRef: 'mobilis_123_ride-request-1',
        rideRequestId: 'ride-request-1',
        rideRequest: {
          trip: {
            id: 'trip-1',
            driver: {
              userId: 'driver-user-1',
            },
          },
        },
      });
    prisma.walletTransaction.findUnique.mockResolvedValue({
      id: 'wallet-transaction-1',
    });

    await service.handleWebhook('secret_123', {
      event: 'payment.completed',
      transactionRef: 'mobilis_123_ride-request-1',
      data: {
        providerReference: 'fw_ref_123',
      },
    });

    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.wallet.update).not.toHaveBeenCalled();
  });

  it('does not increment the driver wallet when a concurrent ledger create wins', async () => {
    const { service, prisma } = createService();

    prisma.paymentAttempt.findUnique
      .mockResolvedValueOnce({
        id: 'payment-1',
        userId: 'user-1',
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        amount: { toString: () => '2400', valueOf: () => 2400 },
        currency: 'XOF',
        provider: 'FLUTTERWAVE',
        providerReference: 'fw_ref_123',
        transactionRef: 'mobilis_123_ride-request-1',
        rideRequestId: 'ride-request-1',
        rideRequest: {
          trip: {
            id: 'trip-1',
            driver: {
              userId: 'driver-user-1',
            },
          },
        },
      });
    prisma.walletTransaction.findUnique.mockResolvedValue(null);
    prisma.walletTransaction.create.mockRejectedValue(
      prismaUniqueConstraintError(),
    );

    await service.handleWebhook('secret_123', {
      event: 'payment.completed',
      transactionRef: 'mobilis_123_ride-request-1',
      data: {
        providerReference: 'fw_ref_123',
      },
    });

    expect(prisma.wallet.update).not.toHaveBeenCalled();
  });

  it('refunds a succeeded payment attempt and reverses the driver wallet payout', async () => {
    const { service, prisma } = createService();

    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'SUCCEEDED',
      amount: { toString: () => '2400', valueOf: () => 2400 },
      currency: 'XOF',
      provider: 'FLUTTERWAVE',
      providerReference: 'fw_ref_123',
      providerMetadata: {
        checkout: 'metadata',
      },
      transactionRef: 'mobilis_123_ride-request-1',
      rideRequestId: 'ride-request-1',
      updatedAt: new Date('2026-05-01T08:00:00.000Z'),
      rideRequest: {
        trip: {
          id: 'trip-1',
          driver: {
            userId: 'driver-user-1',
          },
        },
      },
    });
    prisma.paymentAttempt.update.mockResolvedValue({
      id: 'payment-1',
      status: 'REFUNDED',
      amount: { toString: () => '2400', valueOf: () => 2400 },
      currency: 'XOF',
      provider: 'FLUTTERWAVE',
      providerReference: 'fw_ref_123',
      transactionRef: 'mobilis_123_ride-request-1',
      updatedAt: new Date('2026-05-01T08:05:00.000Z'),
    });
    prisma.walletTransaction.findUnique
      .mockResolvedValueOnce({ id: 'wallet-credit-1' })
      .mockResolvedValueOnce(null);

    const result = await service.refundPaymentAttempt('payment-1', {
      actorUserId: 'ops-1',
      actorName: 'Ops Mobilis',
      reason: 'Rider charged after cancellation.',
    });

    expect(prisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REFUNDED',
          providerMetadata: expect.objectContaining({
            refund: expect.objectContaining({
              providerRefundReference: 'flutterwave_refund_payment-1',
              reason: 'Rider charged after cancellation.',
            }),
          }),
        }),
      }),
    );
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletId: 'wallet-driver-1',
        type: 'REFUND',
        reference: 'payment:payment-1:driver-payout-refund',
        metadata: expect.objectContaining({
          originalCreditReference: 'payment:payment-1:driver-payout',
          driverPayoutAmount: 1968,
        }),
      }),
    });
    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: {
        id: 'wallet-driver-1',
      },
      data: {
        balance: {
          decrement: expect.objectContaining({
            toNumber: expect.any(Function),
          }),
        },
      },
    });
    expect(result.action).toBe('refunded');
    expect(result.walletReversal).toEqual(
      expect.objectContaining({
        applied: true,
        amount: 1968,
      }),
    );
  });

  it('returns an idempotent refund result for an already refunded attempt', async () => {
    const { service, prisma } = createService();

    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'REFUNDED',
      amount: { toString: () => '2400', valueOf: () => 2400 },
      currency: 'XOF',
      provider: 'CINETPAY',
      providerReference: 'cp_ref_123',
      transactionRef: 'mobilis_123_ride-request-1',
      updatedAt: new Date('2026-05-01T08:05:00.000Z'),
      rideRequest: {
        trip: null,
      },
    });

    const result = await service.refundPaymentAttempt('payment-1', {
      actorUserId: 'ops-1',
    });

    expect(prisma.paymentAttempt.update).not.toHaveBeenCalled();
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(result.action).toBe('already_refunded');
    expect(result.providerRefundReference).toBe('cinetpay_refund_payment-1');
  });

  it('initiates a Flutterwave provider refund and queues verification until provider processing completes', async () => {
    const { service, prisma, configService, jobQueueService } =
      createService('flutterwave');
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string | undefined> = {
        'payments.provider': 'flutterwave',
        'payments.currency': 'XOF',
        'payments.flutterwave.secretKey': 'sk_test_xxx',
        'payments.refunds.mode': 'provider',
      };

      return values[key];
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        status: 'success',
        data: {
          id: 'fw_refund_123',
          status: 'pending',
        },
      }),
    } as never);

    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'SUCCEEDED',
      amount: { toString: () => '2400', valueOf: () => 2400 },
      currency: 'XOF',
      provider: 'FLUTTERWAVE',
      providerReference: '123456',
      providerMetadata: {
        checkout: 'metadata',
      },
      transactionRef: 'mobilis_123_ride-request-1',
      rideRequestId: 'ride-request-1',
      updatedAt: new Date('2026-05-01T08:00:00.000Z'),
      rideRequest: {
        trip: {
          id: 'trip-1',
          driver: {
            userId: 'driver-user-1',
          },
        },
      },
    });
    prisma.paymentAttempt.update.mockResolvedValue({
      id: 'payment-1',
      status: 'REFUND_PENDING',
      amount: { toString: () => '2400', valueOf: () => 2400 },
      currency: 'XOF',
      provider: 'FLUTTERWAVE',
      providerReference: '123456',
      transactionRef: 'mobilis_123_ride-request-1',
      updatedAt: new Date('2026-05-01T08:05:00.000Z'),
    });

    const result = await service.refundPaymentAttempt('payment-1', {
      actorUserId: 'ops-1',
      actorName: 'Ops Mobilis',
      reason: 'Provider refund test.',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.flutterwave.com/v3/transactions/123456/refund',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_xxx',
          'Idempotency-Key': 'flutterwave_refund_payment-1',
        }),
      }),
    );
    expect(prisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REFUND_PENDING',
          providerMetadata: expect.objectContaining({
            refund: expect.objectContaining({
              providerMode: 'provider_api',
              providerStatus: 'pending',
              providerRefundReference: 'flutterwave_refund_payment-1',
            }),
          }),
        }),
      }),
    );
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(result.action).toBe('refund_pending');
    expect(result.providerRefundReference).toBe('flutterwave_refund_payment-1');
    expect(result.walletReversal).toEqual({
      applied: false,
      reason: 'refund_pending',
    });
    expect(jobQueueService.enqueue).toHaveBeenCalledWith({
      kind: 'PAYMENT_REFUND_VERIFICATION',
      dedupeKey: 'payment-refund-verification:payment-1',
      entityType: 'payment_attempt',
      entityId: 'payment-1',
      maxAttempts: 12,
      nextRunAt: expect.any(Date),
      resetSucceededOnDedupe: true,
      payload: {
        paymentAttemptId: 'payment-1',
        providerRefundReference: 'flutterwave_refund_payment-1',
      },
    });

    fetchSpy.mockRestore();
  });

  it('verifies a pending Flutterwave refund and reverses the driver wallet after provider processing', async () => {
    const { service, prisma, configService } = createService('flutterwave');
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string | undefined> = {
        'payments.provider': 'flutterwave',
        'payments.currency': 'XOF',
        'payments.flutterwave.secretKey': 'sk_test_xxx',
      };

      return values[key];
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        status: 'success',
        data: {
          id: 'fw_refund_123',
          status: 'completed',
        },
      }),
    } as never);

    prisma.paymentAttempt.findUnique
      .mockResolvedValueOnce({
        id: 'payment-1',
        provider: 'FLUTTERWAVE',
        status: 'REFUND_PENDING',
        transactionRef: 'mobilis_123_ride-request-1',
        amount: 2400,
        currency: 'XOF',
        providerMetadata: {
          refund: {
            providerRefundId: 'fw_refund_123',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        status: 'REFUND_PENDING',
        amount: { toString: () => '2400', valueOf: () => 2400 },
        currency: 'XOF',
        provider: 'FLUTTERWAVE',
        providerReference: '123456',
        providerMetadata: {
          refund: {
            providerRefundId: 'fw_refund_123',
          },
        },
        transactionRef: 'mobilis_123_ride-request-1',
        rideRequestId: 'ride-request-1',
        rideRequest: {
          trip: {
            id: 'trip-1',
            driver: {
              userId: 'driver-user-1',
            },
          },
        },
      });
    prisma.walletTransaction.findUnique
      .mockResolvedValueOnce({ id: 'wallet-credit-1' })
      .mockResolvedValueOnce(null);

    const result = await service.verifyPaymentAttemptWithProvider('payment-1');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.flutterwave.com/v3/refunds/fw_refund_123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_xxx',
        }),
      }),
    );
    expect(prisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REFUNDED',
        }),
      }),
    );
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'REFUND',
        reference: 'payment:payment-1:driver-payout-refund',
      }),
    });
    expect(result.result.nextAction).toBe('refund_processed');
    expect(result.result.reconciledAttemptCount).toBe(1);

    fetchSpy.mockRestore();
  });

  it('finalizes a pending refund from a provider refund webhook and writes the wallet reversal', async () => {
    const { service, prisma } = createService('flutterwave');

    prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      transactionRef: 'mobilis_123_ride-request-1',
    });
    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'REFUND_PENDING',
      amount: { toString: () => '2400', valueOf: () => 2400 },
      currency: 'XOF',
      provider: 'FLUTTERWAVE',
      providerReference: '123456',
      providerMetadata: {
        refund: {
          providerRefundId: 'fw_refund_123',
        },
      },
      transactionRef: 'mobilis_123_ride-request-1',
      rideRequestId: 'ride-request-1',
      rideRequest: {
        trip: {
          id: 'trip-1',
          driver: {
            userId: 'driver-user-1',
          },
        },
      },
    });
    prisma.walletTransaction.findUnique
      .mockResolvedValueOnce({ id: 'wallet-credit-1' })
      .mockResolvedValueOnce(null);

    const result = await service.handleWebhook('secret_123', {
      event: 'refund.completed',
      data: {
        id: 'fw_refund_123',
        transaction_id: '123456',
        status: 'completed',
      },
    });

    expect(prisma.paymentAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: 'FLUTTERWAVE',
          OR: expect.arrayContaining([
            expect.objectContaining({
              providerMetadata: expect.objectContaining({
                path: ['refund', 'providerRefundId'],
                equals: 'fw_refund_123',
              }),
            }),
            expect.objectContaining({
              providerReference: '123456',
            }),
          ]),
        }),
      }),
    );
    expect(prisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REFUNDED',
        }),
      }),
    );
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'REFUND',
        reference: 'payment:payment-1:driver-payout-refund',
      }),
    });
    expect(prisma.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'refund_processed',
        eventType: 'refund.completed',
        providerReference: 'fw_refund_123',
        paymentAttemptId: 'payment-1',
      }),
    });
    expect(result.nextAction).toBe('refund_processed');
    expect(result.reconciledAttemptCount).toBe(1);
  });

  it('journals pending refund webhooks without reversing the wallet', async () => {
    const { service, prisma } = createService('flutterwave');

    prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      transactionRef: 'mobilis_123_ride-request-1',
    });

    const result = await service.handleWebhook('secret_123', {
      event: 'refund.processing',
      data: {
        id: 'fw_refund_123',
        transaction_id: '123456',
        status: 'pending',
      },
    });

    expect(prisma.paymentAttempt.update).not.toHaveBeenCalled();
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'refund_still_pending',
        paymentAttemptId: 'payment-1',
      }),
    });
    expect(result.nextAction).toBe('refund_still_pending');
    expect(result.reconciledAttemptCount).toBe(0);
  });

  it('keeps Flutterwave processed refund webhook fixtures executable', async () => {
    const { service, prisma } = createService('flutterwave');

    prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      transactionRef: 'mobilis_123_ride-request-1',
    });
    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'REFUND_PENDING',
      amount: { toString: () => '2400', valueOf: () => 2400 },
      currency: 'XOF',
      provider: 'FLUTTERWAVE',
      providerReference: '123456',
      providerMetadata: {
        refund: {
          providerRefundId: 'fw_refund_123',
        },
      },
      transactionRef: 'mobilis_123_ride-request-1',
      rideRequestId: 'ride-request-1',
      rideRequest: {
        trip: {
          id: 'trip-1',
          driver: {
            userId: 'driver-user-1',
          },
        },
      },
    });
    prisma.walletTransaction.findUnique
      .mockResolvedValueOnce({ id: 'wallet-credit-1' })
      .mockResolvedValueOnce(null);

    const result = await service.handleWebhook(
      'secret_123',
      loadWebhookFixture('flutterwave-refund-processed-webhook.json'),
    );

    expect(result.nextAction).toBe('refund_processed');
    expect(result.reconciledAttemptCount).toBe(1);
    expect(prisma.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'refund_processed',
        providerReference: 'fw_refund_123',
        paymentAttemptId: 'payment-1',
      }),
    });
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'REFUND',
        reference: 'payment:payment-1:driver-payout-refund',
      }),
    });
  });

  it('keeps Flutterwave pending refund webhook fixtures from moving money', async () => {
    const { service, prisma } = createService('flutterwave');

    prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      transactionRef: 'mobilis_123_ride-request-1',
    });

    const result = await service.handleWebhook(
      'secret_123',
      loadWebhookFixture('flutterwave-refund-pending-webhook.json'),
    );

    expect(result.nextAction).toBe('refund_still_pending');
    expect(result.reconciledAttemptCount).toBe(0);
    expect(prisma.paymentAttempt.update).not.toHaveBeenCalled();
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'refund_still_pending',
        providerReference: 'fw_refund_123',
        paymentAttemptId: 'payment-1',
      }),
    });
  });

  it('replays a stored webhook event through the same idempotent reconciliation path', async () => {
    const { service, prisma } = createService();

    prisma.paymentWebhookEvent.findUnique.mockResolvedValue({
      id: 'webhook-event-1',
      provider: 'FLUTTERWAVE',
      payload: {
        event: 'payment.completed',
        transactionRef: 'mobilis_123_ride-request-1',
        data: {
          providerReference: 'fw_ref_123',
        },
      },
    });
    prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'payment-1',
      transactionRef: 'mobilis_123_ride-request-1',
      userId: 'user-1',
    });

    const result = await service.replayStoredWebhookEvent('webhook-event-1');

    expect(result.replayed).toBe(true);
    expect(result.sourceEventId).toBe('webhook-event-1');
    expect(result.result.nextAction).toBe('persisted_idempotent_replay');
    expect(prisma.paymentAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'payment-1',
        }),
      }),
    );
    expect(prisma.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'persisted_idempotent_replay',
        provider: 'FLUTTERWAVE',
        providerReference: 'fw_ref_123',
      }),
    });
  });

  it('verifies a Flutterwave payment attempt against the provider and reconciles it', async () => {
    const { prisma, service } = createService('flutterwave');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        status: 'success',
        data: {
          tx_ref: 'mobilis_123_ride-request-1',
          flw_ref: 'fw_ref_123',
          status: 'successful',
          amount: 2400,
          currency: 'XOF',
        },
      }),
    } as never);

    prisma.paymentAttempt.findUnique
      .mockResolvedValueOnce({
        id: 'payment-1',
        provider: 'FLUTTERWAVE',
        transactionRef: 'mobilis_123_ride-request-1',
        amount: 2400,
        currency: 'XOF',
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        userId: 'user-1',
        amount: { toString: () => '2400', valueOf: () => 2400 },
        currency: 'XOF',
      })
      .mockResolvedValueOnce({
        id: 'payment-1',
        amount: { toString: () => '2400', valueOf: () => 2400 },
        currency: 'XOF',
        provider: 'FLUTTERWAVE',
        providerReference: 'fw_ref_123',
        transactionRef: 'mobilis_123_ride-request-1',
        rideRequestId: 'ride-request-1',
        rideRequest: {
          trip: {
            id: 'trip-1',
            driver: {
              userId: 'driver-user-1',
            },
          },
        },
      });

    const result = await service.verifyPaymentAttemptWithProvider('payment-1');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('verify_by_reference'),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_xxx',
        }),
      }),
    );
    expect(prisma.paymentAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          providerReference: 'fw_ref_123',
        }),
      }),
    );
    expect(result.result.nextAction).toBe('persisted_and_reconciled');

    fetchSpy.mockRestore();
  });

  it('rejects provider verification when the amount does not match', async () => {
    const { prisma, service } = createService('flutterwave');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        data: {
          tx_ref: 'mobilis_123_ride-request-1',
          flw_ref: 'fw_ref_123',
          status: 'successful',
          amount: 1000,
          currency: 'XOF',
        },
      }),
    } as never);

    prisma.paymentAttempt.findUnique.mockResolvedValueOnce({
      id: 'payment-1',
      provider: 'FLUTTERWAVE',
      transactionRef: 'mobilis_123_ride-request-1',
      amount: 2400,
      currency: 'XOF',
    });

    await expect(
      service.verifyPaymentAttemptWithProvider('payment-1'),
    ).rejects.toThrow(
      'Provider verification amount does not match the payment attempt.',
    );

    expect(prisma.paymentAttempt.updateMany).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects rider checkout for a ride request owned by another user', async () => {
    const { service, prisma } = createService();

    prisma.rideRequest.findUnique.mockResolvedValue({
      id: 'ride-request-1',
      rider: {
        userId: 'user-999',
      },
    });

    await expect(
      service.createCheckoutIntent(
        {
          user: {
            id: 'user-1',
            role: 'RIDER',
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        {
          rideRequestId: 'ride-request-1',
          channel: 'MOBILE_MONEY',
          amount: 2400,
        },
      ),
    ).rejects.toThrow(
      'Riders can only initialize payment for their own request.',
    );
  });

  it('reuses an existing checkout intent when the same idempotency key is retried', async () => {
    const { service, prisma } = createService('flutterwave');
    const payload = {
      rideRequestId: 'ride-request-1',
      channel: 'MOBILE_MONEY' as const,
      amount: 2400,
      mobileMoneyNetwork: 'ORANGE_MONEY' as const,
    };
    const idempotencyHash = buildExpectedIdempotencyHash(
      'user-1',
      payload,
      'FLUTTERWAVE',
      2400,
      'XOF',
    );

    prisma.paymentAttempt.findUnique.mockResolvedValue({
      provider: 'FLUTTERWAVE',
      transactionRef: 'mobilis_existing_ride-request-1',
      amount: { toString: () => '2400', valueOf: () => 2400 },
      currency: 'XOF',
      channel: 'MOBILE_MONEY',
      providerMetadata: {
        publicKeyPresent: true,
        callbackUrl: 'https://mobilis.app/payments/return',
      },
      idempotencyHash,
    });

    const result = await service.createCheckoutIntent(
      {
        user: {
          id: 'user-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      payload,
      'checkout-key-001',
    );

    expect(result.transactionRef).toBe('mobilis_existing_ride-request-1');
    expect(prisma.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it('returns the concurrent checkout attempt when idempotent creation races', async () => {
    const { service, prisma } = createService('flutterwave');
    const payload = {
      rideRequestId: 'ride-request-1',
      channel: 'MOBILE_MONEY' as const,
      amount: 2400,
      mobileMoneyNetwork: 'ORANGE_MONEY' as const,
    };
    const idempotencyHash = buildExpectedIdempotencyHash(
      'user-1',
      payload,
      'FLUTTERWAVE',
      2400,
      'XOF',
    );

    prisma.paymentAttempt.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        provider: 'FLUTTERWAVE',
        transactionRef: 'mobilis_concurrent_ride-request-1',
        amount: { toString: () => '2400', valueOf: () => 2400 },
        currency: 'XOF',
        channel: 'MOBILE_MONEY',
        providerMetadata: {
          publicKeyPresent: true,
          callbackUrl: 'https://mobilis.app/payments/return',
        },
        idempotencyHash,
      });
    prisma.paymentAttempt.create.mockRejectedValue(
      prismaUniqueConstraintError(),
    );

    const result = await service.createCheckoutIntent(
      {
        user: {
          id: 'user-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      payload,
      'checkout-key-001',
    );

    expect(result.transactionRef).toBe('mobilis_concurrent_ride-request-1');
    expect(prisma.paymentAttempt.findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejects idempotency key reuse when the payload changes', async () => {
    const { service, prisma } = createService('flutterwave');
    const payload = {
      rideRequestId: 'ride-request-1',
      channel: 'MOBILE_MONEY' as const,
      amount: 2400,
      mobileMoneyNetwork: 'ORANGE_MONEY' as const,
    };

    prisma.paymentAttempt.findUnique.mockResolvedValue({
      provider: 'FLUTTERWAVE',
      transactionRef: 'mobilis_existing_ride-request-1',
      amount: { toString: () => '2400', valueOf: () => 2400 },
      currency: 'XOF',
      channel: 'MOBILE_MONEY',
      providerMetadata: {
        publicKeyPresent: true,
        callbackUrl: 'https://mobilis.app/payments/return',
      },
      idempotencyHash: 'different-hash',
    });

    await expect(
      service.createCheckoutIntent(
        {
          user: {
            id: 'user-1',
            role: 'RIDER',
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        payload,
        'checkout-key-001',
      ),
    ).rejects.toThrow(
      'The provided idempotency key was already used with a different payment payload.',
    );
  });

  it('rejects unsafe checkout idempotency keys before creating an attempt', async () => {
    const { service, prisma } = createService('flutterwave');

    await expect(
      service.createCheckoutIntent(
        {
          user: {
            id: 'user-1',
            role: 'RIDER',
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        {
          rideRequestId: 'ride-request-1',
          channel: 'MOBILE_MONEY',
          amount: 2400,
          mobileMoneyNetwork: 'ORANGE_MONEY',
        },
        'checkout key with spaces',
      ),
    ).rejects.toThrow('Idempotency key must be 8 to 128 URL-safe characters.');
    expect(prisma.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it('rejects webhook calls with an invalid secret', async () => {
    const { service } = createService();

    await expect(
      service.handleWebhook('bad_secret', {
        event: 'payment.completed',
      }),
    ).rejects.toThrow('Webhook secret is invalid.');
  });

  it('rejects Flutterwave webhooks with an invalid provider signature when configured', async () => {
    const { service, configService } = createService('flutterwave');
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string | undefined> = {
        'payments.provider': 'flutterwave',
        'payments.currency': 'XOF',
        'payments.webhookSecret': 'secret_123',
        'payments.flutterwave.webhookSecretHash': 'fw_hash_123',
      };

      return values[key];
    });

    await expect(
      service.handleWebhook(
        'secret_123',
        {
          event: 'payment.completed',
          transactionRef: 'mobilis_123_ride-request-1',
        },
        {
          flutterwaveVerificationHash: 'bad_hash',
        },
      ),
    ).rejects.toThrow('Webhook provider signature is invalid.');
  });

  it('blocks checkout when the payments feature flag is disabled for the actor', async () => {
    const { service, featureFlagsService } = createService();

    featureFlagsService.isEnabled.mockReturnValue(false);

    await expect(
      service.createCheckoutIntent(
        {
          user: {
            id: 'user-1',
            role: 'RIDER',
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        {
          rideRequestId: 'ride-request-1',
          channel: 'MOBILE_MONEY',
          amount: 2400,
        },
      ),
    ).rejects.toThrow(
      'Payments are temporarily unavailable for this actor while rollout controls are active.',
    );
  });
});
