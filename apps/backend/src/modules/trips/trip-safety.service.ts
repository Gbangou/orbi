/**
 * TripSafetyService — Sécurité en cours de trajet
 *
 * Responsabilité unique: signalement d'incidents, SOS urgence, partage
 * sécurisé du lien de suivi de trajet.
 * Extrait de TripsService pour respecter le Single Responsibility Principle.
 */
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TripStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationChannel } from '@prisma/client';
import type { RequestAuthContext } from '../auth/auth.types';
import { ACTIVE_TRIP_STATUSES } from './trips.constants';

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

  async triggerSafetySos(
    auth: RequestAuthContext,
    tripId: string,
    payload: {
      details?: string;
      latitude?: number;
      longitude?: number;
      accuracyMeters?: number;
    },

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
      const trip = await tx.trip.findUnique({
        where: {
          id: tripId,
        },
        include: {
          rider: true,
          driver: true,
        },
      });

      if (!trip) {
        throw new NotFoundException('Trip not found.');
      }

      this.assertTripAccess(auth, trip);

      if (!ACTIVE_TRIP_STATUSES.includes(trip.status)) {
        throw new BadRequestException(
          'Trip sharing is only available for active trips.',
        );
      }

      await tx.trip.update({
        where: {
          id: tripId,
        },
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
              },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'TRIP_SHARE_LINK_CREATED',
          entityType: 'TRIP',
          entityId: trip.id,
          metadata: {
            role: auth.user.role,
            expiresAt: expiresAt.toISOString(),
            ttlMinutes: tripShareLinkTtlMinutes,
          },
        },
      });

      return trip;
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
}
