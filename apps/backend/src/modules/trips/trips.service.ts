import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  DriverDocumentStatus,
  DriverDocumentType,
  NotificationChannel,
  Prisma,
  RideRequestStatus,
  TrustedContactShareMode,
  TripStatus,
  UserRole,
} from '@prisma/client';
import { roundXofForCashOperations } from '@orbi/domain';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { DocumentLinksService } from '../../common/document-links/document-links.service';
import { calculateDriverEconomics } from '../../common/economics/driver-commission';
import { NotificationsService } from '../notifications/notifications.service';
import type { RequestAuthContext } from '../auth/auth.types';
import {
  ACTIVE_RIDE_REQUEST_STATUSES,
  ACTIVE_TRIP_STATUSES,
  TRIP_EVENT_LABELS,
  resolveCancellationActor,
  resolveTripStatusTransitionDecision,
} from './trips.constants';
import {
  serializeTripDetail,
  serializeTripHistoryItem,
  serializeTripLifecycle,
} from './trips.presenter';
import {
  evaluateRideRequestAcceptanceDecision,
  selectCompatibleVehicle,
} from './trip-acceptance.policy';
import { extractPickupCode, toAmount } from './trips.utils';
import {
  driverFatigueWindowHours,
  evaluateDriverFatigue,
} from '../drivers/driver-fatigue.policy';
import { parseStrictTripShareExpiry } from './trip-share-expiry';

const tripShareLinkTtlMinutes = 120;
const routeMonitoringAlertCooldownMinutes = 15;
const safetySosCooldownMinutes = 2;
const safetyIncidentCooldownMinutes = 2;
const incidentEvidenceDefaultRetentionHours = 24;
const incidentEvidenceMinRetentionHours = 1;
const incidentEvidenceMaxRetentionHours = 72;
const routeStopMinutesThreshold = 8;
const routeNoProgressMinutesThreshold = 10;
const routeDeviationKmThreshold = 0.75;
const routeMinimumProgressKm = 0.2;
const gpsAnomalyMaxImpliedSpeedKph = 500;
const gpsAnomalyMinDistanceKm = 0.5;
const gpsAnomalyMaxGapMinutes = 30;
const pickupMismatchGraceMinutes = 7;
const pickupMismatchDistanceKmThreshold = 0.8;
const routeCompletionMaxSignalAgeMinutes = 10;
const routeCompletionMaxAccuracyMeters = 250;
const routeCompletionMaxSpeedKph = 110;
const trustedContactNightStartHour = 20;
const trustedContactNightEndHour = 5;

type TripCancellationPolicy = {
  actor: 'RIDER' | 'DRIVER';
  level: 'CLEAR' | 'REVIEW' | 'FEE_RECOMMENDED' | 'DRIVER_WARNING';
  suggestedFeeAmount: number;
  driverCompensationAmount: number;
  currency: string;
  recentCancellationCount: number;
  driverReliabilityImpact?: 'NONE' | 'WATCH' | 'AT_RISK' | 'SUPPORT_REVIEW';
  temporaryPauseMinutes?: number;
  supportTicketId?: string | null;
  message: string;
};

function hashShareToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function shouldAutoShareWithTrustedContact(
  mode: TrustedContactShareMode,
  now: Date,
) {
  if (mode === TrustedContactShareMode.ALL_TRIPS) {
    return true;
  }

  if (mode !== TrustedContactShareMode.NIGHT) {
    return false;
  }

  const hour = now.getUTCHours();
  return hour >= trustedContactNightStartHour || hour < trustedContactNightEndHour;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isConfirmedDocumentObject(metadata: unknown) {
  const metadataRecord = isRecord(metadata) ? metadata : {};
  const objectVerification = isRecord(metadataRecord.objectVerification)
    ? metadataRecord.objectVerification
    : {};

  return objectVerification.state === 'confirmed';
}

function toNumber(value: unknown) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
}

function haversineKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latDelta = toRadians(to.latitude - from.latitude);
  const lonDelta = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function distanceToRouteKm(
  point: { latitude: number; longitude: number },
  pickup: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
) {
  const routeDistanceKm = haversineKm(pickup, destination);

  if (routeDistanceKm < 0.05) {
    return haversineKm(point, destination);
  }

  const latitudeKm = 111.32;
  const longitudeKm =
    111.32 *
    Math.cos(((pickup.latitude + destination.latitude) / 2) * (Math.PI / 180));
  const ax = pickup.longitude * longitudeKm;
  const ay = pickup.latitude * latitudeKm;
  const bx = destination.longitude * longitudeKm;
  const by = destination.latitude * latitudeKm;
  const px = point.longitude * longitudeKm;
  const py = point.latitude * latitudeKm;
  const dx = bx - ax;
  const dy = by - ay;
  const projection = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
  );
  const closestX = ax + projection * dx;
  const closestY = ay + projection * dy;

  return Math.hypot(px - closestX, py - closestY);
}

function roundKm(distanceKm: number) {
  return Number(distanceKm.toFixed(2));
}

function resolveRoutePositionSnapshot(input: {
  position: {
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    speedKph: number | null;
    distanceToDestinationKm: number | null;
  };
  rideRequest: {
    pickupLatitude: unknown;
    pickupLongitude: unknown;
    destinationLatitude: unknown;
    destinationLongitude: unknown;
  };
  observedAt: Date;
  sourceRole: UserRole;
}) {
  const pickupLatitude = toNumber(input.rideRequest.pickupLatitude);
  const pickupLongitude = toNumber(input.rideRequest.pickupLongitude);
  const destinationLatitude = toNumber(input.rideRequest.destinationLatitude);
  const destinationLongitude = toNumber(input.rideRequest.destinationLongitude);
  let distanceToPickupKm: number | null = null;
  let distanceToDestinationKm = input.position.distanceToDestinationKm;

  if (pickupLatitude !== null && pickupLongitude !== null) {
    distanceToPickupKm = roundKm(
      haversineKm(input.position, {
        latitude: pickupLatitude,
        longitude: pickupLongitude,
      }),
    );
  }

  if (
    distanceToDestinationKm === null &&
    destinationLatitude !== null &&
    destinationLongitude !== null
  ) {
    distanceToDestinationKm = roundKm(
      haversineKm(input.position, {
        latitude: destinationLatitude,
        longitude: destinationLongitude,
      }),
    );
  }

  return {
    latitude: input.position.latitude,
    longitude: input.position.longitude,
    accuracyMeters: input.position.accuracyMeters,
    speedKph: input.position.speedKph,
    distanceToPickupKm,
    distanceToDestinationKm,
    observedAt: input.observedAt.toISOString(),
    sourceRole: input.sourceRole,
  };
}

function getRoutePositionPayload(event: {
  payload?: unknown;
  createdAt: Date;
}) {
  const payload = isRecord(event.payload) ? event.payload : {};
  const latitude = toNumber(payload.latitude);
  const longitude = toNumber(payload.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracyMeters: toNumber(payload.accuracyMeters),
    distanceToDestinationKm: toNumber(payload.distanceToDestinationKm),
    speedKph: toNumber(payload.speedKph),
    sourceRole:
      typeof payload.sourceRole === 'string' ? payload.sourceRole : null,
    createdAt: event.createdAt,
  };
}

function resolveLatestDriverRoutePosition(
  events: Array<{
    eventType: string;
    payload?: unknown;
    createdAt: Date;
  }>,
) {
  return (
    [...events]
      .reverse()
      .filter((event) => event.eventType === 'ROUTE_POSITION_RECORDED')
      .map((event) => getRoutePositionPayload(event))
      .find((position) => position && position.sourceRole !== UserRole.RIDER) ??
    null
  );
}

