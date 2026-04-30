import { createHash } from 'crypto';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
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
          'payments.cinetpay.siteId': 'site_123',
          'payments.webhookSecret': 'secret_123',
        };

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
        }),
      },
      paymentAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'payment-1',
        }),
        updateMany: jest.fn().mockResolvedValue({
          count: 1,
        }),
      },
      paymentWebhookEvent: {
        create: jest.fn().mockResolvedValue({
          id: 'webhook-event-1',
        }),
      },
    };
    const featureFlagsService = {
      isEnabled: jest.fn().mockReturnValue(true),
    };

    return {
      configService,
      prisma,
      featureFlagsService,
      service: new PaymentsService(
        configService as never,
        prisma as never,
        featureFlagsService as never,
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
      'Payment can only be initialized while the ride request is still pending.',
    );
  });

  it('persists webhook reconciliation for a successful payment', async () => {
    const { service, prisma } = createService();

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
        where: {
          id: 'payment-1',
        },
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
