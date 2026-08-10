import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminDriverPayoutsService } from './admin-driver-payouts.service';

describe('AdminDriverPayoutsService wallet ledger controls', () => {
  function createService() {
    const prisma = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wallet-1',
          userId: 'driver-user-1',
          currency: 'XOF',
          balance: new Prisma.Decimal(-75000),
          isLocked: false,
          user: {
            role: 'DRIVER',
            fullName: 'Issa Driver',
          },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'wallet-1',
          userId: 'driver-user-1',
          currency: 'XOF',
          balance: new Prisma.Decimal(-15000),
          isLocked: false,
          user: {
            role: 'DRIVER',
            fullName: 'Issa Driver',
          },
        }),
      },
      walletTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'wallet-transaction-1',
          walletId: 'wallet-1',
          type: 'ADJUSTMENT',
          amount: new Prisma.Decimal(60000),
          reference: 'driver-wallet-recovery:wallet-1:ops-key-1',
          description: 'Recouvrement wallet chauffeur Issa Driver',
          createdAt: new Date('2026-05-01T09:00:00.000Z'),
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    const realtimeService = {
      publish: jest.fn(),
    };

    return {
      prisma,
      realtimeService,
      service: new AdminDriverPayoutsService(
        prisma as never,
        realtimeService as never,
      ),
    };
  }

  const auth = {
    user: {
      id: 'ops-1',
      fullName: 'Ops Orbi',
      role: 'OPS',
    },
  } as never;

  it('requires a secondary approval reference for high-value recovery adjustments', async () => {
    const { prisma, service } = createService();

    await expect(
      service.recordDriverWalletRecoveryAdjustment(
        'wallet-1',
        {
          amount: 60000,
          notes: 'Paiement terrain verifie par finance.',
          idempotencyKey: 'ops-key-1',
        },
        auth,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('records high-value recovery approval details in the immutable ledger and audit log', async () => {
    const { prisma, service } = createService();

    const result = await service.recordDriverWalletRecoveryAdjustment(
      'wallet-1',
      {
        amount: 60000,
        notes: 'Paiement terrain verifie par finance.',
        idempotencyKey: 'ops-key-1',
        secondaryApprovalReference: 'finance-approval-001',
      },
      auth,
    );

    expect(result.action).toBe('recorded');
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletId: 'wallet-1',
        type: 'ADJUSTMENT',
        amount: new Prisma.Decimal(60000),
        reference: 'driver-wallet-recovery:wallet-1:ops-key-1',
        metadata: expect.objectContaining({
          recovery: true,
          idempotencyKey: 'ops-key-1',
          secondaryApprovalRequired: true,
          secondaryApprovalReference: 'finance-approval-001',
          controlThresholdXof: 50000,
        }),
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DRIVER_WALLET_RECOVERY_ADJUSTMENT_RECORDED',
        metadata: expect.objectContaining({
          correlationId: 'driver-wallet-recovery:wallet-1:ops-key-1',
          secondaryApprovalRequired: true,
          secondaryApprovalReference: 'finance-approval-001',
          controlThresholdXof: 50000,
        }),
      }),
    });
  });
});
