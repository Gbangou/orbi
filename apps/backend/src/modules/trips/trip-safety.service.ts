import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, NotificationChannel, Prisma } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { ACTIVE_TRIP_STATUSES } from './trips.constants';

const tripShareLinkTtlMinutes = 120;

function hashShareToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

type TripWithParticipants = {
  id: string;
  riderId: string;
  driverId: string | null;
  rider: { userId: string };
  driver: { userId: string } | null;
};

@Injectable()
export class TripSafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async reportIncident(
    auth: RequestAuthContext,
    tripId: string,
    payload: {
      incidentType: string;
      details?: string;
      priority?: number;
      evidenceConsent?: boolean;
      evidenceType?: 'AUDIO' | 'PHOTO' | 'VIDEO' | 'TEXT_NOTE';
      evidenceRetentionHours?: number;
    },
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { rider: true, driver: true },
    });

    if (!trip) throw new NotFoundException('Trip not found.');
    this.assertTripAccess(auth, trip);

    const incidentPriority = payload.priority ?? 2;
    const reportedAt = new Date();

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        events: {
          create: {
            eventType: 'INCIDENT_REPORTED',
            payload: {
              incidentType: payload.incidentType,
              details: payload.details ?? null,
              priority: incidentPriority,
              evidenceConsent: payload.evidenceConsent ?? false,
              evidenceType: payload.evidenceType ?? null,
              evidenceRetentionHours: payload.evidenceRetentionHours ?? 24,
              reportedByRole: auth.user.role,
              reportedByUserId: auth.user.id,
              reportedAt: reportedAt.toISOString(),
            } satisfies Prisma.InputJsonObject,
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'TRIP_INCIDENT_REPORTED',
        entityType: 'TRIP',
        entityId: tripId,
        metadata: {
          incidentType: payload.incidentType,
          priority: incidentPriority,
          role: auth.user.role,
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'trip',
      type: 'trip.incident-reported',
      entityId: tripId,
      riderId: trip.riderId,
      driverId: trip.driverId,
      actorRole: auth.user.role,
      payload: {
        incidentType: payload.incidentType,
        priority: incidentPriority,
        reportedAt: reportedAt.toISOString(),
      },
    });

    // Notify ops when high priority
    if (incidentPriority >= 3) {
      void this.notificationsService.enqueue({
        userId: auth.user.id,
        title: 'Incident signalé',
        body: `Incident ${payload.incidentType} sur le trajet ${tripId.slice(-6).toUpperCase()} — priorité ${incidentPriority}`,
        channel: NotificationChannel.PUSH,
        dedupeKey: `incident:${tripId}:${payload.incidentType}:${Date.now()}`,
        data: { type: 'trip_incident', tripId, incidentType: payload.incidentType },
      });
    }

    return {
      reported: true,
      tripId,
      incidentType: payload.incidentType,
      priority: incidentPriority,
      reportedAt: reportedAt.toISOString(),
    };
  }

  async triggerSafetySos(
    auth: RequestAuthContext,
    tripId: string,
    payload: {
      details?: string;
      latitude?: number;
      longitude?: number;
      accuracyMeters?: number;
    },
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { rider: true, driver: true },
    });

    if (!trip) throw new NotFoundException('Trip not found.');
    this.assertTripAccess(auth, trip);

    if (!ACTIVE_TRIP_STATUSES.includes(trip.status)) {
      throw new BadRequestException(
        'SOS can only be triggered during an active trip.',
      );
    }

    const triggeredAt = new Date();

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        events: {
          create: {
            eventType: 'SOS_TRIGGERED',
            payload: {
              details: payload.details ?? null,
              latitude: payload.latitude ?? null,
              longitude: payload.longitude ?? null,
              accuracyMeters: payload.accuracyMeters ?? null,
              triggeredByRole: auth.user.role,
              triggeredByUserId: auth.user.id,
              triggeredAt: triggeredAt.toISOString(),
            } satisfies Prisma.InputJsonObject,
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'TRIP_SOS_TRIGGERED',
        entityType: 'TRIP',
        entityId: tripId,
        metadata: {
          role: auth.user.role,
          latitude: payload.latitude ?? null,
          longitude: payload.longitude ?? null,
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'trip',
      type: 'trip.sos-triggered',
      entityId: tripId,
      riderId: trip.riderId,
      driverId: trip.driverId,
      actorRole: auth.user.role,
      payload: {
        latitude: payload.latitude,
        longitude: payload.longitude,
        triggeredAt: triggeredAt.toISOString(),
      },
    });

    // Urgency notification to both participants
    const notifyUserId =
      auth.user.role === UserRole.RIDER
        ? trip.driver?.userId
        : trip.rider.userId;

    if (notifyUserId) {
      void this.notificationsService.enqueue({
        userId: notifyUserId,
        title: 'Alerte SOS',
        body: 'Un SOS a été déclenché sur votre trajet. Vérifiez immédiatement.',
        channel: NotificationChannel.PUSH,
        dedupeKey: `sos:${tripId}:${triggeredAt.getTime()}`,
        data: { type: 'trip_sos', tripId },
      });
    }

    return {
      triggered: true,
      tripId,
      triggeredAt: triggeredAt.toISOString(),
    };
  }

  async createShareLink(auth: RequestAuthContext, tripId: string) {
    if (auth.user.role !== UserRole.RIDER) {
      throw new BadRequestException(
        'Only the rider can create a public trip share link.',
      );
    }

    const token = randomBytes(24).toString('base64url');
    const tokenHash = hashShareToken(token);
    const expiresAt = new Date(
      Date.now() + tripShareLinkTtlMinutes * 60 * 1000,
    );

    const trip = await this.prisma.$transaction(async (tx) => {
      const found = await tx.trip.findUnique({
        where: { id: tripId },
        include: { rider: true, driver: true },
      });

      if (!found) throw new NotFoundException('Trip not found.');
      this.assertTripAccess(auth, found);

      if (!ACTIVE_TRIP_STATUSES.includes(found.status)) {
        throw new BadRequestException(
          'Trip sharing is only available for active trips.',
        );
      }

      await tx.trip.update({
        where: { id: tripId },
        data: {
          events: {
            create: {
              eventType: 'SHARE_LINK_CREATED',
              payload: {
                tokenHash,
                expiresAt: expiresAt.toISOString(),
                createdByRole: auth.user.role,
                createdByUserId: auth.user.id,
                ttlMinutes: tripShareLinkTtlMinutes,
              } satisfies Prisma.InputJsonObject,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'TRIP_SHARE_LINK_CREATED',
          entityType: 'TRIP',
          entityId: found.id,
          metadata: {
            role: auth.user.role,
            expiresAt: expiresAt.toISOString(),
            ttlMinutes: tripShareLinkTtlMinutes,
          } satisfies Prisma.InputJsonObject,
        },
      });

      return found;
    });

    this.realtimeService.publish({
      channel: 'trip',
      type: 'trip.share-link-created',
      entityId: trip.id,
      riderId: trip.riderId,
      driverId: trip.driverId,
      actorRole: auth.user.role,
      payload: {
        expiresAt: expiresAt.toISOString(),
        ttlMinutes: tripShareLinkTtlMinutes,
      },
    });

    return {
      share: {
        tripId: trip.id,
        token,
        path: `/trips/shared/${token}`,
        expiresAt: expiresAt.toISOString(),
        ttlMinutes: tripShareLinkTtlMinutes,
      },
    };
  }

  private assertTripAccess(
    auth: RequestAuthContext,
    trip: TripWithParticipants,
  ) {
    if (auth.user.role === UserRole.RIDER && trip.rider.userId !== auth.user.id) {
      throw new ForbiddenException('Access denied to this trip.');
    }

    if (
      auth.user.role === UserRole.DRIVER &&
      trip.driver?.userId !== auth.user.id
    ) {
      throw new ForbiddenException('Access denied to this trip.');
    }
  }
}
