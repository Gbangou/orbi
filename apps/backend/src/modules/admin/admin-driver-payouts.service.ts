/**
 * AdminDriverPayoutsService — Gestion des portefeuilles et paiements chauffeurs
 *
 * Responsabilité unique: consultation, approbation et export des paiements
 * chauffeurs (wallet, virements, réconciliation financière).
 * Extrait de AdminService pour respecter le Single Responsibility Principle.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type DriverPayout,
  DriverPayoutStatus,
  Prisma,
  UserRole,
  WalletTransactionType,
} from '@prisma/client';
import {
  PageQueryDto,
  resolvePageQuery,
} from '../../common/dto/page-query.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { DriverPayoutApprovalDto } from './dto/driver-payout-approval.dto';
import { DriverWalletRecoveryAdjustmentDto } from './dto/driver-wallet-recovery-adjustment.dto';
import { DriverPayoutSettlementQueryDto } from './dto/driver-payout-settlement-query.dto';
import { csvCell } from './admin-onboarding.helpers';

function normalizePayoutNote(payload?: DriverPayoutApprovalDto) {
  const note = payload?.notes?.trim();
  return note ? note : null;
}

function normalizeRequiredOpsNote(note: string | undefined) {
  const normalized = note?.trim();
  if (!normalized) {
    throw new BadRequestException('An operations note is required.');
  }
  return normalized;
}

function normalizeIdempotencyKey(key: string | undefined) {
  const normalized = key?.trim();
  if (!normalized) {
    throw new BadRequestException('An idempotency key is required.');
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

function isPrismaUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function buildSimplePdf(lines: string[]) {
  const body = lines.join('\n');
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n/Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n4 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj\nxref\ntrailer\n<< /Root 1 0 R >>\n%%EOF`,
    'utf-8',
  );
}

@Injectable()
export class AdminDriverPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async driverWallets(query: PageQueryDto = new PageQueryDto()) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const where: Prisma.WalletWhereInput = {
      user: {
        role: 'DRIVER',
      },
    };
    const [wallets, total, balanceAggregate, walletTransactions] =
      await Promise.all([
        this.prisma.wallet.findMany({
          skip,
          take,
          where,
          include: {
            user: {
              include: {
                driverProfile: true,
              },
            },
            transactions: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 5,
            },
            driverPayouts: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 5,
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
        }),
        this.prisma.wallet.count({
          where,
        }),
        this.prisma.wallet.aggregate({
          where,
          _sum: {
            balance: true,
          },
        }),
        this.prisma.walletTransaction.findMany({
          where: {
            wallet: where,
          },
          select: {
            walletId: true,
            type: true,
            amount: true,
            metadata: true,
          },
        }),
      ]);

    const transactionTotalsByWalletId = new Map<
      string,
      { payoutTotal: number; commissionTotal: number }
    >();
    let totalPayouts = 0;
    let totalCommission = 0;

    for (const transaction of walletTransactions) {
      const metadata =
        transaction.metadata &&
        !Array.isArray(transaction.metadata) &&
        typeof transaction.metadata === 'object'
          ? (transaction.metadata as Record<string, unknown>)
          : {};
      const commissionAmount = Number(metadata.commissionAmount ?? 0);
      const payoutAmount =
        transaction.type === WalletTransactionType.CREDIT
          ? Number(transaction.amount)
          : 0;
      const safeCommissionAmount = Number.isFinite(commissionAmount)
        ? commissionAmount
        : 0;
      const current = transactionTotalsByWalletId.get(transaction.walletId) ?? {
        payoutTotal: 0,
        commissionTotal: 0,
      };

      current.payoutTotal += payoutAmount;
      current.commissionTotal += safeCommissionAmount;
      transactionTotalsByWalletId.set(transaction.walletId, current);
      totalPayouts += payoutAmount;
      totalCommission += safeCommissionAmount;
    }

    let recoveryWalletCount = 0;
    let totalRecoveryDue = 0;
    const walletSummaries = wallets.map((wallet) => {
      const driverPayouts = wallet.driverPayouts ?? [];
      const totals = transactionTotalsByWalletId.get(wallet.id) ?? {
        payoutTotal: 0,
        commissionTotal: 0,
      };
      const balance = Number(wallet.balance);
      const recoveryDue = balance < 0 ? Math.abs(balance) : 0;

      if (recoveryDue > 0) {
        recoveryWalletCount += 1;
        totalRecoveryDue += recoveryDue;
      }

      const preparedPayout =
        driverPayouts.find(
          (payout) => payout.status === DriverPayoutStatus.PREPARED,
        ) ?? null;

      return {
        id: wallet.id,
        driverUserId: wallet.userId,
        driverName: wallet.user.fullName,
        driverStatus: wallet.user.driverProfile?.status ?? null,
        verificationStatus:
          wallet.user.driverProfile?.verificationStatus ?? null,
        currency: wallet.currency,
        balance,
        recoveryDue,
        isLocked: wallet.isLocked,
        payoutTotal: totals.payoutTotal,
        commissionTotal: totals.commissionTotal,
        lastActivityAt:
          wallet.transactions[0]?.createdAt.toISOString() ??
          wallet.updatedAt.toISOString(),
        preparedPayout: preparedPayout
          ? {
              id: preparedPayout.id,
              amount: Number(preparedPayout.amount),
              currency: preparedPayout.currency,
              status: preparedPayout.status,
              reference: preparedPayout.reference,
              notes: preparedPayout.notes ?? null,
              preparedAt: preparedPayout.preparedAt.toISOString(),
            }
          : null,
        recentPayouts: driverPayouts.map((payout) => ({
          id: payout.id,
          amount: Number(payout.amount),
          currency: payout.currency,
          status: payout.status,
          reference: payout.reference,
          notes: payout.notes ?? null,
          preparedAt: payout.preparedAt.toISOString(),
          paidAt: payout.paidAt?.toISOString() ?? null,
        })),
        recentTransactions: wallet.transactions.map((transaction) => {
          const metadata =
            transaction.metadata &&
            !Array.isArray(transaction.metadata) &&
            typeof transaction.metadata === 'object'
              ? (transaction.metadata as Record<string, unknown>)
              : {};

          return {
            id: transaction.id,
            type: transaction.type,
            amount: Number(transaction.amount),
            reference: transaction.reference,
            description: transaction.description,
            createdAt: transaction.createdAt.toISOString(),
            paymentAttemptId:
              typeof metadata.paymentAttemptId === 'string'
                ? metadata.paymentAttemptId
                : null,
            provider:
              typeof metadata.provider === 'string' ? metadata.provider : null,
            commissionAmount: Number(metadata.commissionAmount ?? 0),
          };
        }),
      };
    });

    return {
      summary: {
        walletCount: total,
        totalBalance: Number(balanceAggregate._sum.balance ?? 0),
        totalPayouts,
        totalCommission,
        recoveryWalletCount,
        totalRecoveryDue,
      },
      wallets: walletSummaries,
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }

  async prepareDriverWalletPayout(
    walletId: string,
    payload: DriverPayoutApprovalDto,
    auth: RequestAuthContext,
  ) {
    const notes = normalizePayoutNote(payload);
    const wallet = await this.prisma.wallet.findUnique({
      where: {
        id: walletId,
      },
      include: {
        user: {
          include: {
            driverProfile: true,
          },
        },
        driverPayouts: {
          where: {
            status: DriverPayoutStatus.PREPARED,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!wallet || wallet.user.role !== 'DRIVER') {
      throw new NotFoundException('Driver wallet not found.');
    }

    if (wallet.isLocked) {
      throw new BadRequestException('Driver wallet is locked.');
    }

    const balance = Number(wallet.balance);
    if (!Number.isFinite(balance) || balance <= 0) {
      throw new BadRequestException('Driver wallet has no payable balance.');
    }

    const existingPreparedPayout = wallet.driverPayouts[0] ?? null;
    if (existingPreparedPayout) {
      await this.prisma.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'DRIVER_PAYOUT_PREPARE_REUSED',
          entityType: 'DRIVER_PAYOUT',
          entityId: existingPreparedPayout.id,
          metadata: {
            walletId: wallet.id,
            driverUserId: wallet.userId,
            amount: Number(existingPreparedPayout.amount),
            currency: existingPreparedPayout.currency,
            reference: existingPreparedPayout.reference,
            result: 'existing_prepared_payout',
            notes,
          } satisfies Prisma.InputJsonObject,
        },
      });

      return {
        payout: this.serializeDriverPayout(existingPreparedPayout),
        action: 'existing_prepared_payout',
      };
    }

    let payout: DriverPayout;
    try {
      payout = await this.prisma.driverPayout.create({
        data: {
          walletId: wallet.id,
          amount: wallet.balance,
          currency: wallet.currency,
          reference: `driver-payout:${wallet.id}:${Date.now()}`,
          preparedLockKey: wallet.id,
          notes,
          preparedByUserId: auth.user.id,
          metadata: {
            driverUserId: wallet.userId,
            driverName: wallet.user.fullName,
            driverStatus: wallet.user.driverProfile?.status ?? null,
            sourceBalance: balance,
            approval: {
              preparedByUserId: auth.user.id,
              preparedByName: auth.user.fullName,
              notes,
            },
          } satisfies Prisma.InputJsonObject,
        },
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) {
        throw error;
      }

      const concurrentPayout = await this.prisma.driverPayout.findFirst({
        where: {
          walletId: wallet.id,
          status: DriverPayoutStatus.PREPARED,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!concurrentPayout) {
        throw error;
      }

      await this.prisma.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'DRIVER_PAYOUT_PREPARE_REUSED',
          entityType: 'DRIVER_PAYOUT',
          entityId: concurrentPayout.id,
          metadata: {
            walletId: wallet.id,
            driverUserId: wallet.userId,
            amount: Number(concurrentPayout.amount),
            currency: concurrentPayout.currency,
            reference: concurrentPayout.reference,
            result: 'existing_prepared_payout',
            notes,
          } satisfies Prisma.InputJsonObject,
        },
      });

      return {
        payout: this.serializeDriverPayout(concurrentPayout),
        action: 'existing_prepared_payout',
      };
    }

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_PAYOUT_PREPARED',
        entityType: 'DRIVER_PAYOUT',
        entityId: payout.id,
        metadata: {
          walletId: wallet.id,
          driverUserId: wallet.userId,
          amount: Number(payout.amount),
          currency: payout.currency,
          reference: payout.reference,
          notes,
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'driver-wallet.payout-prepared',
      entityId: payout.id,
      actorRole: auth.user.role,
      payload: {
        walletId: wallet.id,
        driverUserId: wallet.userId,
        amount: Number(payout.amount),
        currency: payout.currency,
        reference: payout.reference,
        notes,
      },
    });

    return {
      payout: this.serializeDriverPayout(payout),
      action: 'prepared',
    };
  }

  async recordDriverWalletRecoveryAdjustment(
    walletId: string,
    payload: DriverWalletRecoveryAdjustmentDto,
    auth: RequestAuthContext,
  ) {
    const notes = normalizeRequiredOpsNote(payload.notes);
    const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey);
    const amount = Number(payload.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Recovery adjustment amount must be positive.',
      );
    }

    const reference = `driver-wallet-recovery:${walletId}:${idempotencyKey}`;
    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: {
          id: walletId,
        },
        include: {
          user: true,
        },
      });

      if (!wallet || wallet.user.role !== UserRole.DRIVER) {
        throw new NotFoundException('Driver wallet not found.');
      }

      if (wallet.isLocked) {
        throw new BadRequestException('Driver wallet is locked.');
      }

      const currentBalance = Number(wallet.balance);
      if (currentBalance >= 0) {
        throw new BadRequestException('Driver wallet has no recovery due.');
      }

      const recoveryDue = Math.abs(currentBalance);
      const appliedAmount = Math.min(amount, recoveryDue);
      const existingTransaction = await tx.walletTransaction.findUnique({
        where: {
          walletId_reference: {
            walletId,
            reference,
          },
        },
      });

      if (existingTransaction) {
        return {
          action: 'already_recorded' as const,
          wallet,
          transaction: existingTransaction,
          appliedAmount: Number(existingTransaction.amount),
        };
      }

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId,
          type: WalletTransactionType.ADJUSTMENT,
          amount: new Prisma.Decimal(appliedAmount),
          reference,
          description: `Recouvrement wallet chauffeur ${wallet.user.fullName}`,
          metadata: {
            recovery: true,
            recoveryDueBefore: recoveryDue,
            requestedAmount: amount,
            appliedAmount,
            recordedByUserId: auth.user.id,
            recordedByName: auth.user.fullName,
            notes,
            idempotencyKey,
          } satisfies Prisma.InputJsonObject,
        },
      });

      const updatedWallet = await tx.wallet.update({
        where: {
          id: walletId,
        },
        data: {
          balance: {
            increment: new Prisma.Decimal(appliedAmount),
          },
        },
        include: {
          user: true,
        },
      });

      return {
        action: 'recorded' as const,
        wallet: updatedWallet,
        transaction,
        appliedAmount,
      };
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_WALLET_RECOVERY_ADJUSTMENT_RECORDED',
        entityType: 'WALLET',
        entityId: walletId,
        metadata: {
          action: result.action,
          amount: result.appliedAmount,
          currency: result.wallet.currency,
          reference,
          notes,
          idempotencyKey,
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'driver-wallet.recovery-adjusted',
      entityId: walletId,
      actorRole: auth.user.role,
      payload: {
        action: result.action,
        amount: result.appliedAmount,
        currency: result.wallet.currency,
        reference,
      },
    });

    const balance = Number(result.wallet.balance);

    return {
      action: result.action,
      wallet: {
        id: result.wallet.id,
        balance,
        currency: result.wallet.currency,
        recoveryDue: balance < 0 ? Math.abs(balance) : 0,
      },
      transaction: {
        id: result.transaction.id,
        type: result.transaction.type,
        amount: Number(result.transaction.amount),
        reference: result.transaction.reference,
        description: result.transaction.description,
        createdAt: result.transaction.createdAt.toISOString(),
      },
    };
  }

  async markDriverPayoutPaid(
    payoutId: string,
    payload: DriverPayoutApprovalDto,
    auth: RequestAuthContext,
  ) {
    const paidAt = new Date();
    const notes = normalizePayoutNote(payload);
    const result = await this.prisma.$transaction(async (tx) => {
      const payout = await tx.driverPayout.findUnique({
        where: {
          id: payoutId,
        },
        include: {
          wallet: true,
        },
      });

      if (!payout) {
        throw new NotFoundException('Driver payout not found.');
      }

      if (payout.status !== DriverPayoutStatus.PREPARED) {
        return {
          payout,
          action: 'already_finalized' as const,
        };
      }

      if (payout.wallet.isLocked) {
        throw new BadRequestException('Driver wallet is locked.');
      }

      const payoutAmount = Number(payout.amount);
      const walletBalance = Number(payout.wallet.balance);
      if (walletBalance < payoutAmount) {
        throw new BadRequestException('Driver wallet balance is insufficient.');
      }

      const transactionReference = `driver-payout:${payout.id}:paid`;
      const existingTransaction = await tx.walletTransaction.findUnique({
        where: {
          walletId_reference: {
            walletId: payout.walletId,
            reference: transactionReference,
          },
        },
      });
      let createdTransaction = false;

      if (!existingTransaction) {
        try {
          await tx.walletTransaction.create({
            data: {
              walletId: payout.walletId,
              type: WalletTransactionType.PAYOUT,
              amount: payout.amount,
              reference: transactionReference,
              description: `Payout chauffeur paye ${payout.reference}`,
              metadata: {
                driverPayoutId: payout.id,
                preparedReference: payout.reference,
                paidByUserId: auth.user.id,
                paidByName: auth.user.fullName,
                notes,
              } satisfies Prisma.InputJsonObject,
            },
          });
          createdTransaction = true;
        } catch (error) {
          if (!isPrismaUniqueConstraintError(error)) {
            throw error;
          }
        }
      }

      if (createdTransaction) {
        await tx.wallet.update({
          where: {
            id: payout.walletId,
          },
          data: {
            balance: {
              decrement: payout.amount,
            },
          },
        });
      }

      const updatedPayout = await tx.driverPayout.update({
        where: {
          id: payout.id,
        },
        data: {
          status: DriverPayoutStatus.PAID,
          paidByUserId: auth.user.id,
          paidAt,
          preparedLockKey: null,
          notes: notes ?? payout.notes,
        },
      });

      return {
        payout: updatedPayout,
        action:
          existingTransaction || !createdTransaction ? 'already_paid' : 'paid',
      };
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_PAYOUT_PAID',
        entityType: 'DRIVER_PAYOUT',
        entityId: payoutId,
        metadata: {
          walletId: result.payout.walletId,
          amount: Number(result.payout.amount),
          currency: result.payout.currency,
          reference: result.payout.reference,
          result: result.action,
          notes,
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'driver-wallet.payout-paid',
      entityId: payoutId,
      actorRole: auth.user.role,
      payload: {
        walletId: result.payout.walletId,
        amount: Number(result.payout.amount),
        currency: result.payout.currency,
        reference: result.payout.reference,
        result: result.action,
        notes,
      },
    });

    return {
      payout: this.serializeDriverPayout(result.payout),
      action: result.action,
    };
  }

  async driverPayoutSettlementCsv(
    query: DriverPayoutSettlementQueryDto,
    auth: RequestAuthContext,
  ) {
    const settlement = await this.buildDriverPayoutSettlement(
      query,
      auth,
      'csv',
    );
    const headers = [
      'payout_id',
      'wallet_id',
      'driver_user_id',
      'driver_name',
      'amount',
      'currency',
      'status',
      'reference',
      'prepared_at',
      'prepared_by',
      'paid_at',
      'paid_by',
      'approval_notes',
      'approval_signature',
    ];
    const rows = settlement.payouts.map((payout) => [
      payout.id,
      payout.walletId,
      payout.wallet.userId,
      payout.wallet.user.fullName,
      Number(payout.amount),
      payout.currency,
      payout.status,
      payout.reference,
      payout.preparedAt.toISOString(),
      payout.preparedBy.fullName,
      payout.paidAt?.toISOString() ?? '',
      payout.paidBy?.fullName ?? '',
      payout.notes ?? '',
      this.driverPayoutApprovalSignature(payout),
    ]);

    return [
      headers.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n');
  }

  async driverPayoutSettlementPdf(
    query: DriverPayoutSettlementQueryDto,
    auth: RequestAuthContext,
  ) {
    const settlement = await this.buildDriverPayoutSettlement(
      query,
      auth,
      'pdf',
    );
    const lines = [
      'Orbi - Settlement payouts chauffeurs',
      `Genere le: ${settlement.generatedAt.toISOString()}`,
      `Statut: ${settlement.status}`,
      `Exporte par: ${auth.user.fullName} (${auth.user.role})`,
      `Payouts: ${settlement.payouts.length}`,
      `Montant total: ${settlement.totalAmount} XOF`,
      '',
      'ID | Chauffeur | Montant | Statut | Reference | Signature',
      ...settlement.payouts
        .slice(0, 40)
        .map((payout) =>
          [
            payout.id,
            payout.wallet.user.fullName,
            `${Number(payout.amount)} ${payout.currency}`,
            payout.status,
            payout.reference,
            this.driverPayoutApprovalSignature(payout),
          ].join(' | '),
        ),
    ];

    return buildSimplePdf(lines);
  }

  private serializeDriverPayout(payout: {
    id: string;
    walletId: string;
    amount: Prisma.Decimal | number;
    currency: string;
    status: DriverPayoutStatus;
    reference: string;
    notes?: string | null;
    preparedAt: Date;
    paidAt: Date | null;
  }) {
    return {
      id: payout.id,
      walletId: payout.walletId,
      amount: Number(payout.amount),
      currency: payout.currency,
      status: payout.status,
      reference: payout.reference,
      notes: payout.notes ?? null,
      preparedAt: payout.preparedAt.toISOString(),
      paidAt: payout.paidAt?.toISOString() ?? null,
    };
  }

  private async buildDriverPayoutSettlement(
    query: DriverPayoutSettlementQueryDto,
    auth: RequestAuthContext,
    format: 'csv' | 'pdf',
  ) {
    const status = query.status ?? DriverPayoutStatus.PREPARED;
    const payouts = await this.prisma.driverPayout.findMany({
      where: {
        status,
      },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
        preparedBy: true,
        paidBy: true,
      },
      orderBy: {
        preparedAt: 'asc',
      },
      take: 200,
    });
    const totalAmount = payouts.reduce(
      (total, payout) => total + Number(payout.amount),
      0,
    );

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_PAYOUT_SETTLEMENT_EXPORTED',
        entityType: 'DRIVER_PAYOUT',
        entityId: status,
        metadata: {
          format,
          status,
          payoutCount: payouts.length,
          totalAmount,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return {
      generatedAt: new Date(),
      status,
      totalAmount,
      payouts,
    };
  }

  private driverPayoutApprovalSignature(payout: {
    preparedByUserId: string;
    paidByUserId: string | null;
    preparedBy: { fullName: string };
    paidBy: { fullName: string } | null;
  }) {
    const prepared = `prepared:${payout.preparedBy.fullName}:${payout.preparedByUserId}`;
    const paid = payout.paidBy
      ? `paid:${payout.paidBy.fullName}:${payout.paidByUserId}`
      : 'paid:pending';

    return `${prepared}; ${paid}`;
  }
}
