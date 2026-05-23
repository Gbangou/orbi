import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { PricingService } from '../pricing/pricing.service';
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
} from './ride-request-creation.policy';
import { RideRequestProjector } from './ride-request.projector';

@Injectable()
export class RideRequestsService {
  private readonly logger = new Logger(RideRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly realtimeService: RealtimeService,
    private readonly rideRequestProjector: RideRequestProjector,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(payload: CreateRideRequestDto) {
    assertRideRequestPayloadConsistency(payload);
    const routeMetrics = resolveRideRequestRouteMetrics(payload);
    const pricingGeography = resolveRideRequestPricingGeography(payload);
    const operatingContext = this.pricingService.deriveOperatingContext({
      vehicleType: payload.requestedVehicleType,
      zone: payload.pickupAreaType,
      isPeakHour: inferRideRequestPeakHour(),
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
      isPeakHour: inferRideRequestPeakHour(),
    });
    const createData = buildRideRequestCreateData(
      payload,
      pricing.estimatedFare,
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

        return {
          rideRequest: await tx.rideRequest.create({
            data: createData,
          }),
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
      throw new BadRequestException('Ride request could not be created.');
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

      void this.notifyOnlineDriversOfNewRequest({
        rideRequestId: rideRequest.id,
        pickupAddress: rideRequest.pickupAddress,
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
      this.sameRoundedNumber(
        existing.estimatedDurationMinutes,
        next.estimatedDurationMinutes,
      )
    );
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

    return Math.abs(Number(left) - Number(right)) < 0.0001;
  }

  private sameRoundedNumber(left: unknown, right: unknown) {
    return Math.round(Number(left)) === Math.round(Number(right));
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

    const cancelledRequest = await this.prisma.rideRequest.update({
      where: {
        id: rideRequestId,
      },
      data: {
        status: 'CANCELLED',
      },
    });

    this.realtimeService.publish({
      channel: 'ride-request',
      type: 'ride-request.cancelled',
      entityId: cancelledRequest.id,
      riderId: cancelledRequest.riderId,
      actorRole: auth.user.role,
      payload: {
        status: cancelledRequest.status,
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
    };
  }

  private async notifyOnlineDriversOfNewRequest(input: {
    rideRequestId: string;
    pickupAddress: string;
  }): Promise<void> {
    try {
      const onlineDrivers = await this.prisma.driverProfile.findMany({
        where: { status: 'ONLINE' },
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
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify drivers of new request ${input.rideRequestId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
