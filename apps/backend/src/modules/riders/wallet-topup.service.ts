import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { RequestAuthContext } from '../auth/auth.types';
import {
  PawaPayService,
  type PawaPayCorrespondent,
} from '../payments/pawapay.service';
import { PAWAPAY_NETWORK_TO_CORRESPONDENT } from '../payments/payments.constants';

const MIN_TOPUP_XOF = 500;
const MAX_TOPUP_XOF = 100_000;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{8,128}$/;

export type InitiateWalletTopUpInput = {
  amountXof: number;
  mobileMoneyNetwork: string;
  customerPhoneNumber: string;
};

@Injectable()
export class WalletTopUpService {
  private readonly logger = new Logger(WalletTopUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly pawaPayService?: PawaPayService,
  ) {}

  async initiateTopUp(
    auth: RequestAuthContext,
    input: InitiateWalletTopUpInput,
    idempotencyKey?: string,
  ) {
    const { amountXof, mobileMoneyNetwork, customerPhoneNumber } = input;

    if (
      !Number.isFinite(amountXof) ||
      amountXof < MIN_TOPUP_XOF ||
      amountXof > MAX_TOPUP_XOF
    ) {
      throw new BadRequestException(
        `Le montant doit être entre ${MIN_TOPUP_XOF} et ${MAX_TOPUP_XOF} XOF.`,
      );
    }

    const correspondent = PAWAPAY_NETWORK_TO_CORRESPONDENT[
      mobileMoneyNetwork.toUpperCase()
    ] as PawaPayCorrespondent | undefined;

    if (!correspondent) {
      throw new BadRequestException(
        `Réseau mobile non supporté : ${mobileMoneyNetwork}. Utilisez ORANGE_BFA ou MOOV_BFA.`,
      );
    }

    const phoneDigits = customerPhoneNumber.replace(/\D/g, '');
    if (!phoneDigits || phoneDigits.length < 8) {
      throw new BadRequestException(
        'Numéro de téléphone invalide pour Mobile Money.',
      );
    }

    // Resolve or create rider wallet
    const wallet = await this.resolveRiderWallet(auth.user.id);

    const normalizedIdempotencyKey =
      this.normalizeIdempotencyKey(idempotencyKey);
    const idempotencyHash = normalizedIdempotencyKey
      ? this.buildTopUpIdempotencyHash({
          userId: auth.user.id,
          amountXof,
          correspondent,
          phoneDigits,
        })
      : null;
    const depositId = normalizedIdempotencyKey
      ? this.buildDeterministicDepositId(auth.user.id, normalizedIdempotencyKey)
      : randomUUID();
    const existingTopUp = normalizedIdempotencyKey
      ? await this.prisma.walletTopUp.findUnique({
          where: { depositId },
        })
      : null;

    if (existingTopUp) {
      if (
        jsonObject(existingTopUp.providerMetadata).idempotencyHash !==
        idempotencyHash
      ) {
        throw new BadRequestException(
          'The provided idempotency key was already used with a different wallet top-up payload.',
        );
      }

      return this.serializeTopUp(existingTopUp);
    }

    let topUp;
    try {
      topUp = await this.prisma.walletTopUp.create({
        data: {
          walletId: wallet.id,
          userId: auth.user.id,
          amount: new Prisma.Decimal(amountXof),
          currency: 'XOF',
          status: 'INITIATED',
          depositId,
          mobileMoneyNetwork: correspondent,
          customerPhoneNumber: phoneDigits,
          providerMetadata: normalizedIdempotencyKey
            ? {
                idempotencyKey: normalizedIdempotencyKey,
                idempotencyHash,
              }
            : undefined,
        },
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error) || !normalizedIdempotencyKey) {
        throw error;
      }

      const concurrentTopUp = await this.prisma.walletTopUp.findUnique({
        where: { depositId },
      });
      if (
        !concurrentTopUp ||
        jsonObject(concurrentTopUp.providerMetadata).idempotencyHash !==
          idempotencyHash
      ) {
        throw error;
      }

      return this.serializeTopUp(concurrentTopUp);
    }

    if (this.pawaPayService?.isConfigured()) {
      try {
        const response = await this.pawaPayService.initiateDeposit({
          depositId,
          amount: String(Math.round(amountXof)),
          currency: 'XOF',
          correspondent,
          payer: { type: 'MSISDN', address: { value: phoneDigits } },
          customerTimestamp: new Date().toISOString(),
          statementDescription: `Recharge Wallet Orbi ${Math.round(amountXof)} XOF`,
          clientReferenceId: topUp.id,
          metadata: [
            { fieldName: 'walletTopUpId', fieldValue: topUp.id },
            { fieldName: 'userId', fieldValue: auth.user.id },
          ],
        });

        if (
          response.status === 'ACCEPTED' ||
          response.status === 'DUPLICATE_IGNORED'
        ) {
          topUp = await this.prisma.walletTopUp.update({
            where: { id: topUp.id },
            data: { status: 'PENDING' },
          });
        } else {
          const failCode = response.failureReason?.failureCode ?? 'UNKNOWN';
          topUp = await this.prisma.walletTopUp.update({
            where: { id: topUp.id },
            data: { status: 'FAILED', failureReason: failCode },
          });
          throw new BadRequestException(
            `Dépôt PawaPay rejeté : ${failCode}. Vérifiez votre numéro.`,
          );
        }
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        this.logger.error(`PawaPay top-up error: ${String(error)}`);
        throw new BadRequestException(
          'Impossible de contacter le service de paiement. Réessayez.',
        );
      }
    } else {
      this.logger.warn(
        'PawaPay API token is not configured — sandbox top-up remains pending.',
      );
      topUp = await this.prisma.walletTopUp.update({
        where: { id: topUp.id },
        data: { status: 'PENDING' },
      });
    }

    return this.serializeTopUp(topUp);
  }

