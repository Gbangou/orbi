/**
 * AdminPromoCodesService
 *
 * Responsabilité unique: gestion du cycle de vie des codes promo.
 * Extraite de AdminService pour respecter le principe de responsabilité unique.
 * Chaque méthode effectue sa propre validation, mutation DB et audit log.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { parseStrictPromoCodeDate } from './admin-promo-code-dates';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';

export type AdminPromoCodesResponse = {
  promoCodes: Array<{
    id: string;
    code: string;
    description: string | null;
    discountBps: number;
    maxUses: number | null;
    usedCount: number;
    validFrom: string;
    validTo: string;
    firstTripOnly: boolean;
    active: boolean;
    createdAt: string;
  }>;
};

@Injectable()
export class AdminPromoCodesService {
  constructor(private readonly prisma: PrismaService) {}

  async listPromoCodes(): Promise<AdminPromoCodesResponse> {
    const codes = await this.prisma.promoCode.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      promoCodes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        description: c.description,
        discountBps: c.discountBps,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        validFrom: c.validFrom.toISOString(),
        validTo: c.validTo.toISOString(),
        firstTripOnly: c.firstTripOnly,
        active: c.active,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  async createPromoCode(dto: CreatePromoCodeDto, auth: RequestAuthContext) {
    const normalizedCode = dto.code.toUpperCase().trim();
    const validFrom = parseStrictPromoCodeDate(dto.validFrom);
    const validTo = parseStrictPromoCodeDate(dto.validTo);

    if (!validFrom || !validTo) {
      throw new BadRequestException(
        'validFrom and validTo must be real UTC ISO instants.',
      );
    }

    if (validTo <= validFrom) {
      throw new BadRequestException('validTo must be after validFrom.');
    }

    const existing = await this.prisma.promoCode.findUnique({
      where: { code: normalizedCode },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `Promo code "${normalizedCode}" already exists.`,
      );
    }

    const created = await this.prisma.promoCode.create({
      data: {
        code: normalizedCode,
        description: dto.description?.trim() ?? null,
        discountBps: dto.discountBps,
        maxUses: dto.maxUses ?? null,
        validFrom,
        validTo,
        firstTripOnly: dto.firstTripOnly ?? true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'PROMO_CODE_CREATED',
        entityType: 'PROMO_CODE',
        entityId: created.id,
        metadata: {
          code: normalizedCode,
          discountBps: dto.discountBps,
          maxUses: dto.maxUses ?? null,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return {
      promoCode: {
        id: created.id,
        code: created.code,
        discountBps: created.discountBps,
        validFrom: created.validFrom.toISOString(),
        validTo: created.validTo.toISOString(),
        active: created.active,
      },
    };
  }

  async deactivatePromoCode(promoCodeId: string, auth: RequestAuthContext) {
    const code = await this.prisma.promoCode.findUnique({
      where: { id: promoCodeId },
      select: { id: true, code: true, active: true },
    });

    if (!code) {
      throw new NotFoundException('Promo code not found.');
    }

    if (!code.active) {
      throw new BadRequestException('Promo code is already inactive.');
    }

    await this.prisma.promoCode.update({
      where: { id: promoCodeId },
      data: { active: false },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'PROMO_CODE_DEACTIVATED',
        entityType: 'PROMO_CODE',
        entityId: promoCodeId,
        metadata: { code: code.code } satisfies Prisma.InputJsonObject,
      },
    });

    return { promoCodeId, active: false };
  }
}
