import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DriverStatus,
  Prisma,
  ServiceTier,
  VerificationStatus,
  VehicleType,
} from '@prisma/client';
import {
  calculateDistanceKm,
  hasDefinedCoordinates,
} from '../../common/geo/route-metrics';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { PricingService } from '../pricing/pricing.service';
import { ACTIVE_TRIP_STATUSES } from '../trips/trips.constants';
import {
  calculateDispatchScore,
  calculateOfferConfidenceScore,
  DISPATCH_DECLINE_COOLDOWN_MINUTES,
  DISPATCH_LEARNING_SETTING_KEY,
  DISPATCH_SIGNAL_HALF_LIFE_HOURS,
  DISPATCH_SIGNAL_LOOKBACK_HOURS,
  evaluateDispatchBehaviorSignal,
  isPeakTrafficWindow,
  MAX_ASSIGNED_OFFERS,
  MAX_DISPATCH_SIGNAL_EVENTS,
  resolveAssignmentWindowMs,
  resolveDispatchRoadCondition,
  resolveDispatchTrafficLevel,
  resolveDispatchZone,
  resolveOfferConfidenceLabel,
  type DispatchAuditAction,
  type DispatchBehaviorAuditEvent,
  type DispatchLearningSettingsSnapshot,
  type DispatchLearningSettingsValues,
} from './dispatch-engine';
import {
  DriverOfferProjector,
  type DriverOfferViewModel,
} from './driver-offer-projector';

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function roundDistance(value: number | null) {
  if (value === null) {
    return null;
  }

  return Math.round(value * 10) / 10;
}