  async handlePawaPayTopUpWebhook(
    depositId: string,
    status: 'COMPLETED' | 'FAILED',
  ) {
    const topUp = await this.prisma.walletTopUp.findUnique({
      where: { depositId },
      include: { wallet: true },
    });

    if (!topUp || topUp.status === 'COMPLETED' || topUp.status === 'FAILED') {
      return { handled: false, reason: topUp ? 'already_final' : 'not_found' };
    }

    if (status === 'COMPLETED') {
      await this.prisma.$transaction(async (tx) => {
        await tx.walletTopUp.update({
          where: { id: topUp.id },
          data: { status: 'COMPLETED' },
        });
        await tx.wallet.update({
          where: { id: topUp.walletId },
          data: { balance: { increment: topUp.amount } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: topUp.walletId,
            type: 'CREDIT',
            amount: topUp.amount,
            reference: topUp.depositId ?? topUp.id,
            description: `Recharge Mobile Money ${Number(topUp.amount).toLocaleString('fr-BF')} XOF`,
            metadata: {
              topUpId: topUp.id,
              depositId: topUp.depositId,
            } satisfies Prisma.InputJsonObject,
          },
        });
      });

      return {
        handled: true,
        action: 'wallet_credited',
        amount: Number(topUp.amount),
      };
    }

    await this.prisma.walletTopUp.update({
      where: { id: topUp.id },
      data: { status: 'FAILED', failureReason: 'PawaPay deposit failed' },
    });

    return { handled: true, action: 'top_up_failed' };
  }

  async getWalletBalance(auth: RequestAuthContext) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { userId: auth.user.id, currency: 'XOF' },
      select: {
        id: true,
        balance: true,
        currency: true,
        isLocked: true,
        updatedAt: true,
      },
    });

    return {
      balance: wallet ? Number(wallet.balance) : 0,
      currency: 'XOF',
      isLocked: wallet?.isLocked ?? false,
      lastUpdatedAt: wallet?.updatedAt?.toISOString() ?? null,
    };
  }

  async getTopUpHistory(auth: RequestAuthContext) {
    const topUps = await this.prisma.walletTopUp.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        mobileMoneyNetwork: true,
        createdAt: true,
        failureReason: true,
      },
    });

    return topUps.map((tu) => ({
      id: tu.id,
      amount: Number(tu.amount),
      currency: tu.currency,
      status: tu.status,
      network: tu.mobileMoneyNetwork,
      createdAt: tu.createdAt.toISOString(),
      failureReason: tu.failureReason ?? null,
    }));
  }

  private async resolveRiderWallet(userId: string) {
    const existing = await this.prisma.wallet.findFirst({
      where: { userId, currency: 'XOF' },
    });
    if (existing) return existing;

    return this.prisma.wallet.create({
      data: {
        userId,
        currency: 'XOF',
        balance: new Prisma.Decimal(0),
      },
    });
  }

  private normalizeIdempotencyKey(idempotencyKey?: string) {
    const normalized = idempotencyKey?.trim();
    if (!normalized) {
      return null;
    }

    if (!idempotencyKeyPattern.test(normalized)) {
      throw new BadRequestException(
        'Idempotency-Key must be 8 to 128 URL-safe characters.',
      );
    }

    return normalized;
  }

  private buildTopUpIdempotencyHash(input: {
    userId: string;
    amountXof: number;
    correspondent: PawaPayCorrespondent;
    phoneDigits: string;
  }) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          userId: input.userId,
          amountXof: Math.round(input.amountXof),
          correspondent: input.correspondent,
          phoneDigits: input.phoneDigits,
        }),
      )
      .digest('hex');
  }

  private buildDeterministicDepositId(userId: string, idempotencyKey: string) {
    const hex = createHash('sha256')
      .update(`wallet-topup:${userId}:${idempotencyKey}`)
      .digest('hex');
    const variantNibble = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(
      16,
    );

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      `4${hex.slice(13, 16)}`,
      `${variantNibble}${hex.slice(17, 20)}`,
      hex.slice(20, 32),
    ].join('-');
  }

  private serializeTopUp(topUp: {
    id: string;
    depositId: string | null;
    amount: Prisma.Decimal | number;
    currency: string;
    status: string;
  }) {
    const isFinal = topUp.status === 'COMPLETED' || topUp.status === 'FAILED';

    return {
      topUpId: topUp.id,
      depositId: topUp.depositId ?? topUp.id,
      amount: Number(topUp.amount),
      currency: topUp.currency,
      status: topUp.status,
      awaitingPhoneConfirmation: !isFinal,
      message: isFinal
        ? topUp.status === 'COMPLETED'
          ? 'Votre wallet a ete credite.'
          : 'Le rechargement a echoue.'
        : 'Vérifiez votre téléphone pour confirmer le rechargement.',
    };
  }
}

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
