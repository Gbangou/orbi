import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
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

    const correspondent =
      PAWAPAY_NETWORK_TO_CORRESPONDENT[mobileMoneyNetwork.toUpperCase()] as
        | PawaPayCorrespondent
        | undefined;

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

    const depositId = randomUUID();
    const topUp = await this.prisma.walletTopUp.create({
      data: {
        walletId: wallet.id,
        userId: auth.user.id,
        amount: new Prisma.Decimal(amountXof),
        currency: 'XOF',
        status: 'INITIATED',
        depositId,
        mobileMoneyNetwork: correspondent,
        customerPhoneNumber: phoneDigits,
      },
    });

    if (this.pawaPayService) {
      try {
        const response = await this.pawaPayService.initiateDeposit({
          depositId,
          amount: String(Math.round(amountXof)),
          currency: 'XOF',
          correspondent,
          payer: { type: 'MSISDN', address: { value: phoneDigits } },
          customerTimestamp: new Date().toISOString(),
          statementDescription: `Recharge Wallet Orbi ${Math.round(amountXof)} XOF`,
          metadata: [
            { fieldName: 'walletTopUpId', fieldValue: topUp.id },
            { fieldName: 'userId', fieldValue: auth.user.id },
          ],
        });

        if (
          response.status === 'ACCEPTED' ||
          response.status === 'DUPLICATE_IGNORED'
        ) {
          await this.prisma.walletTopUp.update({
            where: { id: topUp.id },
            data: { status: 'PENDING' },
          });
        } else {
          const failCode = response.failureReason?.failureCode ?? 'UNKNOWN';
          await this.prisma.walletTopUp.update({
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
      this.logger.warn('PawaPayService not configured — sandbox top-up initiated.');
      await this.prisma.walletTopUp.update({
        where: { id: topUp.id },
        data: { status: 'PENDING' },
      });
    }

    return {
      topUpId: topUp.id,
      depositId,
      amount: amountXof,
      currency: 'XOF',
      status: 'PENDING',
      awaitingPhoneConfirmation: true,
      message: 'Vérifiez votre téléphone pour confirmer le rechargement.',
    };
  }

  async handlePawaPayTopUpWebhook(depositId: string, status: 'COMPLETED' | 'FAILED') {
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
            metadata: { topUpId: topUp.id, depositId: topUp.depositId } satisfies Prisma.InputJsonObject,
          },
        });
      });

      return { handled: true, action: 'wallet_credited', amount: Number(topUp.amount) };
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
}
