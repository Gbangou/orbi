/**
 * ScheduledRidesService — Courses programmées
 *
 * Permet aux passagers de réserver jusqu'à 7 jours à l'avance.
 * Le dispatch démarre automatiquement 15 minutes avant l'heure prévue
 * via le job queue.
 *
 * Règles métier:
 *   - Min 30 min à l'avance (éviter les confusions avec courses immédiates)
 *   - Max 7 jours à l'avance
 *   - 1 seule course programmée active par passager
 *   - Annulation gratuite jusqu'à 10 min avant l'heure prévue
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ScheduledRideStatus } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { JobQueueService } from '../../common/job-queue/job-queue.service';
import type { RequestAuthContext } from '../auth/auth.types';

const MIN_ADVANCE_MINUTES = 30;
const MAX_ADVANCE_DAYS = 7;
const FREE_CANCEL_BUFFER_MINUTES = 10;

export type CreateScheduledRideDto = {
  pickupAddress: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  destinationAddress: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  scheduledFor: string; // ISO 8601
  vehicleType?: 'MOTORCYCLE' | 'CAR';
  paymentMethod?: 'MOBILE_MONEY' | 'CASH' | 'WALLET';
  city?: string;
  notes?: string;
  promoCode?: string;
};

/** Fenêtre de dispatch: 15 min avant l'heure prévue */
const DISPATCH_LEAD_MINUTES = 15;

