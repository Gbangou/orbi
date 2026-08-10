import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WalletTopUpService } from './wallet-topup.service';
import type { RequestAuthContext } from '../auth/auth.types';

describe('WalletTopUpService', () => {
  function authContext(): RequestAuthContext {
    return {
      user: {
        id: 'rider-user-1',
        email: 'rider@orbi.test',
        phoneNumber: '70123456',
        passwordHash: null,
        fullName: 'Awa Rider',
        role: 'RIDER',
        provider: 'EMAIL',
        isActive: true,
        isPhoneVerified: true,
        lastLoginAt: null,
        createdAt: new Date('2026-05-01T08:00:00.000Z'),
        updatedAt: new Date('2026-05-01T08:00:00.000Z'),
        pushToken: null,
        failedLoginCount: 0,
        lockedUntil: null,
        riderProfile: { id: 'rider-profile-1' } as never,
        driverProfile: null,
      },
      session: {
        id: 'session-1',
        userId: 'rider-user-1',
        createdAt: new Date('2026-05-01T08:00:00.000Z'),
        lastSeenAt: new Date('2026-05-01T08:00:00.000Z'),
        expiresAt: new Date('2026-05-01T12:00:00.000Z'),
        revokedAt: null,
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      },
      token: 'token',
    };
  }

  function createService(options: { pawaPayConfigured?: boolean } = {}) {
    let storedTopUp: {
      id: string;
      walletId: string;
      userId: string;
      amount: Prisma.Decimal;
      currency: string;
      status: string;
      depositId: string;
      mobileMoneyNetwork: string;
      customerPhoneNumber: string;
      providerMetadata: unknown;
    } | null = null;
    const prisma = {
      wallet: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wallet-1',
          userId: 'rider-user-1',
          currency: 'XOF',
          balance: new Prisma.Decimal(0),
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
      walletTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'wallet-transaction-1',
          walletId: 'wallet-1',
          type: 'CREDIT',
          amount: new Prisma.Decimal(2500),
          reference: 'deposit-1',
        }),
      },
      walletTopUp: {
        findUnique: jest.fn(
          async ({ where }: { where: { depositId: string } }) =>
            storedTopUp?.depositId === where.depositId ? storedTopUp : null,
        ),
        create: jest.fn(async ({ data }: { data: typeof storedTopUp }) => {
          storedTopUp = {
            ...data!,
            id: 'topup-1',
          };
          return storedTopUp;
        }),
        update: jest.fn(
          async ({
            data,
          }: {
            data: { status: string; failureReason?: string };
          }) => {
            storedTopUp = {
              ...storedTopUp!,
              ...data,
            };
            return storedTopUp;
          },
        ),
        updateMany: jest.fn(async () => {
          if (!storedTopUp || ['COMPLETED', 'FAILED'].includes(storedTopUp.status)) {
            return { count: 0 };
          }

          storedTopUp = {
            ...storedTopUp,
            status: 'COMPLETED',
          };

          return { count: 1 };
        }),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    const pawaPayService = {
      isConfigured: jest
        .fn()
        .mockReturnValue(options.pawaPayConfigured ?? true),
      initiateDeposit: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }),
    };

    return {
      prisma,
      pawaPayService,
      service: new WalletTopUpService(prisma as never, pawaPayService as never),
    };
  }

  const payload = {
    amountXof: 2500,
    mobileMoneyNetwork: 'ORANGE_BFA',
    customerPhoneNumber: '70 12 34 56',
  };

  it('reuses an existing top-up when the same idempotency key is retried', async () => {
    const { prisma, pawaPayService, service } = createService();

    const first = await service.initiateTopUp(
      authContext(),
      payload,
      'wallet-topup-001',
    );
    const retry = await service.initiateTopUp(
      authContext(),
      payload,
      'wallet-topup-001',
    );

    expect(retry).toEqual(first);
    expect(prisma.walletTopUp.create).toHaveBeenCalledTimes(1);
    expect(pawaPayService.initiateDeposit).toHaveBeenCalledTimes(1);
  });

  it('rejects wallet top-up idempotency key reuse with a different payload', async () => {
    const { service } = createService();

    await service.initiateTopUp(authContext(), payload, 'wallet-topup-002');

    await expect(
      service.initiateTopUp(
        authContext(),
        { ...payload, amountXof: 3000 },
        'wallet-topup-002',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsafe wallet top-up idempotency keys before creating a top-up', async () => {
    const { prisma, service } = createService();

    await expect(
      service.initiateTopUp(authContext(), payload, 'unsafe key'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.walletTopUp.create).not.toHaveBeenCalled();
  });

  it('rejects non-integer top-up amounts before touching the provider', async () => {
    const { prisma, pawaPayService, service } = createService();

    await expect(
      service.initiateTopUp(
        authContext(),
        { ...payload, amountXof: 2500.5 },
        'wallet-topup-002b',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.walletTopUp.create).not.toHaveBeenCalled();
    expect(pawaPayService.initiateDeposit).not.toHaveBeenCalled();
  });

  it('keeps a top-up pending without calling PawaPay when no sandbox token is configured', async () => {
    const { pawaPayService, service } = createService({
      pawaPayConfigured: false,
    });

    const result = await service.initiateTopUp(
      authContext(),
      payload,
      'wallet-topup-003',
    );

    expect(result.status).toBe('PENDING');
    expect(result.awaitingPhoneConfirmation).toBe(true);
    expect(pawaPayService.initiateDeposit).not.toHaveBeenCalled();
  });

  it('credits the wallet through an immutable ledger entry when a top-up completes', async () => {
    const { prisma, service } = createService();

    const topUp = await service.initiateTopUp(
      authContext(),
      payload,
      'wallet-topup-004',
    );

    const result = await service.handlePawaPayTopUpWebhook(
      topUp.depositId,
      'COMPLETED',
    );

    expect(result).toMatchObject({
      handled: true,
      action: 'wallet_credited',
      amount: 2500,
    });
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletId: 'wallet-1',
        type: 'CREDIT',
        amount: new Prisma.Decimal(2500),
        metadata: expect.objectContaining({
          direction: 'CREDIT',
          source: 'wallet_top_up_webhook',
          status: 'COMPLETED',
        }),
      }),
    });
    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { balance: { increment: new Prisma.Decimal(2500) } },
    });
  });

  it('does not increment the wallet when a replay finds the existing ledger entry', async () => {
    const { prisma, service } = createService();

    const topUp = await service.initiateTopUp(
      authContext(),
      payload,
      'wallet-topup-005',
    );
    prisma.walletTransaction.findUnique.mockResolvedValue({
      id: 'wallet-transaction-1',
      walletId: 'wallet-1',
      type: 'CREDIT',
      amount: new Prisma.Decimal(2500),
      reference: 'existing-reference',
    });

    const result = await service.handlePawaPayTopUpWebhook(
      topUp.depositId,
      'COMPLETED',
    );

    expect(result).toMatchObject({
      handled: true,
      action: 'already_credited',
      amount: 2500,
    });
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.wallet.update).not.toHaveBeenCalled();
  });
});
