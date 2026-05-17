import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Prisma, TripStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import type { RequestAuthContext } from '../auth/auth.types';
import {
  ACTIVE_RIDE_REQUEST_STATUSES,
  ACTIVE_TRIP_STATUSES,
  ALLOWED_TRIP_TRANSITIONS,
  TRIP_EVENT_BY_STATUS,
  TRIP_EVENT_LABELS,
  resolveCancellationActor,
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
import { extractPickupCode, generatePickupCode, toAmount } from './trips.utils';
import {
  driverFatigueWindowHours,
  evaluateDriverFatigue,
} from '../drivers/driver-fatigue.policy';

const tripShareLinkTtlMinutes = 120;
const routeMonitoringAlertCooldownMinutes = 15;
const safetySosCooldownMinutes = 2;
const safetyIncidentCooldownMinutes = 2;
const routeStopMinutesThreshold = 8;
const routeNoProgressMinutesThreshold = 10;
const routeDeviationKmThreshold = 0.75;
const routeMinimumProgressKm = 0.2;

function hashShareToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
    distanceToDestinationKm: toNumber(payload.distanceToDestinationKm),
    speedKph: toNumber(payload.speedKph),
    createdAt: event.createdAt,
  };
}

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async getTripDetail(auth: RequestAuthContext, tripId: string) {
    const trip = await this.findTripWithDetail(tripId);
    this.assertTripAccess(auth, trip);
    return serializeTripDetail(trip);
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
              label:
                TRIP_EVENT_LABELS[lastEvent.eventType] ?? lastEvent.eventType,
              createdAt: lastEvent.createdAt.toISOString(),
            }
          : null,
        expiresAt:
          typeof sharePayload.expiresAt === 'string'
            ? sharePayload.expiresAt
            : null,
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

        const alerts = this.evaluateRouteMonitoringAlerts({
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
    const { trip, pickupCode } = await this.prisma.$transaction(async (tx) => {
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

      const pickupCode = generatePickupCode();

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
              {
                eventType: 'PICKUP_CODE_ISSUED',
                payload: {
                  pickupCode,
                },
              },
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

      await tx.driverProfile.update({
        where: {
          id: driverProfileId,
        },
        data: {
          status: 'BUSY',
        },
      });

      return {
        trip,
        pickupCode,
      };
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

    return serializeTripLifecycle({
      ...trip,
      pickupCode,
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
      throw new BadRequestException('Pickup code is invalid.');
    }

    const updatedTrip = await this.prisma.trip.update({
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
              pickupCode,
            },
          },
        },
      },
      include: {
        events: true,
      },
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
      pickupCode: expectedPickupCode,
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
    const evidence =
      payload.evidenceConsent && payload.evidenceType
        ? {
            consent: true,
            type: payload.evidenceType,
            retentionHours: payload.evidenceRetentionHours ?? 24,
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
              storagePolicy: evidence.storagePolicy,
            }
          : {
              declared: false,
              type: null,
              retentionHours: null,
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
  ) {
    const updatedTrip = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: {
          id: tripId,
        },
      });

      if (!trip) {
        throw new NotFoundException('Trip not found.');
      }

      this.assertTripAccess(auth, trip);

      if (auth.user.role === UserRole.RIDER && nextStatus !== 'CANCELLED') {
        throw new BadRequestException(
          'Riders can only cancel a trip from the app.',
        );
      }

      if (!ALLOWED_TRIP_TRANSITIONS[trip.status].includes(nextStatus)) {
        throw new BadRequestException(
          `Trip cannot move from ${trip.status} to ${nextStatus}.`,
        );
      }

      const updateData: {
        status: TripStatus;
        startedAt?: Date;
        completedAt?: Date;
        cancelledBy?: 'RIDER' | 'DRIVER' | 'ADMIN' | 'SYSTEM';
      } = {
        status: nextStatus,
      };

      if (nextStatus === 'IN_PROGRESS' && !trip.startedAt) {
        updateData.startedAt = new Date();
      }

      if (nextStatus === 'COMPLETED') {
        updateData.completedAt = new Date();
      }

      if (nextStatus === 'CANCELLED') {
        updateData.cancelledBy = resolveCancellationActor(auth.user.role);
      }

      const statusEventType =
        TRIP_EVENT_BY_STATUS[nextStatus as keyof typeof TRIP_EVENT_BY_STATUS];

      const updatedTrip = await tx.trip.update({
        where: {
          id: tripId,
        },
        data: {
          ...updateData,
          events: {
            create: {
              eventType: statusEventType,
              payload: {
                status: nextStatus,
                actorRole: auth.user.role,
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

      if (trip.driverId) {
        await tx.driverProfile.update({
          where: {
            id: trip.driverId,
          },
          data: this.buildDriverStatusUpdate(nextStatus),
        });
      }

      return {
        ...updatedTrip,
        riderId: trip.riderId,
        driverId: trip.driverId,
      };
    });

    this.realtimeService.publish({
      channel: 'trip',
      type: 'trip.updated',
      entityId: updatedTrip.id,
      riderId: updatedTrip.riderId,
      driverId: updatedTrip.driverId,
      actorRole: auth.user.role,
      payload: {
        status: nextStatus,
      },
    });

    return serializeTripLifecycle(updatedTrip);
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
            (sum, trip) => sum + toAmount(trip.actualFare),
            0,
          ),
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
          ...serializeTripHistoryItem(trip),
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
      ...serializeTripHistoryItem(trip),
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
      alertType: 'LONG_STOP' | 'ROUTE_DEVIATION' | 'NO_PROGRESS';
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

  private assertDriverOwnsTrip(auth: RequestAuthContext, tripDriverId: string) {
    if (tripDriverId !== auth.user.driverProfile?.id) {
      throw new BadRequestException(
        'This trip does not belong to the authenticated driver.',
      );
    }
  }

  private buildDriverStatusUpdate(nextStatus: TripStatus) {
    if (nextStatus === 'COMPLETED') {
      return {
        status: 'ONLINE' as const,
        completedTripsCount: { increment: 1 },
      };
    }

    if (nextStatus === 'CANCELLED') {
      return { status: 'ONLINE' as const };
    }

    return { status: 'BUSY' as const };
  }
}
