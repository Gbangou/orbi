import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { roundXofForCashOperations } from '@orbi/domain';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { RoutingService } from '../../core/routing/routing.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { PricingService } from '../pricing/pricing.service';
import { DispatchCoordinator } from '../drivers/dispatch-coordinator.service';
import { CreateRideRequestDto } from './dto/create-ride-request.dto';
import {
  RIDE_REQUEST_ACTIVE_STATUSES,
  RIDE_REQUEST_DIRECT_CANCELLATION_STATUS,
} from './ride-requests.constants';
import { ACTIVE_TRIP_STATUSES } from '../trips/trips.constants';
import {
  assertRideRequestPayloadConsistency,
  buildRideRequestCreateData,
  inferRideRequestPeakHour,
  inferRideRequestRoadCondition,
  inferRideRequestTrafficLevel,
  resolveRideRequestPricingGeography,
  resolveRideRequestRouteMetrics,
  resolveRideRequestRouteMetricsWithRouting,
} from './ride-request-creation.policy';
import { RideRequestProjector } from './ride-request.projector';
import { FraudDetectionService } from '../../common/security/fraud-detection.service';

@Injectable()
export class RideRequestsService {
  private readonly logger = new Logger(RideRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly realtimeService: RealtimeService,
    private readonly rideRequestProjector: RideRequestProjector,
    private readonly notificationsService: NotificationsService,
    private readonly dispatchCoordinator: DispatchCoordinator,
    private readonly fraudDetectionService: FraudDetectionService,
    private readonly routingService: RoutingService,
  ) {}