@Injectable()
export class DispatchCoordinator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
    private readonly pricingService: PricingService,
    private readonly configService: ConfigService,
    private readonly driverOfferProjector: DriverOfferProjector,
  ) {}

  async getDispatchLearningSettings(): Promise<DispatchLearningSettingsSnapshot> {
    const defaults = this.getDefaultDispatchLearningSettings();
    const persistedSetting = await this.prisma.systemSetting.findUnique({
      where: {
        key: DISPATCH_LEARNING_SETTING_KEY,
      },
      select: {
        value: true,
        updatedAt: true,
        updatedByUserId: true,
        updatedByName: true,
        updatedByRole: true,
      },
    });

    const overrides = this.normalizeDispatchLearningOverrides(
      this.extractDispatchLearningOverrides(persistedSetting?.value ?? null),
      defaults,
    );

    return this.buildDispatchLearningSettingsSnapshot(
      defaults,
      overrides,
      persistedSetting
        ? {
            updatedAt: persistedSetting.updatedAt.toISOString(),
            updatedBy: persistedSetting.updatedByUserId
              ? {
                  id: persistedSetting.updatedByUserId,
                  name: persistedSetting.updatedByName ?? null,
                  role: persistedSetting.updatedByRole ?? null,
                }
              : null,
          }
        : null,
    );
  }

  async updateDispatchLearningSettings(input: {
    lookbackHours?: number;
    halfLifeHours?: number;
    declineCooldownMinutes?: number;
    historyLimit?: number;
    resetToDefaults?: boolean;
    actor: {
      id: string;
      name?: string | null;
      role?: string | null;
    };
  }): Promise<DispatchLearningSettingsSnapshot> {
    const defaults = this.getDefaultDispatchLearningSettings();
    const currentSettings = await this.getDispatchLearningSettings();
    const nextOverrides: Partial<DispatchLearningSettingsValues> =
      input.resetToDefaults
        ? {}
        : {
            ...(currentSettings.source === 'DATABASE_OVERRIDE'
              ? this.extractOverridesFromSnapshot(currentSettings, defaults)
              : {}),
          };

    if (input.lookbackHours !== undefined) {
      nextOverrides.lookbackHours = input.lookbackHours;
    }

    if (input.halfLifeHours !== undefined) {
      nextOverrides.halfLifeHours = input.halfLifeHours;
    }

    if (input.declineCooldownMinutes !== undefined) {
      nextOverrides.declineCooldownMinutes = input.declineCooldownMinutes;
    }

    if (input.historyLimit !== undefined) {
      nextOverrides.historyLimit = input.historyLimit;
    }

    const normalizedOverrides = this.normalizeDispatchLearningOverrides(
      nextOverrides,
      defaults,
    );
    const overrideMeta = {
      updatedAt: new Date().toISOString(),
      updatedBy: {
        id: input.actor.id,
        name: input.actor.name ?? null,
        role: input.actor.role ?? null,
      },
    };

    await this.prisma.systemSetting.upsert({
      where: {
        key: DISPATCH_LEARNING_SETTING_KEY,
      },
      create: {
        key: DISPATCH_LEARNING_SETTING_KEY,
        value: normalizedOverrides as Prisma.InputJsonValue,
        updatedByUserId: overrideMeta.updatedBy.id,
        updatedByName: overrideMeta.updatedBy.name,
        updatedByRole: overrideMeta.updatedBy.role,
      },
      update: {
        value: normalizedOverrides as Prisma.InputJsonValue,
        updatedByUserId: overrideMeta.updatedBy.id,
        updatedByName: overrideMeta.updatedBy.name,
        updatedByRole: overrideMeta.updatedBy.role,
      },
    });

    return this.buildDispatchLearningSettingsSnapshot(
      defaults,
      normalizedOverrides,
      overrideMeta,
    );
  }

  async getOffers(auth: RequestAuthContext) {
    const driverProfileId = auth.user.driverProfile?.id;

    if (!driverProfileId) {
      throw new NotFoundException(
        'No driver profile found for the authenticated user.',
      );
    }

    await this.expireStaleReservations();

    const driverProfile = await this.prisma.driverProfile.findUnique({
      where: {
        id: driverProfileId,
      },
      include: {
        vehicles: {
          where: {
            isActive: true,
          },
        },
      },
    });

    if (!driverProfile) {
      throw new NotFoundException('Driver profile could not be loaded.');
    }

    if (driverProfile.status !== DriverStatus.ONLINE) {
      return [];
    }

    if (driverProfile.verificationStatus !== VerificationStatus.APPROVED) {
      return [];
    }

    const activeVehicles = driverProfile.vehicles.filter(
      (vehicle) => vehicle.isActive,
    );
    const supportedTypes = [
      ...new Set(activeVehicles.map((vehicle) => vehicle.type)),
    ];
    const supportedTiers = [
      ...new Set(activeVehicles.map((vehicle) => vehicle.tier)),
    ];

    if (!supportedTypes.length) {
      return [];
    }

    const driverLatitude = toNumber(driverProfile.currentLatitude);
    const driverLongitude = toNumber(driverProfile.currentLongitude);
    const driverHasCoordinates = hasDefinedCoordinates({
      latitude: driverLatitude,
      longitude: driverLongitude,
    });
    const serviceRadiusKm = toNumber(driverProfile.serviceRadiusKm);
    const dispatchLearningSettings =
      await this.resolveDispatchLearningSettingsValues();
    const dispatchBehavior = await this.loadDispatchBehaviorSignal(
      auth.user.id ?? driverProfile.userId ?? null,
      dispatchLearningSettings,
    );
    const recentlyDeclinedRideRequestIds =
      await this.loadRecentlyDeclinedRideRequestIds(
        auth.user.id ?? driverProfile.userId ?? null,
        dispatchLearningSettings,
      );
    const activeDriverCount = await this.prisma.driverProfile.count({
      where: {
        status: DriverStatus.ONLINE,
        verificationStatus: VerificationStatus.APPROVED,
      },
    });

    const requests = await this.prisma.rideRequest.findMany({
      where: {
        status: {
          in: ['REQUESTED', 'MATCHED'],
        },
        requestedVehicleType: {
          in: supportedTypes,
        },
        AND: [
          ...(recentlyDeclinedRideRequestIds.length
            ? [
                {
                  id: {
                    notIn: recentlyDeclinedRideRequestIds,
                  },
                },
              ]
            : []),
          {
            OR: [
              {
                assignedDriverId: null,
              },
              {
                assignedDriverId: driverProfileId,
              },
              {
                assignmentExpiresAt: {
                  lt: new Date(),
                },
              },
            ],
          },
          {
            OR: [
              {
                requestedServiceTier: null,
              },
              {
                requestedServiceTier: {
                  in: supportedTiers.length
                    ? supportedTiers
                    : Object.values(ServiceTier),
                },
              },
            ],
          },
        ],
      },
      include: {
        rider: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 24,
    });

    const rankedOffers = requests
      .map((request) => {
        const compatibleVehicles = activeVehicles.filter(
          (vehicle) =>
            vehicle.type === request.requestedVehicleType &&
            (!request.requestedServiceTier ||
              vehicle.tier === request.requestedServiceTier),
        );

        if (!compatibleVehicles.length) {
          return null;
        }

        const pickupLatitude = toNumber(request.pickupLatitude);
        const pickupLongitude = toNumber(request.pickupLongitude);
        const pickupDistanceKm =
          driverHasCoordinates &&
          hasDefinedCoordinates({
            latitude: pickupLatitude,
            longitude: pickupLongitude,
          })
            ? calculateDistanceKm(
                {
                  latitude: driverLatitude as number,
                  longitude: driverLongitude as number,
                },
                {
                  latitude: pickupLatitude as number,
                  longitude: pickupLongitude as number,
                },
              )
            : null;

        if (
          pickupDistanceKm !== null &&
          serviceRadiusKm !== null &&
          pickupDistanceKm > serviceRadiusKm
        ) {
          return null;
        }

        const fare = Number(request.estimatedFare ?? 0);
        const estimatedTripDistanceKm = Number(
          request.estimatedDistanceKm ?? 0,
        );
        const ageMinutes = Math.max(
          0,
          Math.round((Date.now() - request.createdAt.getTime()) / (1000 * 60)),
        );
        const hasExactTierMatch = Boolean(request.requestedServiceTier);
        const operatingContext = this.pricingService.deriveOperatingContext({
          vehicleType: request.requestedVehicleType,
          zone: resolveDispatchZone(estimatedTripDistanceKm),
          activeDriverCount,
          openRequestCount: requests.length,
          isPeakHour: isPeakTrafficWindow(request.createdAt),
          trafficLevel: resolveDispatchTrafficLevel(
            estimatedTripDistanceKm,
            Number(request.estimatedDurationMinutes ?? 0),
          ),
          roadCondition: resolveDispatchRoadCondition(
            estimatedTripDistanceKm,
            Number(request.estimatedDurationMinutes ?? 0),
          ),
          weatherCondition: 'CLEAR',
        });
        const dispatchScore = calculateDispatchScore({
          pickupDistanceKm,
          estimatedTripDistanceKm,
          ageMinutes,
          hasExactTierMatch,
          availabilityScore: operatingContext.availabilityScore,
          supplyPressureLevel: operatingContext.supplyPressureLevel,
          demandLevel: operatingContext.demandLevel,
          trafficLevel: operatingContext.trafficLevel,
          roadCondition: operatingContext.roadCondition,
        });
        const offerConfidenceScore = calculateOfferConfidenceScore({
          dispatchScore,
          pickupDistanceKm,
          availabilityScore: operatingContext.availabilityScore,
          ageMinutes,
          hasExactTierMatch,
          behavioralScore: dispatchBehavior.score,
        });
        const offerConfidenceLabel =
          resolveOfferConfidenceLabel(offerConfidenceScore);
        const reservationWindowSeconds = Math.round(
          resolveAssignmentWindowMs(offerConfidenceScore) / 1000,
        );

        return this.driverOfferProjector.project({
          id: request.id,
          riderName: request.rider.user.fullName,
          pickup: request.pickupAddress,
          destination: request.destinationAddress,
          requestedVehicleType: request.requestedVehicleType,
          fare,
          estimatedTripDistanceKm,
          ageMinutes,
          pickupDistanceKm: roundDistance(pickupDistanceKm),
          serviceRadiusKm,
          matchedTier: compatibleVehicles[0]?.tier ?? null,
          dispatchScore,
          offerConfidenceScore,
          offerConfidenceLabel,
          reservationExpiresAt:
            request.assignedDriverId === driverProfileId &&
            request.assignmentExpiresAt
              ? request.assignmentExpiresAt.toISOString()
              : null,
          reservationWindowSeconds,
          availabilityScore: operatingContext.availabilityScore,
          demandLevel: operatingContext.demandLevel,
          trafficLevel: operatingContext.trafficLevel,
          dispatchBehavior,
        });
      })
      .filter((offer): offer is NonNullable<typeof offer> => offer !== null)
      .sort((left, right) =>
        this.driverOfferProjector.comparePriority(left, right),
      );

    const now = new Date();
    const assignedOffers: DriverOfferViewModel[] = [];

    for (const offer of rankedOffers) {
      if (assignedOffers.length >= MAX_ASSIGNED_OFFERS) {
        break;
      }

      if (
        offer.reservationExpiresAt &&
        new Date(offer.reservationExpiresAt).getTime() > now.getTime()
      ) {
        assignedOffers.push(offer);
        continue;
      }

      const assignmentExpiresAt = new Date(
        now.getTime() +
          resolveAssignmentWindowMs(offer.offerConfidenceScore ?? 60),
      );
      const claimResult = await this.prisma.rideRequest.updateMany({
        where: {
          id: offer.id,
          status: {
            in: ['REQUESTED', 'MATCHED'],
          },
          OR: [
            {
              assignedDriverId: null,
            },
            {
              assignmentExpiresAt: {
                lt: now,
              },
            },
          ],
        },
        data: {
          assignedDriverId: driverProfileId,
          assignmentExpiresAt,
        },
      });

      if (claimResult.count > 0) {
        await this.recordDispatchAuditEvent({
          userId: auth.user.id ?? driverProfile.userId ?? null,
          action: 'DISPATCH_RESERVATION_ASSIGNED',
          rideRequestId: offer.id,
          metadata: {
            expiresAt: assignmentExpiresAt.toISOString(),
            dispatchScore: offer.dispatchScore ?? null,
            offerConfidenceScore: offer.offerConfidenceScore ?? null,
          },
        });
        this.publishReservationRealtimeEvent(
          'ride-request.reservation-assigned',
          {
            rideRequestId: offer.id,
            riderId: this.extractRideRequestRiderId(requests, offer.id),
            actorDriverId: driverProfileId,
            expiresAt: assignmentExpiresAt.toISOString(),
          },
        );
        assignedOffers.push({
          ...offer,
          reservationExpiresAt: assignmentExpiresAt.toISOString(),
          reservationWindowSeconds: Math.round(
            (assignmentExpiresAt.getTime() - now.getTime()) / 1000,
          ),
        });
      }
    }

    return assignedOffers;
  }

  async declineOffer(auth: RequestAuthContext, rideRequestId: string) {
    const driverProfileId = auth.user.driverProfile?.id;

    if (!driverProfileId) {
      throw new NotFoundException(
        'No driver profile found for the authenticated user.',
      );
    }

    const profile = await this.prisma.driverProfile.findUnique({
      where: {
        id: driverProfileId,
      },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile could not be loaded.');
    }

    const reservation = await this.prisma.rideRequest.findUnique({
      where: {
        id: rideRequestId,
      },
      select: {
        id: true,
        riderId: true,
        status: true,
        assignedDriverId: true,
        assignmentExpiresAt: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException('Ride request not found.');
    }

    const now = new Date();

    if (
      !['REQUESTED', 'MATCHED'].includes(reservation.status) ||
      reservation.assignedDriverId !== driverProfileId ||
      !reservation.assignmentExpiresAt ||
      reservation.assignmentExpiresAt.getTime() <= now.getTime()
    ) {
      throw new BadRequestException(
        'This ride request is no longer reserved for the driver.',
      );
    }

    const releaseResult = await this.prisma.rideRequest.updateMany({
      where: {
        id: rideRequestId,
        status: {
          in: ['REQUESTED', 'MATCHED'],
        },
        assignedDriverId: driverProfileId,
        assignmentExpiresAt: {
          gt: now,
        },
      },
      data: {
        assignedDriverId: null,
        assignmentExpiresAt: null,
      },
    });

    if (!releaseResult.count) {
      throw new BadRequestException(
        'This ride request is no longer reserved for the driver.',
      );
    }

    await this.recordDispatchAuditEvent({
      userId: auth.user.id ?? profile.userId ?? null,
      action: 'DISPATCH_RESERVATION_DECLINED',
      rideRequestId,
      metadata: {
        declinedAt: now.toISOString(),
      },
    });
    this.publishReservationRealtimeEvent('ride-request.reservation-released', {
      rideRequestId,
      riderId: reservation.riderId,
      actorDriverId: driverProfileId,
      reason: 'DRIVER_DECLINED',
    });

    return {
      offer: {
        rideRequestId,
        status: 'DECLINED' as const,
      },
    };
  }

  async proactiveDispatch(input: {
    rideRequestId: string;
    requestedVehicleType: VehicleType;
    requestedServiceTier: ServiceTier | null;
    estimatedDistanceKm: number;
    estimatedDurationMinutes: number;
    pickupLatitude: number | null;
    pickupLongitude: number | null;
    pickupAddress: string;
    createdAt: Date;
  }): Promise<{
    dispatched: boolean;
    assignedDriverId: string | null;
    assignedUserId: string | null;
  }> {
    const candidates = await this.prisma.driverProfile.findMany({
      where: {
        status: DriverStatus.ONLINE,
        verificationStatus: VerificationStatus.APPROVED,
        vehicles: {
          some: {
            isActive: true,
            type: input.requestedVehicleType,
          },
        },
      },
      include: {
        vehicles: { where: { isActive: true } },
      },
      take: 30,
    });

    if (!candidates.length) {
      await this.recordDispatchAuditEvent({
        userId: null,
        action: 'DISPATCH_PROACTIVE_NO_CANDIDATE',
        rideRequestId: input.rideRequestId,
        metadata: { reason: 'no_online_driver_with_compatible_vehicle' },
      });
      return {
        dispatched: false,
        assignedDriverId: null,
        assignedUserId: null,
      };
    }

    const activeTrips = await this.prisma.trip.findMany({
      where: {
        driverId: { in: candidates.map((c) => c.id) },
        status: { in: ACTIVE_TRIP_STATUSES },
      },
      select: { driverId: true },
    });
    const busyDriverIds = new Set(activeTrips.map((t) => t.driverId));

    const estimatedTripDistanceKm = input.estimatedDistanceKm;
    const estimatedDurationMinutes = input.estimatedDurationMinutes;

    const activeDriverCount = await this.prisma.driverProfile.count({
      where: {
        status: DriverStatus.ONLINE,
        verificationStatus: VerificationStatus.APPROVED,
      },
    });

    const operatingContext = this.pricingService.deriveOperatingContext({
      vehicleType: input.requestedVehicleType,
      zone: resolveDispatchZone(estimatedTripDistanceKm),
      activeDriverCount,
      openRequestCount: 1,
      isPeakHour: isPeakTrafficWindow(input.createdAt),
      trafficLevel: resolveDispatchTrafficLevel(
        estimatedTripDistanceKm,
        estimatedDurationMinutes,
      ),
      roadCondition: resolveDispatchRoadCondition(
        estimatedTripDistanceKm,
        estimatedDurationMinutes,
      ),
      weatherCondition: 'CLEAR',
    });

    const scored = candidates
      .filter((c) => !busyDriverIds.has(c.id))
      .map((driver) => {
        const compatibleVehicle = driver.vehicles.find(
          (v) =>
            v.type === input.requestedVehicleType &&
            (!input.requestedServiceTier ||
              v.tier === input.requestedServiceTier),
        );

        if (!compatibleVehicle) {
          return null;
        }

        const driverLat = toNumber(driver.currentLatitude);
        const driverLng = toNumber(driver.currentLongitude);
        const pickupDistanceKm =
          hasDefinedCoordinates({
            latitude: driverLat,
            longitude: driverLng,
          }) &&
          hasDefinedCoordinates({
            latitude: input.pickupLatitude,
            longitude: input.pickupLongitude,
          })
            ? calculateDistanceKm(
                {
                  latitude: driverLat as number,
                  longitude: driverLng as number,
                },
                {
                  latitude: input.pickupLatitude as number,
                  longitude: input.pickupLongitude as number,
                },
              )
            : null;

        const dispatchScore = calculateDispatchScore({
          pickupDistanceKm,
          estimatedTripDistanceKm,
          ageMinutes: 0,
          hasExactTierMatch: Boolean(input.requestedServiceTier),
          availabilityScore: operatingContext.availabilityScore,
          supplyPressureLevel: operatingContext.supplyPressureLevel,
          demandLevel: operatingContext.demandLevel,
          trafficLevel: operatingContext.trafficLevel,
          roadCondition: operatingContext.roadCondition,
        });

        return { driver, dispatchScore, pickupDistanceKm };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => b.dispatchScore - a.dispatchScore);

    const best = scored[0];

    if (!best) {
      await this.recordDispatchAuditEvent({
        userId: null,
        action: 'DISPATCH_PROACTIVE_NO_CANDIDATE',
        rideRequestId: input.rideRequestId,
        metadata: { reason: 'all_candidates_busy_or_incompatible' },
      });
      return {
        dispatched: false,
        assignedDriverId: null,
        assignedUserId: null,
      };
    }

    const offerConfidenceScore = calculateOfferConfidenceScore({
      dispatchScore: best.dispatchScore,
      pickupDistanceKm: best.pickupDistanceKm,
      availabilityScore: operatingContext.availabilityScore,
      ageMinutes: 0,
      hasExactTierMatch: Boolean(input.requestedServiceTier),
      behavioralScore: 0.5,
    });
    const assignmentExpiresAt = new Date(
      Date.now() + resolveAssignmentWindowMs(offerConfidenceScore),
    );

    const claimResult = await this.prisma.rideRequest.updateMany({
      where: {
        id: input.rideRequestId,
        status: { in: ['REQUESTED', 'MATCHED'] },
        assignedDriverId: null,
      },
      data: {
        assignedDriverId: best.driver.id,
        assignmentExpiresAt,
      },
    });

    if (claimResult.count === 0) {
      return {
        dispatched: false,
        assignedDriverId: null,
        assignedUserId: null,
      };
    }

    await this.recordDispatchAuditEvent({
      userId: best.driver.userId,
      action: 'DISPATCH_PROACTIVE_ASSIGNMENT',
      rideRequestId: input.rideRequestId,
      metadata: {
        dispatchScore: best.dispatchScore,
        pickupDistanceKm: best.pickupDistanceKm,
        assignmentExpiresAt: assignmentExpiresAt.toISOString(),
        candidateCount: candidates.length,
      },
    });

    this.realtimeService.publish({
      channel: 'ride-request',
      type: 'ride-request.created',
      entityId: input.rideRequestId,
      payload: {
        proactiveAssignment: true,
        assignedDriverId: best.driver.id,
        pickupAddress: input.pickupAddress,
      },
    });

    return {
      dispatched: true,
      assignedDriverId: best.driver.id,
      assignedUserId: best.driver.userId ?? null,
    };
  }

  async expireStaleReservations(now = new Date()) {
    const expiredReservations = await this.prisma.rideRequest.findMany({
      where: {
        status: {
          in: ['REQUESTED', 'MATCHED'],
        },
        assignedDriverId: {
          not: null,
        },
        assignmentExpiresAt: {
          lt: now,
        },
      },
      select: {
        id: true,
        riderId: true,
        assignedDriverId: true,
      },
    });

    let releasedCount = 0;

    await Promise.all(
      expiredReservations.map(async (reservation) => {
        const releaseResult = await this.prisma.rideRequest.updateMany({
          where: {
            id: reservation.id,
            assignedDriverId: reservation.assignedDriverId,
            assignmentExpiresAt: {
              lt: now,
            },
          },
          data: {
            assignedDriverId: null,
            assignmentExpiresAt: null,
          },
        });

        if (releaseResult.count > 0) {
          const driverUserId = await this.resolveDriverUserId(
            reservation.assignedDriverId ?? null,
          );

          await this.recordDispatchAuditEvent({
            userId: driverUserId,
            action: 'DISPATCH_RESERVATION_EXPIRED',
            rideRequestId: reservation.id,
            metadata: {
              expiredAt: now.toISOString(),
            },
          });
          releasedCount += releaseResult.count;
          this.publishReservationRealtimeEvent(
            'ride-request.reservation-expired',
            {
              rideRequestId: reservation.id,
              riderId: reservation.riderId,
              actorDriverId: reservation.assignedDriverId,
            },
          );
        }
      }),
    );

    return releasedCount;
  }

  async releaseDriverReservations(driverProfileId: string) {
    const now = new Date();
    const activeReservations = await this.prisma.rideRequest.findMany({
      where: {
        status: {
          in: ['REQUESTED', 'MATCHED'],
        },
        assignedDriverId: driverProfileId,
        assignmentExpiresAt: {
          gt: now,
        },
      },
      select: {
        id: true,
        riderId: true,
      },
    });

    await Promise.all(
      activeReservations.map(async (reservation) => {
        const releaseResult = await this.prisma.rideRequest.updateMany({
          where: {
            id: reservation.id,
            assignedDriverId: driverProfileId,
            assignmentExpiresAt: {
              gt: now,
            },
          },
          data: {
            assignedDriverId: null,
            assignmentExpiresAt: null,
          },
        });

        if (releaseResult.count > 0) {
          const driverUserId = await this.resolveDriverUserId(driverProfileId);

          await this.recordDispatchAuditEvent({
            userId: driverUserId,
            action: 'DISPATCH_RESERVATION_RELEASED',
            rideRequestId: reservation.id,
            metadata: {
              releasedAt: now.toISOString(),
            },
          });
          this.publishReservationRealtimeEvent(
            'ride-request.reservation-released',
            {
              rideRequestId: reservation.id,
              riderId: reservation.riderId,
              actorDriverId: driverProfileId,
            },
          );
        }
      }),
    );
  }

  private extractRideRequestRiderId(
    requests: Array<{ id: string; riderId: string }>,
    rideRequestId: string,
  ) {
    return requests.find((request) => request.id === rideRequestId)?.riderId;
  }

  private publishReservationRealtimeEvent(
    type:
      | 'ride-request.reservation-assigned'
      | 'ride-request.reservation-released'
      | 'ride-request.reservation-expired',
    input: {
      rideRequestId: string;
      riderId?: string | null;
      actorDriverId?: string | null;
      expiresAt?: string;
      reason?: string | null;
    },
  ) {
    this.realtimeService.publish({
      channel: 'ride-request',
      type,
      entityId: input.rideRequestId,
      riderId: input.riderId ?? undefined,
      driverId: input.actorDriverId ?? undefined,
      payload: {
        driverId: input.actorDriverId ?? null,
        expiresAt: input.expiresAt ?? null,
        reason: input.reason ?? null,
      },
    });
  }

  private async loadDispatchBehaviorSignal(
    userId: string | null,
    settings: DispatchLearningSettingsValues,
  ) {
    if (!userId) {
      return {
        score: 60,
        acceptanceRate: null,
        declineRate: null,
        expirationRate: null,
        signalFreshness: 'UNKNOWN' as const,
      };
    }

    const lookbackStart = new Date(
      Date.now() - settings.lookbackHours * 3_600_000,
    );
    const events = await this.prisma.auditLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: lookbackStart,
        },
        action: {
          in: [
            'DISPATCH_RESERVATION_ASSIGNED',
            'DISPATCH_RESERVATION_EXPIRED',
            'DISPATCH_RESERVATION_RELEASED',
            'DISPATCH_RESERVATION_ACCEPTED',
            'DISPATCH_RESERVATION_DECLINED',
          ],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: settings.historyLimit,
      select: {
        action: true,
        createdAt: true,
      },
    });

    const typedEvents: DispatchBehaviorAuditEvent[] = events.map((event) => ({
      action: event.action as DispatchAuditAction,
      createdAt: event.createdAt,
    }));

    return evaluateDispatchBehaviorSignal({
      events: typedEvents,
      halfLifeHours: settings.halfLifeHours,
    });
  }

  private async loadRecentlyDeclinedRideRequestIds(
    userId: string | null,
    settings: DispatchLearningSettingsValues,
  ) {
    if (!userId) {
      return [];
    }

    const cooldownStart = new Date(
      Date.now() - settings.declineCooldownMinutes * 60_000,
    );
    const recentDeclines = await this.prisma.auditLog.findMany({
      where: {
        userId,
        action: 'DISPATCH_RESERVATION_DECLINED',
        entityType: 'RIDE_REQUEST',
        createdAt: {
          gte: cooldownStart,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: settings.historyLimit,
      select: {
        entityId: true,
      },
    });

    return [
      ...new Set(
        recentDeclines
          .map((event) => event.entityId)
          .filter((entityId): entityId is string => Boolean(entityId)),
      ),
    ];
  }

  private getDefaultDispatchLearningSettings(): DispatchLearningSettingsValues {
    return {
      lookbackHours: this.getPositiveNumberConfig(
        'operations.dispatchSignalLookbackHours',
        DISPATCH_SIGNAL_LOOKBACK_HOURS,
      ),
      halfLifeHours: this.getPositiveNumberConfig(
        'operations.dispatchSignalHalfLifeHours',
        DISPATCH_SIGNAL_HALF_LIFE_HOURS,
      ),
      declineCooldownMinutes: this.getPositiveNumberConfig(
        'operations.dispatchDeclineCooldownMinutes',
        DISPATCH_DECLINE_COOLDOWN_MINUTES,
      ),
      historyLimit: this.getPositiveNumberConfig(
        'operations.dispatchSignalHistoryLimit',
        MAX_DISPATCH_SIGNAL_EVENTS,
      ),
    };
  }

  private async resolveDispatchLearningSettingsValues(): Promise<DispatchLearningSettingsValues> {
    const snapshot = await this.getDispatchLearningSettings();

    return {
      lookbackHours: snapshot.lookbackHours,
      halfLifeHours: snapshot.halfLifeHours,
      declineCooldownMinutes: snapshot.declineCooldownMinutes,
      historyLimit: snapshot.historyLimit,
    };
  }

  private buildDispatchLearningSettingsSnapshot(
    defaults: DispatchLearningSettingsValues,
    overrides: Partial<DispatchLearningSettingsValues>,
    meta: {
      updatedAt: string;
      updatedBy: {
        id: string;
        name: string | null;
        role: string | null;
      } | null;
    } | null,
  ): DispatchLearningSettingsSnapshot {
    return {
      lookbackHours: overrides.lookbackHours ?? defaults.lookbackHours,
      halfLifeHours: overrides.halfLifeHours ?? defaults.halfLifeHours,
      declineCooldownMinutes:
        overrides.declineCooldownMinutes ?? defaults.declineCooldownMinutes,
      historyLimit: overrides.historyLimit ?? defaults.historyLimit,
      source: Object.keys(overrides).length ? 'DATABASE_OVERRIDE' : 'DEFAULT',
      updatedAt: meta?.updatedAt ?? null,
      updatedBy: meta?.updatedBy ?? null,
    };
  }

  private extractOverridesFromSnapshot(
    snapshot: DispatchLearningSettingsSnapshot,
    defaults: DispatchLearningSettingsValues,
  ) {
    return this.normalizeDispatchLearningOverrides(
      {
        lookbackHours: snapshot.lookbackHours,
        halfLifeHours: snapshot.halfLifeHours,
        declineCooldownMinutes: snapshot.declineCooldownMinutes,
        historyLimit: snapshot.historyLimit,
      },
      defaults,
    );
  }

  private extractDispatchLearningOverrides(value: Prisma.JsonValue | null) {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return {};
    }

    const record = value as Record<string, unknown>;

    return {
      lookbackHours: this.toPositiveInteger(record.lookbackHours),
      halfLifeHours: this.toPositiveInteger(record.halfLifeHours),
      declineCooldownMinutes: this.toPositiveInteger(
        record.declineCooldownMinutes,
      ),
      historyLimit: this.toPositiveInteger(record.historyLimit),
    };
  }

  private normalizeDispatchLearningOverrides(
    values: Partial<DispatchLearningSettingsValues>,
    defaults: DispatchLearningSettingsValues,
  ) {
    const normalized: Partial<DispatchLearningSettingsValues> = {};

    if (
      values.lookbackHours !== undefined &&
      values.lookbackHours !== defaults.lookbackHours
    ) {
      normalized.lookbackHours = values.lookbackHours;
    }

    if (
      values.halfLifeHours !== undefined &&
      values.halfLifeHours !== defaults.halfLifeHours
    ) {
      normalized.halfLifeHours = values.halfLifeHours;
    }

    if (
      values.declineCooldownMinutes !== undefined &&
      values.declineCooldownMinutes !== defaults.declineCooldownMinutes
    ) {
      normalized.declineCooldownMinutes = values.declineCooldownMinutes;
    }

    if (
      values.historyLimit !== undefined &&
      values.historyLimit !== defaults.historyLimit
    ) {
      normalized.historyLimit = values.historyLimit;
    }

    return normalized;
  }

  private getPositiveNumberConfig(path: string, fallback: number) {
    const configuredValue = this.configService.get<number | string>(path);
    const numericValue = Number(configuredValue);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return fallback;
    }

    return Math.round(numericValue);
  }

  private toPositiveInteger(value: unknown) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return undefined;
    }

    return Math.round(numericValue);
  }

  private async resolveDriverUserId(driverProfileId: string | null) {
    if (!driverProfileId) {
      return null;
    }

    const profile = await this.prisma.driverProfile.findUnique({
      where: {
        id: driverProfileId,
      },
      select: {
        userId: true,
      },
    });

    return profile?.userId ?? null;
  }

  private async recordDispatchAuditEvent(input: {
    userId: string | null;
    action: DispatchAuditAction;
    rideRequestId: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!input.userId) {
      return;
    }

    await this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: 'RIDE_REQUEST',
        entityId: input.rideRequestId,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