function hasCriticalRouteMonitoringAlert(
  events: Array<{
    eventType: string;
    payload?: unknown;
    createdAt: Date;
  }>,
) {
  return events.some((event) => {
    if (event.eventType !== 'ROUTE_MONITORING_ALERT') {
      return false;
    }

    const payload = isRecord(event.payload) ? event.payload : {};

    return payload.severity === 'critical';
  });
}

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
    private readonly documentLinksService: DocumentLinksService,
    private readonly notificationsService: NotificationsService,
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
      if (promo) {
        promoCode = { code: promo.code, discountBps: promo.discountBps };
      }
    }

    const detail = serializeTripDetail(
      {
        ...trip,
        driver: {
          ...trip.driver,
          profilePhotoUrl,
        },
        promoCode,
      },
      { viewerRole: auth.user.role },
    );

    return detail;
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

  async getSharedTrip(shareToken: string) {
    const token = shareToken.trim();

    if (token.length < 16 || token.length > 128) {
      throw new NotFoundException('Shared trip not found.');
    }

    const tokenHash = hashShareToken(token);
    const shareEvent = await this.prisma.tripEvent.findFirst({
      where: {
        eventType: 'SHARE_LINK_CREATED',
        payload: {
          path: ['tokenHash'],
          equals: tokenHash,
        },
        trip: {
          is: {
            status: {
              in: ACTIVE_TRIP_STATUSES,
            },
          },
        },
      },
      include: {
        trip: {
          include: {
            rider: {
              include: {
                user: true,
              },
            },
            driver: {
              include: {
                user: true,
              },
            },
            vehicle: true,
            events: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const now = Date.now();
    const sharePayload = isRecord(shareEvent?.payload)
      ? shareEvent.payload
      : {};
    const expiresAt = parseStrictTripShareExpiry(sharePayload.expiresAt);

    if (!shareEvent || !expiresAt || expiresAt.getTime() <= now) {
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
              label:
                TRIP_EVENT_LABELS[lastEvent.eventType] ?? lastEvent.eventType,
              createdAt: lastEvent.createdAt.toISOString(),
            }
          : null,
        expiresAt:
          expiresAt.toISOString(),
        safetyNote:
          'Lien limite aux informations utiles de securite. Aucun nom reel ni numero personnel n est expose.',
      },
    };
  }

  async recordRoutePosition(
    auth: RequestAuthContext,
    tripId: string,
    payload: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      speedKph?: number;
      distanceToDestinationKm?: number;
    },
  ) {
    const observedAt = new Date();
    const position = {
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracyMeters: payload.accuracyMeters ?? null,
      speedKph: payload.speedKph ?? null,
      distanceToDestinationKm: payload.distanceToDestinationKm ?? null,
    };
    let latestPosition: ReturnType<typeof resolveRoutePositionSnapshot> | null =
      null;

    const { trip, alerts, ticketIds } = await this.prisma.$transaction(
      async (tx) => {
        const trip = await tx.trip.findUnique({
          where: {
            id: tripId,
          },
          include: {
            rideRequest: true,
            events: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        });

        if (!trip) {
          throw new NotFoundException('Trip not found.');
        }

        this.assertTripAccess(auth, trip);

        if (!ACTIVE_TRIP_STATUSES.includes(trip.status)) {
          throw new BadRequestException(
            'Route monitoring is only available for active trips.',
          );
        }

        latestPosition = resolveRoutePositionSnapshot({
          position,
          rideRequest: trip.rideRequest,
          observedAt,
          sourceRole: auth.user.role,
        });

        await tx.trip.update({
          where: {
            id: tripId,
          },
          data: {
            events: {
              create: {
                eventType: 'ROUTE_POSITION_RECORDED',
                payload: {
                  ...position,
                  observedAt: observedAt.toISOString(),
                  sourceRole: auth.user.role,
                  sourceUserId: auth.user.id,
                },
              },
            },
          },
        });

        const alerts =
          auth.user.role === UserRole.RIDER
            ? []
            : this.evaluateRouteMonitoringAlerts({
                trip,
                position,
                observedAt,
              });
        const recentAlertTypes = new Set(
          trip.events
            .filter((event) => {
              if (event.eventType !== 'ROUTE_MONITORING_ALERT') {
                return false;
              }

              return (
                observedAt.getTime() - event.createdAt.getTime() <
                routeMonitoringAlertCooldownMinutes * 60 * 1000
              );
            })
            .map((event) => {
              const eventPayload = isRecord(event.payload) ? event.payload : {};

              return typeof eventPayload.alertType === 'string'
                ? eventPayload.alertType
                : '';
            }),
        );
        const freshAlerts = alerts.filter(
          (alert) => !recentAlertTypes.has(alert.alertType),
        );
        const ticketIds: string[] = [];

        for (const alert of freshAlerts) {
          const ticket = await tx.supportTicket.create({
            data: {
              userId: auth.user.id,
              subject: `Alerte route trajet ${trip.id}`,
              description: [
                `Type: ${alert.alertType}`,
                `Trip: ${trip.id}`,
                `Role: ${auth.user.role}`,
                `Signal: ${alert.message}`,
                `Position: ${position.latitude},${position.longitude}`,
              ].join('\n'),
              priority: alert.priority,
            },
          });
          ticketIds.push(ticket.id);

          await tx.trip.update({
            where: {
              id: tripId,
            },
            data: {
              events: {
                create: {
                  eventType: 'ROUTE_MONITORING_ALERT',
                  payload: {
                    ...alert,
                    supportTicketId: ticket.id,
                    sourceRole: auth.user.role,
                    sourceUserId: auth.user.id,
                    position,
                  },
                },
              },
            },
          });

          await tx.auditLog.create({
            data: {
              userId: auth.user.id,
              action: 'TRIP_ROUTE_MONITORING_ALERT_CREATED',
              entityType: 'TRIP',
              entityId: trip.id,
              metadata: {
                alertType: alert.alertType,
                severity: alert.severity,
                supportTicketId: ticket.id,
              },
            },
          });
        }

        return {
          trip,
          alerts: freshAlerts,
          ticketIds,
        };
      },
    );

    this.realtimeService.publish({
      channel: 'trip',
      type: alerts.length ? 'trip.route-monitor-alert' : 'trip.route-position',
      entityId: trip.id,
      riderId: trip.riderId,
      driverId: trip.driverId,
      actorRole: auth.user.role,
      payload: {
        alertCount: alerts.length,
        alertTypes: alerts.map((alert) => alert.alertType),
        ticketIds,
      },
    });

    return {
      routeMonitoring: {
        tripId: trip.id,
        state: alerts.length ? 'alert' : 'clear',
        checkedAt: observedAt.toISOString(),
        latestPosition,
        alerts,
        ticketIds,
      },
    };
  }

  async acceptRideRequest(auth: RequestAuthContext, rideRequestId: string) {
    const driverProfileId = auth.user.driverProfile?.id;

    if (!driverProfileId) {
      throw new NotFoundException(
        'No driver profile found for the authenticated user.',
      );
    }

    const now = new Date();
    await this.assertDriverFatigueAllowsNewTrip(auth, driverProfileId, now);
    const trip = await this.prisma.$transaction(async (tx) => {
      const driverProfile = await tx.driverProfile.findUnique({
        where: {
          id: driverProfileId,
        },
        include: {
          vehicles: {
            where: {
              isActive: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

      if (!driverProfile) {
        throw new NotFoundException('Driver profile could not be loaded.');
      }

      if (driverProfile.verificationStatus !== 'APPROVED') {
        throw new BadRequestException(
          'Only approved drivers can accept ride requests.',
        );
      }

      if (driverProfile.status !== 'ONLINE') {
        throw new BadRequestException(
          'The driver must be online before accepting a ride request.',
        );
      }

      const activeTrip = await tx.trip.findFirst({
        where: {
          driverId: driverProfileId,
          status: {
            in: ACTIVE_TRIP_STATUSES,
          },
        },
        select: {
          id: true,
        },
      });

      if (activeTrip) {
        throw new BadRequestException(
          'The driver already has an active trip in progress.',
        );
      }

      const rideRequest = await tx.rideRequest.findUnique({
        where: {
          id: rideRequestId,
        },
      });

      if (!rideRequest) {
        throw new NotFoundException('Ride request not found.');
      }

      const acceptanceDecision = evaluateRideRequestAcceptanceDecision({
        driverProfileId,
        now,
        rideRequest: {
          status: rideRequest.status,
          assignedDriverId: rideRequest.assignedDriverId,
          assignmentExpiresAt: rideRequest.assignmentExpiresAt,
        },
      });

      if (!acceptanceDecision.allowed) {
        throw new BadRequestException(
          acceptanceDecision.reason === 'RESERVED_FOR_OTHER_DRIVER'
            ? 'This ride request is currently reserved for another driver.'
            : 'This ride request is no longer available.',
        );
      }

      const selectedVehicle = selectCompatibleVehicle(driverProfile.vehicles, {
        requestedVehicleType: rideRequest.requestedVehicleType,
        requestedServiceTier: rideRequest.requestedServiceTier,
      });

      if (!selectedVehicle) {
        throw new BadRequestException(
          'No active vehicle can satisfy this request.',
        );
      }

      const claimResult = await tx.rideRequest.updateMany({
        where: {
          id: rideRequestId,
          status: {
            in: ['REQUESTED', 'MATCHED'],
          },
          OR: [
            {
              assignedDriverId: null,
            },
            {
              assignedDriverId: driverProfileId,
            },
            {
              assignmentExpiresAt: {
                lt: now,
              },
            },
          ],
        },
        data: {
          status: 'MATCHED',
          assignedDriverId: driverProfileId,
          assignmentExpiresAt: null,
        },
      });

      if (claimResult.count === 0) {
        throw new BadRequestException(
          'This ride request is no longer available.',
        );
      }

      const existingTrip = await tx.trip.findUnique({
        where: {
          rideRequestId,
        },
      });

      if (existingTrip) {
        throw new BadRequestException(
          'A trip already exists for this ride request.',
        );
      }

      const trustedContact = await tx.riderProfile.findUnique({
        where: {
          id: rideRequest.riderId,
        },
        select: {
          emergencyPhone: true,
          trustedContactShareMode: true,
          trustedContacts: {
            where: {
              isActive: true,
            },
            orderBy: {
              priority: 'asc',
            },
            take: 1,
            select: {
              phoneNumber: true,
            },
          },
        },
      });
      const trustedContactPhone =
        trustedContact?.trustedContacts[0]?.phoneNumber ??
        trustedContact?.emergencyPhone ??
        null;
      const shouldAutoShare =
        Boolean(trustedContactPhone) &&
        shouldAutoShareWithTrustedContact(
          trustedContact?.trustedContactShareMode ??
            TrustedContactShareMode.MANUAL,
          now,
        );
      const autoShareToken = shouldAutoShare
        ? randomBytes(24).toString('base64url')
        : null;
      const autoShareTokenHash = autoShareToken
        ? hashShareToken(autoShareToken)
        : null;
      const autoShareExpiresAt = autoShareToken
        ? new Date(now.getTime() + tripShareLinkTtlMinutes * 60 * 1000)
        : null;

      const trip = await tx.trip.create({
        data: {
          rideRequestId: rideRequest.id,
          riderId: rideRequest.riderId,
          driverId: driverProfileId,
          vehicleId: selectedVehicle.id,
          status: 'MATCHED',
          pickupAddress: rideRequest.pickupAddress,
          destinationAddress: rideRequest.destinationAddress,
          actualFare: rideRequest.estimatedFare,
          distanceKm: rideRequest.estimatedDistanceKm,
          durationMinutes: rideRequest.estimatedDurationMinutes,
          currency: rideRequest.currency,
          events: {
            create: [
              {
                eventType: 'TRIP_ACCEPTED',
                payload: {
                  driverId: driverProfileId,
                },
              },
              ...(autoShareTokenHash && autoShareExpiresAt
                ? [
                    {
                      eventType: 'SHARE_LINK_CREATED',
                      payload: {
                        tokenHash: autoShareTokenHash,
                        expiresAt: autoShareExpiresAt.toISOString(),
                        createdByRole: 'SYSTEM',
                        createdByUserId: null,
                        reason: 'TRUSTED_CONTACT_AUTO_SHARE',
                        shareMode: trustedContact?.trustedContactShareMode,
                        deliveryState: 'PENDING_PROVIDER',
                        ttlMinutes: tripShareLinkTtlMinutes,
                      },
                    },
                  ]
                : []),
            ],
          },
        },
        include: {
          rider: {
            include: {
              user: true,
            },
          },
          vehicle: true,
          rideRequest: true,
          events: true,
        },
      });

      if (auth.user.id) {
        await tx.auditLog.create({
          data: {
            userId: auth.user.id,
            action: 'DISPATCH_RESERVATION_ACCEPTED',
            entityType: 'RIDE_REQUEST',
            entityId: rideRequest.id,
            metadata: {
              tripId: trip.id,
              driverId: driverProfileId,
            } as Prisma.InputJsonValue,
          },
        });
      }

      if (autoShareExpiresAt) {
        await tx.auditLog.create({
          data: {
            userId: auth.user.id,
            action: 'TRIP_TRUSTED_CONTACT_SHARE_PREPARED',
            entityType: 'TRIP',
            entityId: trip.id,
            metadata: {
              riderId: rideRequest.riderId,
              shareMode: trustedContact?.trustedContactShareMode,
              expiresAt: autoShareExpiresAt.toISOString(),
              ttlMinutes: tripShareLinkTtlMinutes,
              deliveryState: 'PENDING_PROVIDER',
            } as Prisma.InputJsonValue,
          },
        });
      }

      await tx.driverProfile.update({
        where: {
          id: driverProfileId,
        },
        data: {
          status: 'BUSY',
        },
      });

      return trip;
    });

    this.realtimeService.publish({
      channel: 'trip',
      type: 'trip.created',
      entityId: trip.id,
      riderId: trip.riderId,
      driverId: trip.driverId,
      actorRole: auth.user.role,
      payload: {
        status: trip.status,
        rideRequestId: trip.rideRequestId,
      },
    });

    const autoShareEvent = trip.events.find((event) => {
      const payload = isRecord(event.payload) ? event.payload : {};
      return (
        event.eventType === 'SHARE_LINK_CREATED' &&
        payload.reason === 'TRUSTED_CONTACT_AUTO_SHARE'
      );
    });

    if (autoShareEvent) {
      const payload = isRecord(autoShareEvent.payload)
        ? autoShareEvent.payload
        : {};
      this.realtimeService.publish({
        channel: 'trip',
        type: 'trip.share-link-created',
        entityId: trip.id,
        riderId: trip.riderId,
        driverId: trip.driverId,
        actorRole: 'SYSTEM',
        payload: {
          reason: 'TRUSTED_CONTACT_AUTO_SHARE',
          expiresAt:
            typeof payload.expiresAt === 'string' ? payload.expiresAt : null,
          ttlMinutes: tripShareLinkTtlMinutes,
          deliveryState: 'PENDING_PROVIDER',
        },
      });
    }

    void this.notificationsService.enqueue({
      userId: trip.rider.user.id,
      title: 'Chauffeur trouvé !',
      body: 'Votre chauffeur est en route. Préparez-vous au point de ramassage.',
      channel: NotificationChannel.PUSH,
      dedupeKey: `trip_matched:${trip.id}`,
      data: { type: 'trip_matched', tripId: trip.id },
    });

    return serializeTripLifecycle({
      ...trip,
      rideRequest: { paymentMethod: trip.rideRequest?.paymentMethod ?? null },
      pickupCode: null,
    });
  }

  async verifyPickupCode(
    auth: RequestAuthContext,
    tripId: string,
    pickupCode: string,
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: {
        id: tripId,
      },
      include: {
        events: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found.');
    }

    this.assertDriverOwnsTrip(auth, trip.driverId);

    if (trip.status !== 'DRIVER_ARRIVING') {
      throw new BadRequestException(
        'Pickup code can only be verified when the driver has arrived.',
      );
    }

    const expectedPickupCode = extractPickupCode(trip.events);

    if (!expectedPickupCode || expectedPickupCode !== pickupCode) {
      throw new BadRequestException('Code de prise en charge invalide.');
    }

    const updatedTrip = await this.prisma.$transaction(async (tx) => {
      const nextTrip = await tx.trip.update({
        where: {
          id: tripId,
        },
        data: {
          status: 'IN_PROGRESS',
          startedAt: trip.startedAt ?? new Date(),
          events: {
            create: {
              eventType: 'PICKUP_CODE_VERIFIED',
              payload: {
                verifiedByRole: auth.user.role,
                verifiedByUserId: auth.user.id,
              },
            },
          },
        },
        include: {
          events: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'TRIP_PICKUP_CODE_VERIFIED',
          entityType: 'TRIP',
          entityId: tripId,
          metadata: {
            driverId: trip.driverId,
            rideRequestId: trip.rideRequestId,
          },
        },
      });

      return nextTrip;
    });

    this.realtimeService.publish({
      channel: 'trip',
      type: 'trip.pickup-code-verified',
      entityId: updatedTrip.id,
      riderId: trip.riderId,
      driverId: trip.driverId,
      actorRole: auth.user.role,
      payload: {
        status: updatedTrip.status,
      },
    });

    return serializeTripLifecycle({
      ...updatedTrip,
      pickupCode: null,
    });
  }

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
    const priority = Math.min(3, Math.max(1, payload.priority ?? 2));
    const normalizedIncidentType = payload.incidentType.trim().toUpperCase();
    const details = payload.details?.trim() ?? '';
    const evidenceRetentionHours = Math.min(
      incidentEvidenceMaxRetentionHours,
      Math.max(
        incidentEvidenceMinRetentionHours,
        payload.evidenceRetentionHours ??
          incidentEvidenceDefaultRetentionHours,
      ),
    );
    const evidenceDeclaredAt = new Date();
    const evidenceExpiresAt = new Date(
      evidenceDeclaredAt.getTime() + evidenceRetentionHours * 60 * 60 * 1000,
    );
    const evidence =
      payload.evidenceConsent && payload.evidenceType
        ? {
            consent: true,
            type: payload.evidenceType,
            declaredAt: evidenceDeclaredAt.toISOString(),
            expiresAt: evidenceExpiresAt.toISOString(),
            retentionHours: evidenceRetentionHours,
            storagePolicy: 'LOCAL_UNTIL_EXPLICIT_SUPPORT_UPLOAD',
            uploadRequired: false,
          }
        : null;

    const { ticket, trip } = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: {
          id: tripId,
        },
        include: {
          events: {
            where: {
              eventType: 'INCIDENT_REPORTED',
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 10,
          },
        },
      });

      if (!trip) {
        throw new NotFoundException('Trip not found.');
      }

      this.assertTripAccess(auth, trip);

      if (!ACTIVE_TRIP_STATUSES.includes(trip.status)) {
        throw new BadRequestException(
          'Incident reporting is only available for active trips.',
        );
      }

      const cooldownSince =
        Date.now() - safetyIncidentCooldownMinutes * 60 * 1000;
      const recentIncidentFromActor = (trip.events ?? []).some((event) => {
        const eventPayload = isRecord(event.payload) ? event.payload : {};

        return (
          event.createdAt.getTime() >= cooldownSince &&
          eventPayload.reportedByUserId === auth.user.id &&
          eventPayload.incidentType === normalizedIncidentType
        );
      });

      if (recentIncidentFromActor) {
        throw new BadRequestException(
          `Incident already reported recently. Please wait ${safetyIncidentCooldownMinutes} minutes before retrying.`,
        );
      }

      const ticket = await tx.supportTicket.create({
        data: {
          userId: auth.user.id,
          subject: `Incident trajet ${trip.id}`,
          description: [
            `Type: ${normalizedIncidentType}`,
            `Trip: ${trip.id}`,
            `Role: ${auth.user.role}`,
            details ? `Details: ${details}` : null,
            evidence
              ? `Evidence: ${evidence.type}, retention ${evidence.retentionHours}h, local only until explicit upload`
              : null,
          ]
            .filter(Boolean)
            .join('\n'),
          priority,
        },
      });

      await tx.trip.update({
        where: {
          id: tripId,
        },
        data: {
          events: {
            create: [
              {
                eventType: 'INCIDENT_REPORTED',
                payload: {
                  incidentType: normalizedIncidentType,
                  details: details || null,
                  priority,
                  reportedByRole: auth.user.role,
                  reportedByUserId: auth.user.id,
                  hasVoluntaryEvidence: Boolean(evidence),
                },
              },
              ...(evidence
                ? [
                    {
                      eventType: 'INCIDENT_EVIDENCE_DECLARED',
                      payload: {
                        incidentType: normalizedIncidentType,
                        reportedByRole: auth.user.role,
                        reportedByUserId: auth.user.id,
                        evidence,
                      },
                    },
                  ]
                : []),
            ],
          },
        },
      });

      if (evidence) {
        await tx.auditLog.create({
          data: {
            userId: auth.user.id,
            action: 'TRIP_INCIDENT_EVIDENCE_DECLARED',
            entityType: 'TRIP',
            entityId: trip.id,
            metadata: {
              incidentType: normalizedIncidentType,
              evidenceType: evidence.type,
              retentionHours: evidence.retentionHours,
              expiresAt: evidence.expiresAt,
              storagePolicy: evidence.storagePolicy,
              supportTicketId: ticket.id,
            },
          },
        });
      }

      return {
        ticket,
        trip,
      };
    });

    this.realtimeService.publish({
      channel: 'trip',
      type: 'trip.incident-reported',
      entityId: trip.id,
      riderId: trip.riderId,
      driverId: trip.driverId,
      actorRole: auth.user.role,
      payload: {
        incidentType: normalizedIncidentType,
        priority,
        ticketStatus: 'OPEN',
        hasVoluntaryEvidence: Boolean(evidence),
      },
    });

    return {
      incident: {
        tripId: trip.id,
        ticketId: ticket.id,
        priority,
        incidentType: normalizedIncidentType,
        reportedByRole: auth.user.role,
        status: 'OPEN',
        voluntaryEvidence: evidence
          ? {
              declared: true,
              type: evidence.type,
              retentionHours: evidence.retentionHours,
              expiresAt: evidence.expiresAt,
              storagePolicy: evidence.storagePolicy,
            }
          : {
              declared: false,
              type: null,
              retentionHours: null,
              expiresAt: null,
              storagePolicy: null,
            },
      },
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
    const details = payload.details?.trim() ?? '';
    const location =
      payload.latitude !== undefined && payload.longitude !== undefined
        ? {
            latitude: payload.latitude,
            longitude: payload.longitude,
            accuracyMeters: payload.accuracyMeters ?? null,
          }
        : null;

    const { ticket, trip } = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: {
          id: tripId,
        },
        include: {
          events: {
            where: {
              eventType: 'SOS_TRIGGERED',
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 5,
          },
        },
      });

      if (!trip) {
        throw new NotFoundException('Trip not found.');
      }

      this.assertTripAccess(auth, trip);

      if (!ACTIVE_TRIP_STATUSES.includes(trip.status)) {
        throw new BadRequestException(
          'SOS is only available for active trips.',
        );
      }

      const tripWithSosEvents = trip as typeof trip & {
        events?: Array<{
          payload: unknown;
          createdAt: Date;
        }>;
      };
      const cooldownSince = Date.now() - safetySosCooldownMinutes * 60 * 1000;
      const recentSosFromActor = (tripWithSosEvents.events ?? []).some(
        (event) => {
          const eventPayload = isRecord(event.payload) ? event.payload : {};

          return (
            event.createdAt.getTime() >= cooldownSince &&
            eventPayload.reportedByUserId === auth.user.id
          );
        },
      );

      if (recentSosFromActor) {
        throw new BadRequestException(
          `SOS already triggered recently. Please wait ${safetySosCooldownMinutes} minutes before retrying.`,
        );
      }

      const ticket = await tx.supportTicket.create({
        data: {
          userId: auth.user.id,
          subject: `SOS trajet ${trip.id}`,
          description: [
            'Type: SOS_TRIGGERED',
            `Trip: ${trip.id}`,
            `Role: ${auth.user.role}`,
            location
              ? `Location: ${location.latitude},${location.longitude} +/- ${location.accuracyMeters ?? 'unknown'}m`
              : 'Location: unavailable',
            details ? `Details: ${details}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          priority: 3,
        },
      });

      await tx.trip.update({
        where: {
          id: tripId,
        },
        data: {
          events: {
            create: {
              eventType: 'SOS_TRIGGERED',
              payload: {
                incidentType: 'SOS_TRIGGERED',
                details: details || null,
                priority: 3,
                reportedByRole: auth.user.role,
                reportedByUserId: auth.user.id,
                location,
                supportTicketId: ticket.id,
              },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'TRIP_SOS_TRIGGERED',
          entityType: 'TRIP',
          entityId: trip.id,
          metadata: {
            role: auth.user.role,
            supportTicketId: ticket.id,
            location,
          },
        },
      });

      return {
        ticket,
        trip,
      };
    });

    this.realtimeService.publish({
      channel: 'trip',
      type: 'trip.sos-triggered',
      entityId: trip.id,
      riderId: trip.riderId,
      driverId: trip.driverId,
      actorRole: auth.user.role,
      payload: {
        incidentType: 'SOS_TRIGGERED',
        priority: 3,
        ticketStatus: 'OPEN',
        supportTicketId: ticket.id,
        hasLocation: Boolean(location),
      },
    });

    const opsStaff = await this.prisma.user.findMany({
      where: { role: { in: [UserRole.OPS, UserRole.SUPPORT] }, isActive: true },
      select: { id: true },
    });

    for (const staff of opsStaff) {
      void this.notificationsService.enqueue({
        userId: staff.id,
        title: '🚨 SOS – Alerte urgente',
        body: `Trajet ${trip.id} — SOS déclenché par ${auth.user.role === UserRole.RIDER ? 'un passager' : 'un chauffeur'}. Ticket #${ticket.id}.`,
        channel: NotificationChannel.PUSH,
        dedupeKey: `sos:${trip.id}:${staff.id}`,
        data: { type: 'sos_alert', tripId: trip.id, ticketId: ticket.id },
      });
    }

    return {
      sos: {
        tripId: trip.id,
        ticketId: ticket.id,
        priority: 3,
        incidentType: 'SOS_TRIGGERED',
        reportedByRole: auth.user.role,
        status: 'OPEN',
        localEmergencyNumber: '112',
        locationCaptured: Boolean(location),
      },
    };
  }

  async updateStatus(
    auth: RequestAuthContext,
    tripId: string,
    nextStatus: TripStatus,
    cancellationReason?: string,
  ) {
    let cancellationPolicy: TripCancellationPolicy | null = null;
    const updatedTrip = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: {
          id: tripId,
        },
        include: {
          events: {
            orderBy: {
              createdAt: 'asc',
            },
          },
          rider: {
            select: {
              userId: true,
            },
          },
          driver: {
            select: {
              userId: true,
              createdAt: true,
            },
          },
          rideRequest: {
            select: {
              paymentMethod: true,
            },
          },
        },
      });

      if (!trip) {
        throw new NotFoundException('Trip not found.');
      }

      this.assertTripAccess(auth, trip);

      if (
        (nextStatus === 'COMPLETED' || nextStatus === 'CANCELLED') &&
        trip.status === nextStatus
      ) {
        const { rider, driver, rideRequest, ...terminalTrip } = trip;
        return {
          ...terminalTrip,
          riderId: terminalTrip.riderId,
          driverId: terminalTrip.driverId,
          riderUserId: rider?.userId ?? null,
          driverUserId: driver?.userId ?? null,
          driverCreatedAt: driver?.createdAt ?? null,
          paymentMethod: rideRequest?.paymentMethod ?? null,
          alreadyTerminal: true,
        };
      }

      const isRiderEarlyStop =
        auth.user.role === UserRole.RIDER &&
        trip.status === 'IN_PROGRESS' &&
        nextStatus === 'COMPLETED';

      if (
        auth.user.role === UserRole.RIDER &&
        nextStatus !== 'CANCELLED' &&
        !isRiderEarlyStop
      ) {
        throw new BadRequestException(
          'Riders can only cancel before departure or stop an in-progress trip.',
        );
      }

      const transitionDecision = resolveTripStatusTransitionDecision(
        trip.status,
        nextStatus,
        auth.user.role,
      );

      if (!transitionDecision.allowed) {
        throw new BadRequestException(
          `Trip cannot move from ${trip.status} to ${nextStatus}: ${transitionDecision.reason}.`,
        );
      }

      const routeCompletionReview =
        nextStatus === 'COMPLETED' && auth.user.role === UserRole.DRIVER
          ? this.resolveDriverRouteCompletionReview(trip.events, new Date())
          : null;

      const updateData: {
        status: TripStatus;
        startedAt?: Date;
        completedAt?: Date;
        cancelledBy?: 'RIDER' | 'DRIVER' | 'ADMIN' | 'SYSTEM';
        actualFare?: number;
        distanceKm?: number;
      } = {
        status: nextStatus,
      };

      if (nextStatus === 'IN_PROGRESS' && !trip.startedAt) {
        updateData.startedAt = new Date();
      }

      if (nextStatus === 'COMPLETED') {
        updateData.completedAt = new Date();
      }

      const earlyStopFare =
        isRiderEarlyStop ? this.resolveRiderEarlyStopFare(trip) : null;

      if (earlyStopFare) {
        updateData.actualFare = earlyStopFare.adjustedFare;
        if (earlyStopFare.completedDistanceKm !== null) {
          updateData.distanceKm = earlyStopFare.completedDistanceKm;
        }
      }

      if (nextStatus === 'CANCELLED') {
        updateData.cancelledBy = resolveCancellationActor(auth.user.role);
      }

      if (nextStatus === 'CANCELLED' && auth.user.role === UserRole.RIDER) {
        const previousCancellationCount =
          (await tx.trip.count({
            where: {
              riderId: trip.riderId,
              status: 'CANCELLED',
              cancelledBy: 'RIDER',
              updatedAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
              },
            },
          })) ?? 0;
        cancellationPolicy = this.resolveRiderTripCancellationPolicy({
          tripStatus: trip.status,
          actualFare: toAmount(trip.actualFare),
          currency: trip.currency,
          previousCancellationCount,
        });
      }

      if (nextStatus === 'CANCELLED' && auth.user.role === UserRole.DRIVER) {
        const previousCancellationCount =
          (await tx.trip.count({
            where: {
              driverId: trip.driverId,
              status: 'CANCELLED',
              cancelledBy: 'DRIVER',
              updatedAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
              },
            },
          })) ?? 0;
        cancellationPolicy = this.resolveDriverTripCancellationPolicy({
          currency: trip.currency,
          previousCancellationCount,
        });
      }

      const updatedTrip = await tx.trip.update({
        where: {
          id: tripId,
        },
        data: {
          ...updateData,
          events: {
            create: {
              eventType: transitionDecision.eventType,
              payload: {
                status: nextStatus,
                actorRole: auth.user.role,
                ...(nextStatus === 'CANCELLED' && cancellationReason
                  ? { cancellationReason }
                  : {}),
                ...(cancellationPolicy ? { cancellationPolicy } : {}),
                ...(routeCompletionReview ? { routeCompletionReview } : {}),
                ...(earlyStopFare
                  ? {
                      earlyStop: {
                        requestedByRole: auth.user.role,
                        reason: cancellationReason ?? 'RIDER_REQUESTED_STOP',
                        originalFare: earlyStopFare.originalFare,
                        adjustedFare: earlyStopFare.adjustedFare,
                        progressRatio: earlyStopFare.progressRatio,
                        completedDistanceKm: earlyStopFare.completedDistanceKm,
                        remainingDistanceKm: earlyStopFare.remainingDistanceKm,
                      },
                    }
                  : {}),
              },
            },
          },
        },
      });

      if (nextStatus === 'DRIVER_ARRIVING') {
        await tx.rideRequest.update({
          where: {
            id: trip.rideRequestId,
          },
          data: {
            status: 'DRIVER_ARRIVING',
          },
        });
      }

      // Sans ceci, la RideRequest reste bloquee sur un statut actif
      // (DRIVER_ARRIVING) pour toujours apres la fin reelle du trajet,
      // empechant le rider de jamais reserver une nouvelle course differente
      // (bloque par le garde-fou "1 ride request active par rider").
      if (nextStatus === 'COMPLETED') {
        const rideRequestCompletionStatus =
          await this.resolveRideRequestCompletionStatus(tx);

        await tx.rideRequest.update({
          where: {
            id: trip.rideRequestId,
          },
          data: {
            status: rideRequestCompletionStatus,
          },
        });

        if (rideRequestCompletionStatus !== RideRequestStatus.FULFILLED) {
          await tx.auditLog.create({
            data: {
              userId: auth.user.id,
              action: 'RIDE_REQUEST_COMPLETION_STATUS_SCHEMA_FALLBACK',
              entityType: 'RIDE_REQUEST',
              entityId: trip.rideRequestId,
              metadata: {
                tripId,
                requestedStatus: RideRequestStatus.FULFILLED,
                appliedStatus: rideRequestCompletionStatus,
                reason: 'FULFILLED enum value unavailable on database',
              },
            },
          });
        }

        if (trip.rideRequest?.paymentMethod === 'CASH') {
          await tx.trip.update({
            where: {
              id: tripId,
            },
            data: {
              events: {
                create: {
                  eventType: 'CASH_PAYMENT_CONFIRMED',
                  payload: {
                    amount: earlyStopFare?.adjustedFare ?? toAmount(trip.actualFare),
                    currency: trip.currency,
                    collectedByDriverId: trip.driverId,
                    confirmedByRole: auth.user.role,
                    confirmedAt: new Date().toISOString(),
                  },
                },
              },
            },
          });
        }
      }

      if (nextStatus === 'CANCELLED') {
        await tx.rideRequest.update({
          where: {
            id: trip.rideRequestId,
          },
          data: {
            status: 'CANCELLED',
          },
        });
      }

      if (
        nextStatus === 'CANCELLED' &&
        auth.user.role === UserRole.RIDER &&
        cancellationPolicy?.level === 'FEE_RECOMMENDED'
      ) {
        const supportTicketId =
          await this.createRiderTripCancellationSupportTicket(tx, {
            userId: trip.rider?.userId ?? auth.user.id,
            tripId,
            cancellationReason,
            policy: cancellationPolicy,
          });
        cancellationPolicy = {
          ...cancellationPolicy,
          supportTicketId,
        };
      }

      if (
        nextStatus === 'CANCELLED' &&
        auth.user.role === UserRole.DRIVER &&
        cancellationPolicy?.driverReliabilityImpact === 'SUPPORT_REVIEW'
      ) {
        const supportTicketId =
          await this.createDriverTripCancellationSupportTicket(tx, {
            userId: trip.driver?.userId ?? auth.user.id,
            tripId,
            cancellationReason,
            policy: cancellationPolicy,
          });
        cancellationPolicy = {
          ...cancellationPolicy,
          supportTicketId,
        };
      }

      if (trip.driverId) {
        await tx.driverProfile.update({
          where: {
            id: trip.driverId,
          },
          data: this.buildDriverStatusUpdate(nextStatus, cancellationPolicy),
        });
      }

      return {
        ...updatedTrip,
        riderId: trip.riderId,
        driverId: trip.driverId,
        riderUserId: trip.rider?.userId ?? null,
        driverUserId: trip.driver?.userId ?? null,
        driverCreatedAt: trip.driver?.createdAt ?? null,
        paymentMethod: trip.rideRequest?.paymentMethod ?? null,
        alreadyTerminal: false,
      };
    });

    if (!updatedTrip.alreadyTerminal) {
      this.realtimeService.publish({
        channel: 'trip',
        type: 'trip.updated',
        entityId: updatedTrip.id,
        riderId: updatedTrip.riderId,
        driverId: updatedTrip.driverId,
        actorRole: auth.user.role,
        payload: {
          status: nextStatus,
          ...(cancellationPolicy ? { cancellationPolicy } : {}),
        },
      });
    }

    if (updatedTrip.riderUserId && !updatedTrip.alreadyTerminal) {
      if (nextStatus === 'DRIVER_ARRIVING') {
        void this.notificationsService.enqueue({
          userId: updatedTrip.riderUserId,
          title: 'Votre chauffeur est arrivé !',
          body: 'Votre chauffeur vous attend au point de prise en charge.',
          channel: NotificationChannel.PUSH,
          dedupeKey: `driver_arriving:${tripId}`,
          data: { type: 'driver_arriving', tripId },
        });
      } else if (nextStatus === 'COMPLETED') {
        // Notification passager — reçu immédiat avec montant
        const fareDisplay = updatedTrip.actualFare
          ? `${Number(updatedTrip.actualFare).toLocaleString('fr-BF')} XOF`
          : '';
        void this.notificationsService.enqueue({
          userId: updatedTrip.riderUserId,
          title: `Course terminée${fareDisplay ? ` — ${fareDisplay}` : ''}`,
          body: `Votre trajet s'est bien passé. Évaluez votre chauffeur pour aider la communauté Orbi !`,
          channel: NotificationChannel.PUSH,
          dedupeKey: `trip_completed:${tripId}`,
          data: { type: 'trip_completed', tripId },
        });

        // Notification chauffeur — confirmation du gain net
        const driverUserId = updatedTrip.driverUserId;
        if (driverUserId) {
          void this.notificationsService.enqueue({
            userId: driverUserId,
            title: 'Trajet terminé — bon travail !',
            body: `Votre course a été validée. Consultez vos revenus pour le détail du payout.`,
            channel: NotificationChannel.PUSH,
            dedupeKey: `trip_completed_driver:${tripId}`,
            data: { type: 'trip_completed', tripId },
          });
        }
      }
    }

    const grossFare = toAmount(updatedTrip.actualFare);
    const driverEconomics =
      grossFare > 0
        ? calculateDriverEconomics(grossFare, {
            driverCreatedAt:
              updatedTrip.driverCreatedAt ??
              auth.user.driverProfile?.createdAt,
          })
        : null;

    return serializeTripLifecycle({
      ...updatedTrip,
      rideRequest: { paymentMethod: updatedTrip.paymentMethod },
      driverPayout: driverEconomics?.driverPayout ?? null,
      platformFee: driverEconomics?.commissionAmount ?? null,
      commissionRate: driverEconomics?.commissionRate ?? null,
      cancellationPolicy,
    });
  }

  private async resolveRideRequestCompletionStatus(
    tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  ): Promise<RideRequestStatus> {
    try {
      const enumRows = await tx.$queryRaw<Array<{ enumlabel: string }>>`
        SELECT enumlabel
        FROM pg_enum
        WHERE enumtypid = '"RideRequestStatus"'::regtype
      `;

      return enumRows.some((row) => row.enumlabel === RideRequestStatus.FULFILLED)
        ? RideRequestStatus.FULFILLED
        : RideRequestStatus.EXPIRED;
    } catch {
      return RideRequestStatus.FULFILLED;
    }
  }

  private resolveRiderTripCancellationPolicy(input: {
    tripStatus: TripStatus;
    actualFare: number;
    currency: string;
    previousCancellationCount: number;
  }): TripCancellationPolicy {
    const recentCancellationCount = input.previousCancellationCount + 1;
    const baseSuggestedFee =
      input.tripStatus === TripStatus.DRIVER_ARRIVING
        ? 300
        : input.tripStatus === TripStatus.MATCHED
          ? 200
          : 0;
    const repeatAdjustment = recentCancellationCount >= 3 ? 100 : 0;
    const suggestedFeeAmount =
      baseSuggestedFee > 0
        ? Math.min(500, baseSuggestedFee + repeatAdjustment)
        : 0;
    const driverCompensationAmount =
      suggestedFeeAmount > 0 ? Math.floor(suggestedFeeAmount * 0.8) : 0;

    if (suggestedFeeAmount > 0) {
      return {
        actor: 'RIDER',
        level: 'FEE_RECOMMENDED',
        suggestedFeeAmount,
        driverCompensationAmount,
        currency: input.currency,
        recentCancellationCount,
        message:
          `Annulation apres chauffeur mobilise. Revue support ouverte: frais suggere ${suggestedFeeAmount} XOF, ` +
          `${driverCompensationAmount} XOF pour proteger le chauffeur si le contexte le confirme.`,
      };
    }

    if (recentCancellationCount >= 3) {
      return {
        actor: 'RIDER',
        level: 'REVIEW',
        suggestedFeeAmount: 0,
        driverCompensationAmount: 0,
        currency: input.currency,
        recentCancellationCount,
        message:
          'Annulations repetees detectees. Le support peut revoir les prochaines annulations apres assignation chauffeur.',
      };
    }

    return {
      actor: 'RIDER',
      level: 'CLEAR',
      suggestedFeeAmount: 0,
      driverCompensationAmount: 0,
      currency: input.currency,
      recentCancellationCount,
      message: 'Annulation prise en compte sans frais.',
    };
  }

  private resolveDriverTripCancellationPolicy(input: {
    currency: string;
    previousCancellationCount: number;
  }): TripCancellationPolicy {
    const recentCancellationCount = input.previousCancellationCount + 1;

    if (recentCancellationCount >= 3) {
      return {
        actor: 'DRIVER',
        level: 'REVIEW',
        suggestedFeeAmount: 0,
        driverCompensationAmount: 0,
        currency: input.currency,
        recentCancellationCount,
        driverReliabilityImpact: 'SUPPORT_REVIEW',
        temporaryPauseMinutes: 30,
        message:
          'Annulations chauffeur repetees detectees. Revue support ouverte et pause operationnelle recommandee avant nouvelles offres.',
      };
    }

    if (recentCancellationCount === 2) {
      return {
        actor: 'DRIVER',
        level: 'DRIVER_WARNING',
        suggestedFeeAmount: 0,
        driverCompensationAmount: 0,
        currency: input.currency,
        recentCancellationCount,
        driverReliabilityImpact: 'AT_RISK',
        temporaryPauseMinutes: 0,
        message:
          'Deuxieme annulation chauffeur recente. Les prochaines annulations apres acceptation peuvent limiter temporairement les offres.',
      };
    }

    return {
      actor: 'DRIVER',
      level: 'CLEAR',
      suggestedFeeAmount: 0,
      driverCompensationAmount: 0,
      currency: input.currency,
      recentCancellationCount,
      driverReliabilityImpact: 'WATCH',
      temporaryPauseMinutes: 0,
      message:
        'Annulation chauffeur enregistree. Gardez les annulations exceptionnelles pour proteger la confiance rider.',
    };
  }

  private async createRiderTripCancellationSupportTicket(
    tx: Pick<PrismaService, 'supportTicket'>,
    input: {
      userId: string;
      tripId: string;
      cancellationReason?: string;
      policy: TripCancellationPolicy;
    },
  ) {
    try {
      const ticket = await tx.supportTicket.create({
        data: {
          userId: input.userId,
          subject: `Revue frais annulation course ${input.tripId}`,
          description:
            `Annulation rider apres chauffeur mobilise. Course: ${input.tripId}. ` +
            `Frais suggere: ${input.policy.suggestedFeeAmount} ${input.policy.currency}. ` +
            `Compensation chauffeur suggeree: ${input.policy.driverCompensationAmount} ${input.policy.currency}. ` +
            `Annulations rider sur 24h: ${input.policy.recentCancellationCount}. ` +
            `Motif rider: ${input.cancellationReason ?? 'non renseigne'}.`,
          priority: 2,
        },
        select: {
          id: true,
        },
      });

      return ticket.id;
    } catch {
      return null;
    }
  }

  private async createDriverTripCancellationSupportTicket(
    tx: Pick<PrismaService, 'supportTicket'>,
    input: {
      userId: string;
      tripId: string;
      cancellationReason?: string;
      policy: TripCancellationPolicy;
    },
  ) {
    try {
      const ticket = await tx.supportTicket.create({
        data: {
          userId: input.userId,
          subject: `Revue annulations chauffeur ${input.tripId}`,
          description:
            `Annulations chauffeur repetees apres acceptation. Course: ${input.tripId}. ` +
            `Annulations chauffeur sur 24h: ${input.policy.recentCancellationCount}. ` +
            `Impact fiabilite: ${input.policy.driverReliabilityImpact ?? 'WATCH'}. ` +
            `Pause recommandee: ${input.policy.temporaryPauseMinutes ?? 0} minutes. ` +
            `Motif chauffeur: ${input.cancellationReason ?? 'non renseigne'}.`,
          priority: 2,
        },
        select: {
          id: true,
        },
      });

      return ticket.id;
    } catch {
      return null;
    }
  }

  async rateTrip(
    auth: RequestAuthContext,
    tripId: string,
    payload: { score: number; comment?: string },
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { rider: true, driver: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found.');
    }

    this.assertTripAccess(auth, trip);

    if (trip.status !== TripStatus.COMPLETED) {
      throw new BadRequestException('Seules les courses terminees peuvent etre notees.');
    }

    const riderId = trip.riderId;
    const driverId = trip.driverId;

    const existing = await this.prisma.rating.findFirst({
      where: {
        tripId,
        riderId,
      },
    });

    if (existing) {
      throw new BadRequestException('Cette course a deja ete notee.');
    }

    const rating = await this.prisma.$transaction(async (tx) => {
      const newRating = await tx.rating.create({
        data: {
          tripId,
          riderId,
          driverId,
          score: payload.score,
          comment: payload.comment ?? null,
        },
      });

      const stats = await tx.rating.aggregate({
        where: { driverId },
        _avg: { score: true },
        _count: { score: true },
      });

      const newAverage = stats._avg.score;

      if (newAverage !== null) {
        await tx.driverProfile.update({
          where: { id: driverId },
          data: { averageRating: newAverage },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'TRIP_RATED',
          entityType: 'TRIP',
          entityId: tripId,
          metadata: {
            score: payload.score,
            hasComment: Boolean(payload.comment),
            driverId,
            newAverage: newAverage ?? null,
          },
        },
      });

      const qualityReviewTicket =
        payload.score <= 2
          ? await tx.supportTicket.create({
              data: {
                userId: auth.user.id,
                subject: `Revue qualite course ${tripId}`,
                description:
                  `Note faible recue apres course. Course: ${tripId}. ` +
                  `Score: ${payload.score}/5. ` +
                  `Chauffeur: ${driverId}. ` +
                  `Commentaire rider: ${payload.comment?.trim() || 'non renseigne'}.`,
                priority: payload.score <= 1 ? 3 : 2,
              },
              select: {
                id: true,
                priority: true,
              },
            })
          : null;

      if (qualityReviewTicket) {
        await tx.auditLog.create({
          data: {
            userId: auth.user.id,
            action: 'TRIP_LOW_RATING_QUALITY_REVIEW_OPENED',
            entityType: 'TRIP',
            entityId: tripId,
            metadata: {
              ratingId: newRating.id,
              score: payload.score,
              driverId,
              supportTicketId: qualityReviewTicket.id,
              priority: qualityReviewTicket.priority,
            },
          },
        });
      }

      return { rating: newRating, qualityReviewTicket };
    });

    if (rating.qualityReviewTicket) {
      this.realtimeService.publish({
        channel: 'admin',
        type: 'support-ticket.updated',
        entityId: rating.qualityReviewTicket.id,
        actorRole: auth.user.role,
        payload: {
          category: 'quality_review',
          tripId,
          score: payload.score,
          priority: rating.qualityReviewTicket.priority,
        },
      });
    }

    return {
      rating: {
        id: rating.rating.id,
        tripId: rating.rating.tripId,
        score: rating.rating.score,
        comment: rating.rating.comment,
        createdAt: rating.rating.createdAt.toISOString(),
      },
      qualityReview: rating.qualityReviewTicket
        ? {
            ticketId: rating.qualityReviewTicket.id,
            priority: rating.qualityReviewTicket.priority,
            message:
              'Votre note a ouvert une revue qualite. Le support peut verifier ce trajet.',
          }
        : null,
    };
  }

  async dashboard() {
    const [activeTrips, recentTrips] = await Promise.all([
      this.prisma.trip.count({
        where: {
          status: {
            in: ACTIVE_TRIP_STATUSES,
          },
        },
      }),
      this.prisma.trip.findMany({
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          rider: {
            include: {
              user: true,
            },
          },
          driver: {
            include: {
              user: true,
            },
          },
          vehicle: true,
        },
      }),
    ]);

    return {
      activeTrips,
      recentTrips,
    };
  }

  async findMine(auth: RequestAuthContext) {
    if (auth.user.role === UserRole.RIDER) {
      const riderProfileId = auth.user.riderProfile?.id;

      if (!riderProfileId) {
        throw new NotFoundException(
          'No rider profile found for the authenticated user.',
        );
      }

      const [
        pendingRequests,
        trips,
        activeTrips,
        completedTrips,
        cancelledTrips,
      ] = await Promise.all([
        this.prisma.rideRequest.findMany({
          where: {
            riderId: riderProfileId,
            status: {
              in: [...ACTIVE_RIDE_REQUEST_STATUSES],
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 8,
        }),
        this.prisma.trip.findMany({
          where: {
            riderId: riderProfileId,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 12,
          include: {
            driver: {
              include: {
                user: true,
              },
            },
            events: {
              orderBy: {
                createdAt: 'asc',
              },
            },
            vehicle: true,
          },
        }),
        this.prisma.trip.count({
          where: {
            riderId: riderProfileId,
            status: {
              in: ACTIVE_TRIP_STATUSES,
            },
          },
        }),
        this.prisma.trip.count({
          where: {
            riderId: riderProfileId,
            status: 'COMPLETED',
          },
        }),
        this.prisma.trip.count({
          where: {
            riderId: riderProfileId,
            status: 'CANCELLED',
          },
        }),
      ]);

      return {
        role: auth.user.role,
        stats: {
          activeTrips,
          completedTrips,
          cancelledTrips,
          totalAmount: trips.reduce(
            (sum, trip) => sum + roundXofForCashOperations(toAmount(trip.actualFare)).amount,
            0,
          ),
          currency: 'XOF',
        },
        pendingRequests: pendingRequests.map((request) => ({
          id: request.id,
          pickupAddress: request.pickupAddress,
          destinationAddress: request.destinationAddress,
          estimatedFare: roundXofForCashOperations(toAmount(request.estimatedFare)).amount,
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
      throw new NotFoundException(
        'No driver profile found for the authenticated user.',
      );
    }

    const [trips, activeTrips, completedTrips, cancelledTrips] =
      await Promise.all([
        this.prisma.trip.findMany({
          where: {
            driverId: driverProfileId,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 12,
          include: {
            rider: {
              include: {
                user: true,
              },
            },
            events: {
              orderBy: {
                createdAt: 'asc',
              },
            },
            vehicle: true,
          },
        }),
        this.prisma.trip.count({
          where: {
            driverId: driverProfileId,
            status: {
              in: ACTIVE_TRIP_STATUSES,
            },
          },
        }),
        this.prisma.trip.count({
          where: {
            driverId: driverProfileId,
            status: 'COMPLETED',
          },
        }),
        this.prisma.trip.count({
          where: {
            driverId: driverProfileId,
            status: 'CANCELLED',
          },
        }),
      ]);

    const recentTrips = trips.map((trip) => ({
      ...serializeTripHistoryItem(trip, { viewerRole: auth.user.role }),
      amount: calculateDriverEconomics(toAmount(trip.actualFare), {
        driverCreatedAt: auth.user.driverProfile?.createdAt,
      }).driverPayout,
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
      where: {
        id: tripId,
      },
      include: {
        rider: {
          include: {
            user: true,
          },
        },
        driver: {
          include: {
            user: true,
            onboardingDocuments: {
              where: {
                type: DriverDocumentType.SELFIE_VERIFICATION,
                status: DriverDocumentStatus.APPROVED,
              },
              orderBy: {
                uploadedAt: 'desc',
              },
              take: 1,
            },
          },
        },
        vehicle: true,
        rideRequest: true,
        events: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found.');
    }

    return trip;
  }

  private async assertDriverFatigueAllowsNewTrip(
    auth: RequestAuthContext,
    driverProfileId: string,
    now: Date,
  ) {
    const since = new Date(
      now.getTime() - driverFatigueWindowHours * 60 * 60 * 1000,
    );
    const trips = await this.prisma.trip.findMany({
      where: {
        driverId: driverProfileId,
        status: 'COMPLETED',
        completedAt: {
          gte: since,
        },
      },
      select: {
        id: true,
        startedAt: true,
        completedAt: true,
      },
      orderBy: {
        completedAt: 'desc',
      },
    });
    const fatigue = evaluateDriverFatigue({
      now,
      trips,
    });

    if (fatigue.state !== 'blocked') {
      return;
    }

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_FATIGUE_TRIP_ACCEPTANCE_BLOCKED',
        entityType: 'DRIVER_PROFILE',
        entityId: driverProfileId,
        metadata: {
          completedTrips: fatigue.completedTrips,
          drivingMinutes: fatigue.drivingMinutes,
          restUntil: fatigue.restUntil?.toISOString() ?? null,
        },
      },
    });

    throw new BadRequestException(
      `Pause chauffeur requise jusqu a ${fatigue.restUntil?.toISOString()}.`,
    );
  }

  private evaluateRouteMonitoringAlerts(input: {
    trip: {
      status: TripStatus;
      createdAt: Date;
      distanceKm: unknown;
      durationMinutes: number | null;
      rideRequest: {
        pickupLatitude: unknown;
        pickupLongitude: unknown;
        destinationLatitude: unknown;
        destinationLongitude: unknown;
      };
      events: Array<{
        eventType: string;
        payload?: unknown;
        createdAt: Date;
      }>;
    };
    position: {
      latitude: number;
      longitude: number;
      speedKph: number | null;
      distanceToDestinationKm: number | null;
    };
    observedAt: Date;
  }) {
    const previousPositions = input.trip.events
      .filter((event) => event.eventType === 'ROUTE_POSITION_RECORDED')
      .map(getRoutePositionPayload)
      .filter((position): position is NonNullable<typeof position> =>
        Boolean(position),
      );
    const previousPosition = previousPositions.at(-1);
    const alerts: Array<{
      alertType:
        | 'LONG_STOP'
        | 'ROUTE_DEVIATION'
        | 'NO_PROGRESS'
        | 'GPS_POSITION_ANOMALY'
        | 'PICKUP_MISMATCH';
      severity: 'warning' | 'critical';
      priority: 2 | 3;
      message: string;
      measuredValue: number;
      threshold: number;
    }> = [];

    if (previousPosition) {
      const elapsedMinutes =
        (input.observedAt.getTime() - previousPosition.createdAt.getTime()) /
        60000;
      const movementKm = haversineKm(previousPosition, input.position);

      if (
        elapsedMinutes > 0 &&
        elapsedMinutes < gpsAnomalyMaxGapMinutes &&
        movementKm >= gpsAnomalyMinDistanceKm
      ) {
        const impliedSpeedKph = movementKm / (elapsedMinutes / 60);

        if (impliedSpeedKph > gpsAnomalyMaxImpliedSpeedKph) {
          alerts.push({
            alertType: 'GPS_POSITION_ANOMALY',
            severity: 'critical',
            priority: 3,
            message: `Position suspecte detectee: deplacement de ${Math.round(movementKm)} km en ${Math.round(elapsedMinutes * 60)}s implique ${Math.round(impliedSpeedKph)} km/h.`,
            measuredValue: Math.round(impliedSpeedKph),
            threshold: gpsAnomalyMaxImpliedSpeedKph,
          });
        }
      }

      if (
        elapsedMinutes >= routeStopMinutesThreshold &&
        movementKm < 0.12 &&
        (input.position.speedKph ?? previousPosition.speedKph ?? 0) < 4
      ) {
        alerts.push({
          alertType: 'LONG_STOP',
          severity: 'warning',
          priority: 2,
          message: `Arret anormal detecte: ${Math.round(elapsedMinutes)} minutes sans mouvement significatif.`,
          measuredValue: Math.round(elapsedMinutes),
          threshold: routeStopMinutesThreshold,
        });
      }

      if (
        elapsedMinutes >= routeNoProgressMinutesThreshold &&
        input.position.distanceToDestinationKm !== null &&
        previousPosition.distanceToDestinationKm !== null
      ) {
        const progressKm =
          previousPosition.distanceToDestinationKm -
          input.position.distanceToDestinationKm;

        if (progressKm < routeMinimumProgressKm) {
          alerts.push({
            alertType: 'NO_PROGRESS',
            severity: 'warning',
            priority: 2,
            message: `Progression insuffisante vers destination: ${Math.max(0, Math.round(progressKm * 100) / 100)} km.`,
            measuredValue: Math.round(progressKm * 100) / 100,
            threshold: routeMinimumProgressKm,
          });
        }
      }
    }

    const pickupLatitude = toNumber(input.trip.rideRequest.pickupLatitude);
    const pickupLongitude = toNumber(input.trip.rideRequest.pickupLongitude);
    const destinationLatitude = toNumber(
      input.trip.rideRequest.destinationLatitude,
    );
    const destinationLongitude = toNumber(
      input.trip.rideRequest.destinationLongitude,
    );

    if (
      pickupLatitude !== null &&
      pickupLongitude !== null &&
      destinationLatitude !== null &&
      destinationLongitude !== null
    ) {
      const distanceToPickupKm = haversineKm(input.position, {
        latitude: pickupLatitude,
        longitude: pickupLongitude,
      });

      if (input.trip.status === TripStatus.MATCHED) {
        const matchedAgeMinutes =
          (input.observedAt.getTime() - input.trip.createdAt.getTime()) / 60000;

        if (
          matchedAgeMinutes >= pickupMismatchGraceMinutes &&
          distanceToPickupKm >= pickupMismatchDistanceKmThreshold
        ) {
          alerts.push({
            alertType: 'PICKUP_MISMATCH',
            severity: 'warning',
            priority: 2,
            message: `Pickup suspect: chauffeur encore a ${Math.round(distanceToPickupKm * 10) / 10} km du point de depart apres ${Math.round(matchedAgeMinutes)} minutes.`,
            measuredValue: Math.round(distanceToPickupKm * 100) / 100,
            threshold: pickupMismatchDistanceKmThreshold,
          });
        }
      }

      const deviationKm = distanceToRouteKm(
        input.position,
        { latitude: pickupLatitude, longitude: pickupLongitude },
        { latitude: destinationLatitude, longitude: destinationLongitude },
      );

      if (deviationKm >= routeDeviationKmThreshold) {
        alerts.push({
          alertType: 'ROUTE_DEVIATION',
          severity: 'critical',
          priority: 3,
          message: `Deviation route probable: ${Math.round(deviationKm * 10) / 10} km hors corridor.`,
          measuredValue: Math.round(deviationKm * 100) / 100,
          threshold: routeDeviationKmThreshold,
        });
      }
    }

    return alerts;
  }

  private async findRideRequestOrThrow(rideRequestId: string) {
    const rideRequest = await this.prisma.rideRequest.findUnique({
      where: {
        id: rideRequestId,
      },
    });

    if (!rideRequest) {
      throw new NotFoundException('Ride request not found.');
    }

    return rideRequest;
  }

  // Centralizing access checks keeps rider/driver/admin rules consistent across
  // detail, cancellation, incident, and lifecycle endpoints.
  private assertTripAccess(
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

  private assertDriverOwnsTrip(auth: RequestAuthContext, tripDriverId: string) {
    if (tripDriverId !== auth.user.driverProfile?.id) {
      throw new BadRequestException(
        'This trip does not belong to the authenticated driver.',
      );
    }
  }

  private resolveDriverRouteCompletionReview(
    events: Array<{
      eventType: string;
      payload?: unknown;
      createdAt: Date;
    }>,
    now: Date,
  ) {
    const latestPosition = resolveLatestDriverRoutePosition(events);

    if (!latestPosition) {
      return {
        level: 'GPS_SIGNAL_MISSING',
        message: 'Course terminee sans signal GPS chauffeur recent.',
      };
    }

    const signalAgeMinutes =
      (now.getTime() - latestPosition.createdAt.getTime()) / 60000;

    if (signalAgeMinutes > routeCompletionMaxSignalAgeMinutes) {
      return {
        level: 'GPS_SIGNAL_STALE',
        ageMinutes: Math.round(signalAgeMinutes),
        message: 'Course terminee avec signal GPS chauffeur ancien.',
      };
    }

    if (
      typeof latestPosition.accuracyMeters === 'number' &&
      latestPosition.accuracyMeters > routeCompletionMaxAccuracyMeters
    ) {
      return {
        level: 'GPS_ACCURACY_LOW',
        accuracyMeters: Math.round(latestPosition.accuracyMeters),
        message: 'Course terminee avec precision GPS faible.',
      };
    }

    if (
      typeof latestPosition.speedKph === 'number' &&
      latestPosition.speedKph > routeCompletionMaxSpeedKph
    ) {
      return {
        level: 'GPS_SPEED_ANOMALY',
        speedKph: Math.round(latestPosition.speedKph),
        message: 'Course terminee avec anomalie de vitesse GPS.',
      };
    }

    if (hasCriticalRouteMonitoringAlert(events)) {
      return {
        level: 'ROUTE_MONITORING_CRITICAL',
        message: 'Course terminee avec alerte route critique existante.',
      };
    }

    return null;
  }

  private resolveRiderEarlyStopFare(trip: {
    actualFare: unknown;
    distanceKm: unknown;
    events: Array<{
      eventType: string;
      payload?: unknown;
      createdAt: Date;
    }>;
  }) {
    const originalFare = toAmount(trip.actualFare);
    const plannedDistanceKm = toAmount(trip.distanceKm);
    const latestPosition = resolveLatestDriverRoutePosition(trip.events);
    const remainingDistanceKm =
      typeof latestPosition?.distanceToDestinationKm === 'number' &&
      Number.isFinite(latestPosition.distanceToDestinationKm)
        ? Math.max(0, latestPosition.distanceToDestinationKm)
        : null;

    if (originalFare <= 0 || plannedDistanceKm <= 0 || remainingDistanceKm === null) {
      return {
        originalFare,
        adjustedFare: originalFare,
        progressRatio: 1,
        completedDistanceKm: null,
        remainingDistanceKm,
      };
    }

    const completedDistanceKm = Math.max(
      0,
      plannedDistanceKm - Math.min(plannedDistanceKm, remainingDistanceKm),
    );
    const progressRatio = Math.min(
      1,
      Math.max(0.35, completedDistanceKm / plannedDistanceKm),
    );
    const adjustedFare = Math.min(
      originalFare,
      roundXofForCashOperations(originalFare * progressRatio).amount,
    );

    return {
      originalFare,
      adjustedFare,
      progressRatio: Number(progressRatio.toFixed(3)),
      completedDistanceKm: Number(Math.max(0.1, completedDistanceKm).toFixed(2)),
      remainingDistanceKm: Number(remainingDistanceKm.toFixed(2)),
    };
  }

  private buildDriverStatusUpdate(
    nextStatus: TripStatus,
    cancellationPolicy: TripCancellationPolicy | null = null,
  ) {
    if (nextStatus === 'COMPLETED') {
      return {
        status: 'ONLINE' as const,
        completedTripsCount: { increment: 1 },
      };
    }

    if (nextStatus === 'CANCELLED') {
      if (
        cancellationPolicy?.actor === 'DRIVER' &&
        cancellationPolicy.driverReliabilityImpact === 'SUPPORT_REVIEW'
      ) {
        return { status: 'OFFLINE' as const };
      }

      return { status: 'ONLINE' as const };
    }

    return { status: 'BUSY' as const };
  }
}