@Injectable()
export class ScheduledRidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobQueueService: JobQueueService,
  ) {}

  async createScheduledRide(auth: RequestAuthContext, dto: CreateScheduledRideDto) {
    const riderProfile = await this.prisma.riderProfile.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });

    if (!riderProfile) {
      throw new NotFoundException('Rider profile not found.');
    }

    const scheduledFor = new Date(dto.scheduledFor);

    if (isNaN(scheduledFor.getTime())) {
      throw new BadRequestException('scheduledFor must be a valid ISO 8601 date.');
    }

    const now = new Date();
    const minutesUntil = (scheduledFor.getTime() - now.getTime()) / 60_000;
    const daysUntil = minutesUntil / 60 / 24;

    if (minutesUntil < MIN_ADVANCE_MINUTES) {
      throw new BadRequestException(
        `La course doit être programmée au moins ${MIN_ADVANCE_MINUTES} minutes à l'avance.`,
      );
    }

    if (daysUntil > MAX_ADVANCE_DAYS) {
      throw new BadRequestException(
        `Impossible de programmer une course plus de ${MAX_ADVANCE_DAYS} jours à l'avance.`,
      );
    }

    // 1 seule course active par passager
    const existing = await this.prisma.scheduledRide.findFirst({
      where: {
        riderId: riderProfile.id,
        status: { in: ['PENDING', 'DISPATCHING', 'MATCHED'] },
      },
      select: { id: true, scheduledFor: true },
    });

    if (existing) {
      throw new BadRequestException(
        `Vous avez déjà une course programmée (${existing.scheduledFor.toLocaleString('fr-BF')}). Annulez-la avant d'en créer une nouvelle.`,
      );
    }

    const ride = await this.prisma.scheduledRide.create({
      data: {
        riderId: riderProfile.id,
        pickupAddress: dto.pickupAddress.trim(),
        pickupLatitude: dto.pickupLatitude ?? null,
        pickupLongitude: dto.pickupLongitude ?? null,
        destinationAddress: dto.destinationAddress.trim(),
        destinationLatitude: dto.destinationLatitude ?? null,
        destinationLongitude: dto.destinationLongitude ?? null,
        scheduledFor,
        vehicleType: dto.vehicleType ?? 'MOTORCYCLE',
        paymentMethod: dto.paymentMethod ?? 'MOBILE_MONEY',
        city: dto.city ?? 'OUAGADOUGOU',
        notes: dto.notes?.trim() ?? null,
        promoCode: dto.promoCode?.toUpperCase().trim() ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'SCHEDULED_RIDE_CREATED',
        entityType: 'SCHEDULED_RIDE',
        entityId: ride.id,
        metadata: {
          scheduledFor: scheduledFor.toISOString(),
          vehicleType: ride.vehicleType,
          city: ride.city,
        },
      },
    });

    // Enfile le job de dispatch 15 min avant l'heure prévue
    const dispatchAt = new Date(scheduledFor.getTime() - DISPATCH_LEAD_MINUTES * 60_000);
    if (dispatchAt > new Date()) {
      await this.jobQueueService.enqueue({
        kind: 'SCHEDULED_RIDE_DISPATCH',
        dedupeKey: `scheduled-ride-dispatch:${ride.id}`,
        entityType: 'SCHEDULED_RIDE',
        entityId: ride.id,
        nextRunAt: dispatchAt,
        payload: { scheduledRideId: ride.id },
      });
    }

    return this.serializeRide(ride);
  }

  /**
   * Déclenché par le job queue worker 15 min avant l'heure prévue.
   * Passe la course en DISPATCHING pour que le dispatch engine prenne le relais.
   */
  async triggerDispatch(scheduledRideId: string): Promise<void> {
    const ride = await this.prisma.scheduledRide.findUnique({
      where: { id: scheduledRideId },
      select: { id: true, status: true, scheduledFor: true, riderId: true },
    });

    if (!ride || ride.status !== 'PENDING') {
      return; // Déjà traitée ou annulée
    }

    // Vérifier que c'est bien l'heure de dispatcher
    const now = new Date();
    const minutesUntil = (ride.scheduledFor.getTime() - now.getTime()) / 60_000;

    if (minutesUntil > DISPATCH_LEAD_MINUTES + 2) {
      throw new Error(`Too early to dispatch — ${minutesUntil.toFixed(1)} min remaining`);
    }

    await this.prisma.scheduledRide.update({
      where: { id: scheduledRideId },
      data: {
        status: ScheduledRideStatus.DISPATCHING,
        dispatchStartedAt: now,
      },
    });

    const riderProfile = await this.prisma.riderProfile.findUnique({
      where: { id: ride.riderId },
      select: { userId: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: riderProfile?.userId ?? ride.riderId,
        action: 'SCHEDULED_RIDE_DISPATCH_STARTED',
        entityType: 'SCHEDULED_RIDE',
        entityId: scheduledRideId,
        metadata: {
          scheduledFor: ride.scheduledFor.toISOString(),
          dispatchedAt: now.toISOString(),
        },
      },
    });
  }

  async listMyScheduledRides(auth: RequestAuthContext) {
    const riderProfile = await this.prisma.riderProfile.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });

    if (!riderProfile) {
      return { rides: [] };
    }

    const rides = await this.prisma.scheduledRide.findMany({
      where: {
        riderId: riderProfile.id,
        scheduledFor: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // dernières 24h
      },
      orderBy: { scheduledFor: 'asc' },
      take: 20,
    });

    return { rides: rides.map((r) => this.serializeRide(r)) };
  }

  async cancelScheduledRide(
    auth: RequestAuthContext,
    scheduledRideId: string,
    reason?: string,
  ) {
    const riderProfile = await this.prisma.riderProfile.findUnique({
      where: { userId: auth.user.id },
      select: { id: true },
    });

    if (!riderProfile) {
      throw new NotFoundException('Rider profile not found.');
    }

    const ride = await this.prisma.scheduledRide.findUnique({
      where: { id: scheduledRideId },
    });

    if (!ride) {
      throw new NotFoundException('Scheduled ride not found.');
    }

    if (ride.riderId !== riderProfile.id) {
      throw new ForbiddenException('This scheduled ride does not belong to you.');
    }

    if (ride.status === 'CANCELLED' || ride.status === 'COMPLETED') {
      throw new BadRequestException(`La course est déjà ${ride.status === 'CANCELLED' ? 'annulée' : 'terminée'}.`);
    }

    // Vérifier fenêtre d'annulation gratuite
    const minutesUntil = (ride.scheduledFor.getTime() - Date.now()) / 60_000;

    if (minutesUntil < FREE_CANCEL_BUFFER_MINUTES && ride.status === 'DISPATCHING') {
      throw new BadRequestException(
        `Impossible d'annuler moins de ${FREE_CANCEL_BUFFER_MINUTES} minutes avant la course quand le dispatch est en cours.`,
      );
    }

    const updated = await this.prisma.scheduledRide.update({
      where: { id: scheduledRideId },
      data: {
        status: ScheduledRideStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason?.trim() ?? 'Annulée par le passager',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'SCHEDULED_RIDE_CANCELLED',
        entityType: 'SCHEDULED_RIDE',
        entityId: scheduledRideId,
        metadata: { reason: reason ?? null, scheduledFor: ride.scheduledFor.toISOString() },
      },
    });

    return this.serializeRide(updated);
  }

  private serializeRide(ride: {
    id: string;
    pickupAddress: string;
    destinationAddress: string;
    scheduledFor: Date;
    vehicleType: string;
    paymentMethod: string;
    city: string;
    status: ScheduledRideStatus;
    estimatedFare: number | null;
    notes: string | null;
    promoCode: string | null;
    cancelledAt: Date | null;
    cancellationReason: string | null;
    createdAt: Date;
  }) {
    const minutesUntil = (ride.scheduledFor.getTime() - Date.now()) / 60_000;

    return {
      id: ride.id,
      pickupAddress: ride.pickupAddress,
      destinationAddress: ride.destinationAddress,
      scheduledFor: ride.scheduledFor.toISOString(),
      vehicleType: ride.vehicleType,
      paymentMethod: ride.paymentMethod,
      city: ride.city,
      status: ride.status,
      estimatedFare: ride.estimatedFare,
      notes: ride.notes,
      promoCode: ride.promoCode,
      cancelledAt: ride.cancelledAt?.toISOString() ?? null,
      cancellationReason: ride.cancellationReason,
      createdAt: ride.createdAt.toISOString(),
      canCancel: !['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(ride.status) && minutesUntil > 10,
      minutesUntilPickup: Math.round(minutesUntil),
    };
  }
}