  async create(payload: CreateRideRequestDto) {
    assertRideRequestPayloadConsistency(payload);

    // Velocity check — bloque les abus répétés (>5 demandes en 10 min)
    const isVelocityAbuse = await this.fraudDetectionService.isRideRequestVelocityExceeded(
      payload.riderId,
    );
    if (isVelocityAbuse) {
      throw new BadRequestException(
        'Trop de demandes en peu de temps. Veuillez patienter quelques minutes avant de réessayer.',
      );
    }
    const routeMetrics = await resolveRideRequestRouteMetricsWithRouting(
      payload,
      this.routingService,
    );
    const pricingGeography = resolveRideRequestPricingGeography(payload);
    const marketplaceDemand =
      await this.pricingService.calculateRealTimeDemandLevel(
        pricingGeography.city,
        {
          vehicleType: payload.requestedVehicleType,
          serviceTier: payload.requestedServiceTier,
        },
      );
    const operatingContext = this.pricingService.deriveOperatingContext({
      vehicleType: payload.requestedVehicleType,
      zone: payload.pickupAreaType,
      isPeakHour: marketplaceDemand.isPeakHour || inferRideRequestPeakHour(),
      demandLevel: marketplaceDemand.demandLevel,
      activeDriverCount: marketplaceDemand.activeDriverCount,
      openRequestCount: marketplaceDemand.openRequestCount,
      trafficLevel: inferRideRequestTrafficLevel(
        routeMetrics,
        payload.pickupAreaType,
      ),
      weatherCondition: 'CLEAR',
      roadCondition: inferRideRequestRoadCondition(
        routeMetrics,
        payload.pickupAreaType,
      ),
    });

    const pricing = await this.pricingService.quote({
      vehicleType: payload.requestedVehicleType,
      serviceTier: payload.requestedServiceTier,
      distanceKm: routeMetrics.distanceKm,
      durationMinutes: routeMetrics.durationMinutes,
      paymentMethod: payload.paymentMethod,
      zone: payload.pickupAreaType,
      city: pricingGeography.city,
      districtProfile: pricingGeography.districtProfile,
      demandLevel: operatingContext.demandLevel,
      trafficLevel: operatingContext.trafficLevel,
      weatherCondition: operatingContext.weatherCondition,
      roadCondition: operatingContext.roadCondition,
      isPeakHour: marketplaceDemand.isPeakHour || inferRideRequestPeakHour(),
      activeDriverCount: marketplaceDemand.activeDriverCount,
      openRequestCount: marketplaceDemand.openRequestCount,
    });
    let applicableFare = roundXofForCashOperations(pricing.estimatedFare).amount;
    let resolvedPromoCodeId: string | null = null;

    if (payload.promoCode) {
      const promo = await this.prisma.promoCode.findUnique({
        where: { code: payload.promoCode },
        select: {
          id: true,
          discountBps: true,
          maxUses: true,
          usedCount: true,
          validFrom: true,
          validTo: true,
          active: true,
        },
      });
      const now = new Date();
      if (
        promo &&
        promo.active &&
        promo.validFrom <= now &&
        promo.validTo > now &&
        (promo.maxUses === null || promo.usedCount < promo.maxUses)
      ) {
        applicableFare = roundXofForCashOperations(
          Number(pricing.estimatedFare) * (1 - promo.discountBps / 10000),
        ).amount;
        resolvedPromoCodeId = promo.id;
      }
    }

    const createData = buildRideRequestCreateData(
      payload,
      applicableFare,
      routeMetrics,
    );

    let result: {
      rideRequest: Parameters<
        RideRequestProjector['projectCreatedRideRequest']
      >[0]['rideRequest'] & {
        riderId?: string;
      };
      created: boolean;
    } | null = null;

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const [existingActiveRequest, existingActiveTrip] = await Promise.all([
          tx.rideRequest.findFirst({
            where: {
              riderId: payload.riderId,
              status: {
                in: [...RIDE_REQUEST_ACTIVE_STATUSES],
              },
            },
            select: {
              id: true,
              status: true,
              pickupAddress: true,
              pickupLatitude: true,
              pickupLongitude: true,
              destinationAddress: true,
              destinationLatitude: true,
              destinationLongitude: true,
              requestedVehicleType: true,
              requestedServiceTier: true,
              paymentMethod: true,
              pricingCity: true,
              districtProfile: true,
              estimatedFare: true,
              estimatedDistanceKm: true,
              estimatedDurationMinutes: true,
              createdAt: true,
            },
          }),
          tx.trip.findFirst({
            where: {
              riderId: payload.riderId,
              status: {
                in: ACTIVE_TRIP_STATUSES,
              },
            },
            select: {
              id: true,
            },
          }),
        ]);

        if (existingActiveRequest) {
          if (
            this.isEquivalentActiveRideRequest(
              existingActiveRequest,
              createData,
            )
          ) {
            return {
              rideRequest: existingActiveRequest,
              created: false,
            };
          }

          throw new BadRequestException(
            'The rider already has an active ride request.',
          );
        }

        if (existingActiveTrip) {
          throw new BadRequestException(
            'The rider already has an active trip.',
          );
        }

        const newRideRequest = await tx.rideRequest.create({
          data: { ...createData, promoCodeId: resolvedPromoCodeId },
        });

        if (resolvedPromoCodeId) {
          await tx.promoCode.update({
            where: { id: resolvedPromoCodeId },
            data: { usedCount: { increment: 1 } },
          });
        }

        return {
          rideRequest: newRideRequest,
          created: true,
        };
      });
    } catch (error) {
      if (this.isRiderActiveFlowConstraintError(error)) {
        throw new BadRequestException(
          'The rider already has an active ride request or trip.',
        );
      }

      throw error;
    }

    if (!result) {
      throw new BadRequestException('La demande de course n a pas pu etre creee.');
    }

    const rideRequest = result.rideRequest;

    if (result.created) {
      this.realtimeService.publish({
        channel: 'ride-request',
        type: 'ride-request.created',
        entityId: rideRequest.id,
        riderId: rideRequest.riderId ?? payload.riderId,
        payload: {
          status: rideRequest.status,
          estimatedFare: Number(
            rideRequest.estimatedFare ?? pricing.estimatedFare,
          ),
          operatingContext,
        },
      });

      await this.dispatchAndNotify({
        rideRequestId: rideRequest.id,
        riderId: rideRequest.riderId ?? payload.riderId,
        requestedVehicleType: payload.requestedVehicleType,
        requestedServiceTier: payload.requestedServiceTier ?? null,
        estimatedDistanceKm: routeMetrics.distanceKm ?? 0,
        estimatedDurationMinutes: routeMetrics.durationMinutes ?? 0,
        pickupLatitude: payload.pickupLatitude ?? null,
        pickupLongitude: payload.pickupLongitude ?? null,
        pickupAddress: rideRequest.pickupAddress,
        createdAt: rideRequest.createdAt ?? new Date(),
      });
    }

    return this.rideRequestProjector.projectCreatedRideRequest({
      rideRequest,
      routeMetrics,
      operatingContext,
      pricing,
    });
  }

  private isRiderActiveFlowConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isEquivalentActiveRideRequest(
    existing: {
      pickupAddress: string;
      pickupLatitude?: unknown;
      pickupLongitude?: unknown;
      destinationAddress: string;
      destinationLatitude?: unknown;
      destinationLongitude?: unknown;
      requestedVehicleType: string;
      requestedServiceTier?: string | null;
      paymentMethod?: string | null;
      pricingCity?: string | null;
      districtProfile?: string | null;
      estimatedFare?: unknown;
      estimatedDistanceKm?: unknown;
      estimatedDurationMinutes?: number | null;
    },
    next: ReturnType<typeof buildRideRequestCreateData>,
  ) {
    return (
      this.normalizeComparableText(existing.pickupAddress) ===
        this.normalizeComparableText(next.pickupAddress) &&
      this.normalizeComparableText(existing.destinationAddress) ===
        this.normalizeComparableText(next.destinationAddress) &&
      this.sameNullableNumber(existing.pickupLatitude, next.pickupLatitude) &&
      this.sameNullableNumber(existing.pickupLongitude, next.pickupLongitude) &&
      this.sameNullableNumber(
        existing.destinationLatitude,
        next.destinationLatitude,
      ) &&
      this.sameNullableNumber(
        existing.destinationLongitude,
        next.destinationLongitude,
      ) &&
      existing.requestedVehicleType === next.requestedVehicleType &&
      (existing.requestedServiceTier ?? null) ===
        (next.requestedServiceTier ?? null) &&
      (existing.paymentMethod ?? 'MOBILE_MONEY') ===
        (next.paymentMethod ?? 'MOBILE_MONEY') &&
      (existing.pricingCity ?? null) === (next.pricingCity ?? null) &&
      (existing.districtProfile ?? null) === (next.districtProfile ?? null) &&
      this.sameRoundedNumber(
        existing.estimatedDistanceKm,
        next.estimatedDistanceKm,
      ) &&
      this.similarDurationMinutes(
        existing.estimatedDurationMinutes,
        next.estimatedDurationMinutes,
      )
    );
  }

  // Duration comparison allows ±6 min tolerance — road conditions and ETA
  // algorithms evolve between the stored request and the retry attempt.
  private similarDurationMinutes(left: unknown, right: unknown) {
    const leftNumber = this.toFiniteComparisonNumber(left);
    const rightNumber = this.toFiniteComparisonNumber(right);

    if (leftNumber === null || rightNumber === null) {
      return false;
    }

    const l = Math.round(leftNumber);
    const r = Math.round(rightNumber);
    return Math.abs(l - r) <= 6;
  }

  private normalizeComparableText(value: unknown) {
    return typeof value === 'string'
      ? value.trim().replace(/\s+/g, ' ').toLowerCase()
      : '';
  }

  private sameNullableNumber(left: unknown, right: unknown) {
    if (
      left === null ||
      left === undefined ||
      right === null ||
      right === undefined
    ) {
      return left === right;
    }

    const leftNumber = this.toFiniteComparisonNumber(left);
    const rightNumber = this.toFiniteComparisonNumber(right);

    return (
      leftNumber !== null &&
      rightNumber !== null &&
      Math.abs(leftNumber - rightNumber) < 0.0001
    );
  }

  private sameRoundedNumber(left: unknown, right: unknown) {
    const leftNumber = this.toFiniteComparisonNumber(left);
    const rightNumber = this.toFiniteComparisonNumber(right);

    return (
      leftNumber !== null &&
      rightNumber !== null &&
      Math.round(leftNumber) === Math.round(rightNumber)
    );
  }

  private toFiniteComparisonNumber(value: unknown) {
    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : null;
  }

  async findActive() {
    return this.prisma.rideRequest.findMany({
      where: {
        status: {
          in: [...RIDE_REQUEST_ACTIVE_STATUSES],
        },
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
    });
  }

  async cancel(auth: RequestAuthContext, rideRequestId: string) {
    const rideRequest = await this.prisma.rideRequest.findUnique({
      where: {
        id: rideRequestId,
      },
      include: {
        trip: true,
      },
    });

    if (!rideRequest) {
      throw new NotFoundException('Ride request not found.');
    }

    if (
      auth.user.role === UserRole.RIDER &&
      rideRequest.riderId !== auth.user.riderProfile?.id
    ) {
      throw new NotFoundException('Ride request not found.');
    }

    if (rideRequest.trip) {
      throw new BadRequestException(
        'This request already has an active trip. Cancel the trip instead.',
      );
    }

    if (rideRequest.status !== RIDE_REQUEST_DIRECT_CANCELLATION_STATUS) {
      throw new BadRequestException(
        'Only requested rides can be cancelled here.',
      );
    }

    const cancellationPolicy =
      auth.user.role === UserRole.RIDER
        ? await this.resolveRiderCancellationPolicy(rideRequest.riderId)
        : null;

    const cancelledRequest = await this.prisma.rideRequest.update({
      where: {
        id: rideRequestId,
      },
      data: {
        status: 'CANCELLED',
      },
    });

    const supportTicketId =
      cancellationPolicy?.level === 'SUPPORT_REVIEW'
        ? await this.createRepeatedCancellationSupportTicket({
            userId: auth.user.id,
            rideRequestId,
            recentCancellationCount:
              cancellationPolicy.recentCancellationCount,
          })
        : null;

    this.realtimeService.publish({
      channel: 'ride-request',
      type: 'ride-request.cancelled',
      entityId: cancelledRequest.id,
      riderId: cancelledRequest.riderId,
      actorRole: auth.user.role,
      payload: {
        status: cancelledRequest.status,
        cancellationPolicy: cancellationPolicy
          ? {
              ...cancellationPolicy,
              supportTicketId,
            }
          : undefined,
      },
    });

    return {
      rideRequest: {
        id: cancelledRequest.id,
        status: cancelledRequest.status,
        pickupAddress: cancelledRequest.pickupAddress,
        destinationAddress: cancelledRequest.destinationAddress,
        updatedAt: cancelledRequest.updatedAt.toISOString(),
      },
      ...(cancellationPolicy
        ? {
            cancellationPolicy: {
              ...cancellationPolicy,
              supportTicketId,
            },
          }
        : {}),
    };
  }

  private async resolveRiderCancellationPolicy(
    riderId: string,
  ): Promise<{
    level: 'CLEAR' | 'WATCH' | 'AT_RISK' | 'SUPPORT_REVIEW';
    recentCancellationCount: number;
    feeRisk: boolean;
    message: string;
  }> {
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const previousCancellationCount = await this.prisma.rideRequest.count({
      where: {
        riderId,
        status: 'CANCELLED',
        updatedAt: {
          gte: windowStart,
        },
      },
    });
    const recentCancellationCount = previousCancellationCount + 1;

    if (recentCancellationCount >= 4) {
      return {
        level: 'SUPPORT_REVIEW',
        recentCancellationCount,
        feeRisk: true,
        message:
          'Annulations repetees detectees. Le support Orbi est alerte; des frais peuvent s appliquer si un chauffeur se deplace deja sur les prochaines commandes.',
      };
    }

    if (recentCancellationCount === 3) {
      return {
        level: 'AT_RISK',
        recentCancellationCount,
        feeRisk: true,
        message:
          'Troisieme annulation recente. Les prochaines annulations apres assignation chauffeur pourront etre revues par le support.',
      };
    }

    if (recentCancellationCount === 2) {
      return {
        level: 'WATCH',
        recentCancellationCount,
        feeRisk: false,
        message:
          'Annulation prise en compte. Evitez les annulations repetees pour proteger le temps des chauffeurs.',
      };
    }

    return {
      level: 'CLEAR',
      recentCancellationCount,
      feeRisk: false,
      message: 'Annulation gratuite prise en compte avant affectation chauffeur.',
    };
  }

  private async createRepeatedCancellationSupportTicket(input: {
    userId: string;
    rideRequestId: string;
    recentCancellationCount: number;
  }) {
    try {
      const ticket = await this.prisma.supportTicket.create({
        data: {
          userId: input.userId,
          subject: `Annulations repetees rider ${input.userId}`,
          description:
            `Le rider a annule ${input.recentCancellationCount} demandes sur 24h. ` +
            `Derniere demande: ${input.rideRequestId}. Verifier contexte, abus possible, paiement/refund et besoin d accompagnement.`,
          priority: 2,
        },
        select: {
          id: true,
        },
      });

      return ticket.id;
    } catch (error) {
      this.logger.warn(
        `Unable to create repeated cancellation support ticket for rider ${input.userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }

  private async dispatchAndNotify(input: {
    rideRequestId: string;
    riderId: string;
    requestedVehicleType: string;
    requestedServiceTier: string | null;
    estimatedDistanceKm: number;
    estimatedDurationMinutes: number;
    pickupLatitude: number | null;
    pickupLongitude: number | null;
    pickupAddress: string;
    createdAt: Date;
  }): Promise<void> {
    try {
      const result = await this.dispatchCoordinator.proactiveDispatch({
        rideRequestId: input.rideRequestId,
        riderId: input.riderId,
        requestedVehicleType: input.requestedVehicleType as never,
        requestedServiceTier: input.requestedServiceTier as never,
        estimatedDistanceKm: input.estimatedDistanceKm,
        estimatedDurationMinutes: input.estimatedDurationMinutes,
        pickupLatitude: input.pickupLatitude,
        pickupLongitude: input.pickupLongitude,
        pickupAddress: input.pickupAddress,
        createdAt: input.createdAt,
      });

      if (result.dispatched && result.assignedUserId) {
        await this.notificationsService.enqueue({
          userId: result.assignedUserId,
          title: 'Course pour vous !',
          body: `Prise en charge : ${input.pickupAddress}`,
          channel: NotificationChannel.PUSH,
          dedupeKey: `proactive:${input.rideRequestId}:${result.assignedDriverId}`,
          data: { type: 'new_offer', rideRequestId: input.rideRequestId },
        });
        return;
      }

      // fallback : broadcast si aucun driver sélectionné
      await this.broadcastToOnlineDrivers({
        rideRequestId: input.rideRequestId,
        pickupAddress: input.pickupAddress,
      });
    } catch (error) {
      this.logger.error(
        `Dispatch failed for request ${input.rideRequestId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private async broadcastToOnlineDrivers(input: {
    rideRequestId: string;
    pickupAddress: string;
  }): Promise<void> {
    try {
      const now = new Date();
      const freshPresenceCutoff = new Date(now.getTime() - 90_000);
      const freshSessionCutoff = new Date(now.getTime() - 10 * 60_000);
      const onlineDrivers = await this.prisma.driverProfile.findMany({
        where: {
          status: 'ONLINE',
          user: {
            isActive: true,
            sessions: {
              some: {
                revokedAt: null,
                expiresAt: { gt: now },
                lastSeenAt: { gte: freshSessionCutoff },
              },
            },
          },
          currentLatitude: { not: null },
          currentLongitude: { not: null },
          currentLocationUpdatedAt: { gte: freshPresenceCutoff },
        },
        select: { userId: true },
        take: 100,
      });

      await Promise.allSettled(
        onlineDrivers.map((driver) =>
          this.notificationsService.enqueue({
            userId: driver.userId,
            title: 'Nouvelle course disponible !',
            body: `Prise en charge : ${input.pickupAddress}`,
            channel: NotificationChannel.PUSH,
            dedupeKey: `new_request:${input.rideRequestId}:${driver.userId}`,
            data: { type: 'new_offer', rideRequestId: input.rideRequestId },
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast request ${input.rideRequestId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
