import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TripStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import type { RequestAuthContext } from '../auth/auth.types';
import {
  ACTIVE_RIDE_REQUEST_STATUSES,
  ACTIVE_TRIP_STATUSES,
  ALLOWED_TRIP_TRANSITIONS,
  TRIP_EVENT_BY_STATUS,
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

  async acceptRideRequest(auth: RequestAuthContext, rideRequestId: string) {
    const driverProfileId = auth.user.driverProfile?.id;

    if (!driverProfileId) {
      throw new NotFoundException(
        'No driver profile found for the authenticated user.',
      );
    }

    const now = new Date();
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
    },
  ) {
    const priority = Math.min(3, Math.max(1, payload.priority ?? 2));
    const normalizedIncidentType = payload.incidentType.trim().toUpperCase();
    const details = payload.details?.trim() ?? '';

    const { ticket, trip } = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: {
          id: tripId,
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

      const ticket = await tx.supportTicket.create({
        data: {
          userId: auth.user.id,
          subject: `Incident trajet ${trip.id}`,
          description: [
            `Type: ${normalizedIncidentType}`,
            `Trip: ${trip.id}`,
            `Role: ${auth.user.role}`,
            details ? `Details: ${details}` : null,
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
            create: {
              eventType: 'INCIDENT_REPORTED',
              payload: {
                incidentType: normalizedIncidentType,
                details: details || null,
                priority,
                reportedByRole: auth.user.role,
                reportedByUserId: auth.user.id,
              },
            },
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
      type: 'trip.incident-reported',
      entityId: trip.id,
      riderId: trip.riderId,
      driverId: trip.driverId,
      actorRole: auth.user.role,
      payload: {
        incidentType: normalizedIncidentType,
        priority,
        ticketStatus: 'OPEN',
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
      throw new BadRequestException(
        'This trip does not belong to the authenticated rider.',
      );
    }

    if (
      auth.user.role === UserRole.DRIVER &&
      trip.driverId !== auth.user.driverProfile?.id
    ) {
      throw new BadRequestException(
        'This trip does not belong to the authenticated driver.',
      );
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
