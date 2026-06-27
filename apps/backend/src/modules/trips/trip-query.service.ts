import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  DriverDocumentStatus,
  DriverDocumentType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DocumentLinksService } from '../../common/document-links/document-links.service';
import type { RequestAuthContext } from '../auth/auth.types';
import {
  ACTIVE_RIDE_REQUEST_STATUSES,
  ACTIVE_TRIP_STATUSES,
  TRIP_EVENT_LABELS,
} from './trips.constants';
import {
  serializeTripDetail,
  serializeTripHistoryItem,
} from './trips.presenter';
import { toAmount } from './trips.utils';

function hashShareToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isConfirmedDocumentObject(metadata: unknown) {
  const record = isRecord(metadata) ? metadata : {};
  const ov = isRecord(record.objectVerification) ? record.objectVerification : {};
  return ov.state === 'confirmed';
}

@Injectable()
export class TripQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentLinksService: DocumentLinksService,
  ) {}

  async getTripDetail(auth: RequestAuthContext, tripId: string) {
    const trip = await this.findTripWithDetail(tripId);
    this.assertTripAccess(auth, trip);
    const profilePhotoUrl = this.resolveDriverProfilePhotoUrl(trip, auth);

    let promoCode: { code: string; discountBps: number } | null = null;
    if (trip.rideRequest?.promoCodeId) {
      const promo = await this.prisma.promoCode.findUnique({
        where: { id: trip.rideRequest.promoCodeId },
        select: { code: true, discountBps: true },
      });
      if (promo) promoCode = { code: promo.code, discountBps: promo.discountBps };
    }

    return serializeTripDetail(
      { ...trip, driver: { ...trip.driver, profilePhotoUrl }, promoCode },
      { viewerRole: auth.user.role },
    );
  }

  async getSharedTrip(shareToken: string) {
    const token = shareToken.trim();

    if (token.length < 16 || token.length > 128) {
      throw new NotFoundException('Shared trip not found.');
    }

    const tokenHash = hashShareToken(token);
    const shareEvent = await this.prisma.tripEvent.findFirst({
      where: {
        eventType: 'SHARE_LINK_CREATED',
        payload: { path: ['tokenHash'], equals: tokenHash },
        trip: { is: { status: { in: ACTIVE_TRIP_STATUSES } } },
      },
      include: {
        trip: {
          include: {
            rider: { include: { user: true } },
            driver: { include: { user: true } },
            vehicle: true,
            events: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    const sharePayload = isRecord(shareEvent?.payload) ? shareEvent.payload : {};
    const expiresAt =
      typeof sharePayload.expiresAt === 'string'
        ? Date.parse(sharePayload.expiresAt)
        : NaN;

    if (!shareEvent || expiresAt <= now) {
      throw new NotFoundException('Shared trip not found.');
    }

    const matchedTrip = shareEvent.trip;
    const lastEvent = matchedTrip.events.at(-1);

    return {
      sharedTrip: {
        tripId: matchedTrip.id,
        status: matchedTrip.status,
        pickupAddress: matchedTrip.pickupAddress,
        destinationAddress: matchedTrip.destinationAddress,
        riderName: 'Passager Orbi',
        driverName: 'Chauffeur Orbi',
        vehicleLabel: `${matchedTrip.vehicle.make} ${matchedTrip.vehicle.model}`,
        lastEvent: lastEvent
          ? {
              label: TRIP_EVENT_LABELS[lastEvent.eventType] ?? lastEvent.eventType,
              createdAt: lastEvent.createdAt.toISOString(),
            }
          : null,
        expiresAt: new Date(expiresAt).toISOString(),
      },
    };
  }

  async dashboard() {
    const [activeTrips, recentTrips] = await Promise.all([
      this.prisma.trip.count({ where: { status: { in: ACTIVE_TRIP_STATUSES } } }),
      this.prisma.trip.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          rider: { include: { user: true } },
          driver: { include: { user: true } },
          vehicle: true,
        },
      }),
    ]);
    return { activeTrips, recentTrips };
  }

  async findMine(auth: RequestAuthContext) {
    if (auth.user.role === UserRole.RIDER) {
      const riderProfileId = auth.user.riderProfile?.id;
      if (!riderProfileId) {
        throw new NotFoundException('No rider profile found for the authenticated user.');
      }

      const [pendingRequests, trips, activeTrips, completedTrips, cancelledTrips] =
        await Promise.all([
          this.prisma.rideRequest.findMany({
            where: { riderId: riderProfileId, status: { in: [...ACTIVE_RIDE_REQUEST_STATUSES] } },
            orderBy: { createdAt: 'desc' },
            take: 8,
          }),
          this.prisma.trip.findMany({
            where: { riderId: riderProfileId },
            orderBy: { createdAt: 'desc' },
            take: 12,
            include: {
              driver: { include: { user: true } },
              events: { orderBy: { createdAt: 'asc' } },
              vehicle: true,
            },
          }),
          this.prisma.trip.count({
            where: { riderId: riderProfileId, status: { in: ACTIVE_TRIP_STATUSES } },
          }),
          this.prisma.trip.count({ where: { riderId: riderProfileId, status: 'COMPLETED' } }),
          this.prisma.trip.count({ where: { riderId: riderProfileId, status: 'CANCELLED' } }),
        ]);

      return {
        role: auth.user.role,
        stats: {
          activeTrips,
          completedTrips,
          cancelledTrips,
          totalAmount: trips.reduce((sum, trip) => sum + toAmount(trip.actualFare), 0),
          currency: 'XOF',
        },
        pendingRequests: pendingRequests.map((request) => ({
          id: request.id,
          pickupAddress: request.pickupAddress,
          destinationAddress: request.destinationAddress,
          estimatedFare: toAmount(request.estimatedFare),
          status: request.status,
          createdAt: request.createdAt.toISOString(),
        })),
        recentTrips: trips.map((trip) => ({
          ...serializeTripHistoryItem(trip, { viewerRole: auth.user.role }),
          counterpartyName: trip.driver.user.fullName,
        })),
      };
    }

    const driverProfileId = auth.user.driverProfile?.id;
    if (!driverProfileId) {
      throw new NotFoundException('No driver profile found for the authenticated user.');
    }

    const [trips, activeTrips, completedTrips, cancelledTrips] = await Promise.all([
      this.prisma.trip.findMany({
        where: { driverId: driverProfileId },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: {
          rider: { include: { user: true } },
          events: { orderBy: { createdAt: 'asc' } },
          vehicle: true,
        },
      }),
      this.prisma.trip.count({
        where: { driverId: driverProfileId, status: { in: ACTIVE_TRIP_STATUSES } },
      }),
      this.prisma.trip.count({ where: { driverId: driverProfileId, status: 'COMPLETED' } }),
      this.prisma.trip.count({ where: { driverId: driverProfileId, status: 'CANCELLED' } }),
    ]);

    const recentTrips = trips.map((trip) => ({
      ...serializeTripHistoryItem(trip, { viewerRole: auth.user.role }),
      amount: Math.round(toAmount(trip.actualFare) * 0.82),
      counterpartyName: trip.rider.user.fullName,
    }));

    return {
      role: auth.user.role,
      stats: {
        activeTrips,
        completedTrips,
        cancelledTrips,
        totalAmount: recentTrips.reduce((sum, trip) => sum + trip.amount, 0),
        currency: 'XOF',
      },
      pendingRequests: [],
      recentTrips,
    };
  }

  private async findTripWithDetail(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        rider: { include: { user: true } },
        driver: {
          include: {
            user: true,
            onboardingDocuments: {
              where: {
                type: DriverDocumentType.SELFIE_VERIFICATION,
                status: DriverDocumentStatus.APPROVED,
              },
              orderBy: { uploadedAt: 'desc' },
              take: 1,
            },
          },
        },
        vehicle: true,
        rideRequest: true,
        events: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!trip) throw new NotFoundException('Trip not found.');
    return trip;
  }

  assertTripAccess(
    auth: RequestAuthContext,
    trip: { riderId: string; driverId: string },
  ) {
    if (
      auth.user.role === UserRole.RIDER &&
      trip.riderId !== auth.user.riderProfile?.id
    ) {
      throw new NotFoundException('Trip not found.');
    }

    if (
      auth.user.role === UserRole.DRIVER &&
      trip.driverId !== auth.user.driverProfile?.id
    ) {
      throw new NotFoundException('Trip not found.');
    }
  }

  private resolveDriverProfilePhotoUrl(
    trip: {
      driver: {
        id: string;
        onboardingDocuments?: Array<{
          id: string;
          driverProfileId: string;
          type: DriverDocumentType;
          status: DriverDocumentStatus;
          storageKey: string;
          metadata?: unknown;
        }>;
      };
    },
    auth: RequestAuthContext,
  ) {
    const selfieDocument = trip.driver.onboardingDocuments?.[0];

    if (
      !selfieDocument ||
      selfieDocument.type !== DriverDocumentType.SELFIE_VERIFICATION ||
      selfieDocument.status !== DriverDocumentStatus.APPROVED ||
      !isConfirmedDocumentObject(selfieDocument.metadata)
    ) {
      return null;
    }

    return this.documentLinksService.createViewLink({
      documentId: selfieDocument.id,
      driverProfileId: selfieDocument.driverProfileId,
      storageKey: selfieDocument.storageKey,
      actorRole: auth.user.role,
    }).signedUrl;
  }
}
