import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DriverStatus,
  DriverDocumentStatus,
  DriverDocumentType,
  DriverOnboardingReviewStatus,
  Prisma,
  ServiceTier,
  VerificationStatus,
  VehicleType,
} from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FeatureFlagsService } from '../../core/runtime/feature-flags.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { DocumentLinksService } from '../../common/document-links/document-links.service';
import { JobQueueService } from '../../common/job-queue/job-queue.service';
import { RequestDriverDocumentUploadLinksDto } from './dto/request-driver-document-upload-links.dto';
import { UpsertDriverOnboardingDto } from './dto/upsert-driver-onboarding.dto';
import { ACTIVE_TRIP_STATUSES } from '../trips/trips.constants';
import { DispatchCoordinator } from './dispatch-coordinator.service';
import {
  driverFatigueWindowHours,
  evaluateDriverFatigue,
} from './driver-fatigue.policy';

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

const driverPayoutRateBps = 8200;
const driverPayoutRate = driverPayoutRateBps / 10_000;
const isoUtcDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

function normalizePlateNumber(value: string) {
  return value.trim().toUpperCase();
}

export function parseStrictDriverDocumentExpiry(value: string) {
  const match = isoUtcDateTimePattern.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = match[7] ? Number(match[7]) : 0;
  const date = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond),
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }

  return date;
}

// Bruit gaussien Box-Muller : ±~100 m (0.0009°) — assez pour empêcher le
// tracking précis tout en conservant l'utilité de la carte de proximité.
function fuzzCoordinates(
  latitude: number,
  longitude: number,
): { latitude: number; longitude: number } {
  const noiseDegreesLat = 0.0009;
  const noiseDegreesLng = 0.0009;
  // Box-Muller transform pour bruit gaussien centré.
  const u1 = Math.random() || Number.EPSILON;
  const u2 = Math.random() || Number.EPSILON;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return {
    latitude: Number((latitude + z * noiseDegreesLat).toFixed(6)),
    longitude: Number((longitude + z * noiseDegreesLng).toFixed(6)),
  };
}

function summarizeReviewStatus(
  reviewStatus: DriverOnboardingReviewStatus | null,
) {
  switch (reviewStatus) {
    case DriverOnboardingReviewStatus.APPROVED:
      return 'Profil approuve et pret pour les courses.';
    case DriverOnboardingReviewStatus.REJECTED:
      return 'Le dossier a ete rejete. Une nouvelle soumission complete est necessaire.';
    case DriverOnboardingReviewStatus.CHANGES_REQUESTED:
      return 'Des corrections ou justificatifs complementaires sont demandes par les operations.';
    case DriverOnboardingReviewStatus.UNDER_REVIEW:
      return 'Le dossier est en cours de revue operations.';
    case DriverOnboardingReviewStatus.SUBMITTED:
    default:
      return 'Le dossier reste en revue operations tant que tous les justificatifs ne sont pas valides.';
  }
}

function resolveEffectiveDocumentStatus(document: {
  status: DriverDocumentStatus;
  expiresAt?: Date | null;
}) {
  if (
    document.expiresAt &&
    document.expiresAt.getTime() <= Date.now() &&
    document.status !== DriverDocumentStatus.APPROVED
  ) {
    return DriverDocumentStatus.EXPIRED;
  }

  if (
    document.expiresAt &&
    document.expiresAt.getTime() <= Date.now() &&
    document.status === DriverDocumentStatus.APPROVED
  ) {
    return DriverDocumentStatus.EXPIRED;
  }

  return document.status;
}

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentLinksService: DocumentLinksService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly dispatchCoordinator: DispatchCoordinator,
    private readonly jobQueueService: JobQueueService,
  ) {}

  async getDispatchLearningSettings() {
    return this.dispatchCoordinator.getDispatchLearningSettings();
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
  }) {
    return this.dispatchCoordinator.updateDispatchLearningSettings(input);
  }

  async overview() {
    const drivers = await this.prisma.driverProfile.findMany({
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
            phoneNumber: true,
            isActive: true,
            isPhoneVerified: true,
            createdAt: true,
          },
        },
        vehicles: {
          select: {
            id: true,
            plateNumber: true,
            make: true,
            model: true,
            type: true,
            isActive: true,
          },
        },
      },
      take: 25,
      orderBy: { createdAt: 'desc' },
    });

    return {
      total: drivers.length,
      drivers: drivers.map((d) => ({
        id: d.id,
        userId: d.userId,
        fullName: d.user.fullName,
        email: d.user.email,
        phoneNumber: d.user.phoneNumber,
        isActive: d.user.isActive,
        isPhoneVerified: d.user.isPhoneVerified,
        status: d.status,
        verificationStatus: d.verificationStatus,
        vehicles: d.vehicles,
        createdAt: d.user.createdAt.toISOString(),
      })),
    };
  }

  async previewOffers() {
    const requests = await this.prisma.rideRequest.findMany({
      where: {
        status: {
          in: ['REQUESTED', 'MATCHED'],
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
      take: 8,
    });

    return requests.map((request, index) => {
      const fare = Number(request.estimatedFare ?? 0);

      return {
        id: request.id,
        riderName: request.rider.user.fullName,
        pickup: request.pickupAddress,
        destination: request.destinationAddress,
        category:
          request.requestedVehicleType === 'MOTORCYCLE' ? 'motorcycle' : 'car',
        fare,
        distanceKm: Number(request.estimatedDistanceKm ?? 0),
        etaToPickupMinutes: 3 + index,
        driverPayout: Math.round(fare * 0.82),
        pickupCodeRequired: true,
      };
    });
  }

  async getMe(auth: RequestAuthContext) {
    this.assertDriverOnboardingEnabled(auth);
    const profile = await this.loadDriverProfile(auth);

    const [onboardingSummary, fatigue, dispatchSignal] = await Promise.all([
      this.buildOnboardingSummary(profile.id),
      this.resolveDriverFatigue(profile.id),
      this.dispatchCoordinator.getDriverAcceptanceSignal(profile.id),
    ]);

    return {
      profile: {
        id: profile.id,
        fullName: profile.user.fullName,
        email: profile.user.email,
        phoneNumber: profile.user.phoneNumber,
        status: profile.status,
        verificationStatus: profile.verificationStatus,
        serviceRadiusKm: toNumber(profile.serviceRadiusKm),
        currentLatitude: toNumber(profile.currentLatitude),
        currentLongitude: toNumber(profile.currentLongitude),
        averageRating: toNumber(profile.averageRating),
        completedTripsCount: profile.completedTripsCount,
        fatigue,
        onboarding: onboardingSummary,
        vehicles: profile.vehicles.map((vehicle) => ({
          id: vehicle.id,
          plateNumber: vehicle.plateNumber,
          make: vehicle.make,
          model: vehicle.model,
          color: vehicle.color,
          type: vehicle.type,
          tier: vehicle.tier,
          isActive: vehicle.isActive,
        })),
        dispatchSignal: {
          acceptanceRate: dispatchSignal.acceptanceRate,
          score: dispatchSignal.score,
          freshness: dispatchSignal.freshness,
        },
      },
    };
  }

  async getOnboarding(auth: RequestAuthContext) {
    this.assertDriverOnboardingEnabled(auth);
    const profile = await this.loadDriverProfile(auth);

    return {
      onboarding: await this.buildOnboardingSummary(profile.id),
    };
  }

  async upsertOnboarding(
    auth: RequestAuthContext,
    payload: UpsertDriverOnboardingDto,
  ) {
    this.assertDriverOnboardingEnabled(auth);
    const profile = await this.loadDriverProfile(auth);

    await this.prisma.user.update({
      where: {
        id: auth.user.id,
      },
      data: {
        phoneNumber: payload.phoneNumber?.trim() || auth.user.phoneNumber,
      },
    });

    await this.prisma.driverProfile.update({
      where: {
        id: profile.id,
      },
      data: {
        licenseNumber: payload.licenseNumber.trim(),
        serviceRadiusKm: payload.serviceRadiusKm,
        verificationStatus:
          process.env.FEATURE_FLAG_DRIVER_AUTO_ONBOARD === 'on'
            ? VerificationStatus.APPROVED
            : VerificationStatus.PENDING,
        status:
          profile.status === DriverStatus.SUSPENDED
            ? DriverStatus.SUSPENDED
            : DriverStatus.OFFLINE,
      },
    });

    for (const vehicle of payload.vehicles) {
      const normalizedPlateNumber = normalizePlateNumber(vehicle.plateNumber);
      const existingVehicle = await this.prisma.vehicle.findUnique({
        where: {
          plateNumber: normalizedPlateNumber,
        },
      });

      if (existingVehicle && existingVehicle.driverId !== profile.id) {
        throw new ConflictException(
          `Vehicle ${normalizedPlateNumber} is already assigned to another driver profile.`,
        );
      }

      if (existingVehicle) {
        await this.prisma.vehicle.update({
          where: {
            id: existingVehicle.id,
          },
          data: {
            make: vehicle.make.trim(),
            model: vehicle.model.trim(),
            color: vehicle.color.trim(),
            year: vehicle.year,
            type: vehicle.type as VehicleType,
            tier: vehicle.tier as ServiceTier,
            seats: vehicle.seats,
            isActive: true,
          },
        });

        continue;
      }

      await this.prisma.vehicle.create({
        data: {
          driverId: profile.id,
          plateNumber: normalizedPlateNumber,
          make: vehicle.make.trim(),
          model: vehicle.model.trim(),
          color: vehicle.color.trim(),
          year: vehicle.year,
          type: vehicle.type as VehicleType,
          tier: vehicle.tier as ServiceTier,
          seats: vehicle.seats,
          isActive: true,
        },
      });
    }

    if (payload.documentArtifacts?.length) {
      for (const artifact of payload.documentArtifacts) {
        const normalizedStorageKey = artifact.storageKey.trim();
        this.assertDocumentArtifactOwnedByProfile(
          profile.id,
          normalizedStorageKey,
        );
        const validatedArtifact =
          this.documentLinksService.validateUploadedArtifact({
            documentType: artifact.type,
            fileName: artifact.fileName,
            storageKey: normalizedStorageKey,
            mimeType: artifact.mimeType,
            sizeBytes: artifact.sizeBytes,
            sha256: artifact.sha256,
            uploadSource: artifact.uploadSource,
          });
        const expiresAt = artifact.expiresAt
          ? parseStrictDriverDocumentExpiry(artifact.expiresAt)
          : null;

        if (artifact.expiresAt && !expiresAt) {
          throw new BadRequestException(
            'Driver document expiresAt must be a real UTC ISO instant.',
          );
        }

        const existingDocument = await this.prisma.driverDocument.findUnique({
          where: {
            storageKey: normalizedStorageKey,
          },
        });

        if (
          existingDocument &&
          existingDocument.driverProfileId !== profile.id
        ) {
          throw new ConflictException(
            `Driver document ${normalizedStorageKey} is already linked to another driver profile.`,
          );
        }

        if (existingDocument) {
          const updatedDocument = await this.prisma.driverDocument.update({
            where: {
              id: existingDocument.id,
            },
            data: {
              type: artifact.type as DriverDocumentType,
              fileName: validatedArtifact.fileName,
              mimeType: validatedArtifact.mimeType,
              expiresAt,
              status: DriverDocumentStatus.PENDING,
              rejectionReason: null,
              reviewedAt: null,
              reviewedByUserId: null,
              metadata: {
                uploadPolicy: validatedArtifact.constraints,
                integrity: validatedArtifact.integrity,
                objectVerification: validatedArtifact.objectVerification,
              } as Prisma.InputJsonValue,
            },
          });
          await this.enqueueDriverDocumentVerification(
            profile.id,
            updatedDocument.id,
            artifact.type,
            normalizedStorageKey,
            validatedArtifact.objectVerification.state,
          );

          continue;
        }

        const createdDocument = await this.prisma.driverDocument.create({
          data: {
            driverProfileId: profile.id,
            type: artifact.type as DriverDocumentType,
            fileName: validatedArtifact.fileName,
            storageKey: normalizedStorageKey,
            mimeType: validatedArtifact.mimeType,
            expiresAt,
            status: DriverDocumentStatus.PENDING,
            metadata: {
              uploadPolicy: validatedArtifact.constraints,
              integrity: validatedArtifact.integrity,
              objectVerification: validatedArtifact.objectVerification,
            } as Prisma.InputJsonValue,
          },
        });
        await this.enqueueDriverDocumentVerification(
          profile.id,
          createdDocument.id,
          artifact.type,
          normalizedStorageKey,
          validatedArtifact.objectVerification.state,
        );
      }
    }

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_ONBOARDING_SUBMITTED',
        entityType: 'DRIVER_PROFILE',
        entityId: profile.id,
        metadata: {
          city: payload.city,
          documents: {
            identityDocumentProvided:
              payload.documents.identityDocumentProvided,
            driverLicenseProvided: payload.documents.driverLicenseProvided,
            vehicleRegistrationProvided:
              payload.documents.vehicleRegistrationProvided,
            insuranceProofProvided: payload.documents.insuranceProofProvided,
            selfieMatchProvided: payload.documents.selfieMatchProvided,
          },
          vehicleCount: payload.vehicles.length,
          serviceRadiusKm: payload.serviceRadiusKm,
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.driverOnboardingReview.create({
      data: {
        driverProfileId: profile.id,
        status: DriverOnboardingReviewStatus.SUBMITTED,
        actorUserId: auth.user.id,
        metadata: {
          city: payload.city,
          serviceRadiusKm: payload.serviceRadiusKm,
          checklist: payload.documents,
          documentArtifactCount: payload.documentArtifacts?.length ?? 0,
          vehicleCount: payload.vehicles.length,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      onboarding: await this.buildOnboardingSummary(profile.id),
    };
  }

  async createDocumentUploadLinks(
    auth: RequestAuthContext,
    payload: RequestDriverDocumentUploadLinksDto,
  ) {
    this.assertDriverOnboardingEnabled(auth);
    const profile = await this.loadDriverProfile(auth);
    const links = payload.documents.map((document) =>
      this.documentLinksService.createUploadLink({
        driverProfileId: profile.id,
        documentType: document.type,
        fileName: document.fileName,
        mimeType: document.mimeType,
        expiresAt: document.expiresAt,
      }),
    );

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_DOCUMENT_UPLOAD_LINKS_CREATED',
        entityType: 'DRIVER_PROFILE',
        entityId: profile.id,
        metadata: {
          documentTypes: payload.documents.map((document) => document.type),
          linkCount: links.length,
          storageKeys: links.map((link) => link.storageKey),
          expiresAt: links.map((link) => link.expiresAt),
        } as Prisma.InputJsonValue,
      },
    });

    return {
      links,
    };
  }

  async getEarnings(auth: RequestAuthContext) {
    const driverProfileId = auth.user.driverProfile?.id;

    if (!driverProfileId) {
      throw new NotFoundException(
        'No driver profile found for the authenticated user.',
      );
    }

    const trips = await this.prisma.trip.findMany({
      where: {
        driverId: driverProfileId,
        status: 'COMPLETED',
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: 25,
    });

    const now = Date.now();
    const oneDayAgo = now - 1000 * 60 * 60 * 24;
    const oneWeekAgo = now - 1000 * 60 * 60 * 24 * 7;
    const oneMonthAgo = now - 1000 * 60 * 60 * 24 * 30;

    const payouts = trips.map((trip) => ({
      ...trip,
      payout: Math.round(Number(trip.actualFare ?? 0) * driverPayoutRate),
      grossFare: Math.round(Number(trip.actualFare ?? 0)),
      effectiveDate: trip.completedAt ?? trip.createdAt,
    }));

    const today = payouts
      .filter((trip) => trip.effectiveDate.getTime() >= oneDayAgo)
      .reduce((sum, trip) => sum + trip.payout, 0);
    const week = payouts
      .filter((trip) => trip.effectiveDate.getTime() >= oneWeekAgo)
      .reduce((sum, trip) => sum + trip.payout, 0);
    const month = payouts
      .filter((trip) => trip.effectiveDate.getTime() >= oneMonthAgo)
      .reduce((sum, trip) => sum + trip.payout, 0);
    const totalPayout = payouts.reduce((sum, trip) => sum + trip.payout, 0);
    const recentTrips = payouts.slice(0, 8);
    const recentGrossFare = recentTrips.reduce(
      (sum, trip) => sum + trip.grossFare,
      0,
    );
    const recentNetPayout = recentTrips.reduce(
      (sum, trip) => sum + trip.payout,
      0,
    );
    const recentPlatformFee = Math.max(0, recentGrossFare - recentNetPayout);
    const settlementAnomalies = [
      today > week ? 'today_exceeds_week' : null,
      week > month ? 'week_exceeds_month' : null,
    ].filter((item): item is string => Boolean(item));

    return {
      summary: {
        currency: 'XOF',
        today,
        week,
        month,
        completedTrips: payouts.length,
        averagePayout: payouts.length
          ? Math.round(totalPayout / payouts.length)
          : 0,
      },
      settlement: {
        currency: 'XOF',
        source: 'COMPLETED_TRIPS',
        payoutRateBps: driverPayoutRateBps,
        payoutRate: driverPayoutRate,
        recentTripCount: recentTrips.length,
        recentGrossFare,
        recentNetPayout,
        recentPlatformFee,
        state: settlementAnomalies.length ? 'REVIEW_REQUIRED' : 'RECONCILED',
        anomalies: settlementAnomalies,
        calculatedAt: new Date(now).toISOString(),
      },
      recentTrips: recentTrips.map((trip) => ({
        id: trip.id,
        route: `${trip.pickupAddress} vers ${trip.destinationAddress}`,
        payout: trip.payout,
        grossFare: trip.grossFare,
        platformFee: Math.max(0, trip.grossFare - trip.payout),
        status: trip.status,
        completedAt: trip.completedAt?.toISOString() ?? null,
      })),
    };
  }

  async getOffers(auth: RequestAuthContext) {
    return this.dispatchCoordinator.getOffers(auth);
  }

  async declineOffer(auth: RequestAuthContext, rideRequestId: string) {
    return this.dispatchCoordinator.declineOffer(auth, rideRequestId);
  }

  async updatePresence(
    auth: RequestAuthContext,
    payload: { latitude: number; longitude: number },
  ) {
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
        status: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile could not be loaded.');
    }

    const updatedProfile = await this.prisma.driverProfile.update({
      where: {
        id: driverProfileId,
      },
      data: {
        currentLatitude: payload.latitude,
        currentLongitude: payload.longitude,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_PRESENCE_UPDATED',
        entityType: 'DRIVER_PROFILE',
        entityId: driverProfileId,
        metadata: {
          latitude: payload.latitude,
          longitude: payload.longitude,
          status: profile.status,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      presence: {
        driverId: updatedProfile.id,
        status: updatedProfile.status,
        latitude: toNumber(updatedProfile.currentLatitude),
        longitude: toNumber(updatedProfile.currentLongitude),
      },
    };
  }

  async updateAvailability(
    auth: RequestAuthContext,
    nextStatus: 'ONLINE' | 'OFFLINE',
  ) {
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
      include: {
        vehicles: {
          where: {
            isActive: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile could not be loaded.');
    }

    if (profile.status === DriverStatus.SUSPENDED) {
      throw new BadRequestException(
        'A suspended driver cannot change availability.',
      );
    }

    if (
      nextStatus === DriverStatus.ONLINE &&
      profile.verificationStatus !== VerificationStatus.APPROVED
    ) {
      throw new BadRequestException('Only approved drivers can go online.');
    }

    if (
      nextStatus === DriverStatus.ONLINE &&
      !profile.vehicles.some((vehicle) => vehicle.isActive)
    ) {
      throw new BadRequestException(
        'An active vehicle is required before going online.',
      );
    }

    if (nextStatus === DriverStatus.ONLINE) {
      const expiredApprovedDocuments = await this.prisma.driverDocument.count({
        where: {
          driverProfileId,
          status: DriverDocumentStatus.APPROVED,
          expiresAt: {
            lte: new Date(),
          },
        },
      });

      if (expiredApprovedDocuments > 0) {
        await this.prisma.auditLog.create({
          data: {
            userId: auth.user.id,
            action: 'DRIVER_DOCUMENT_RENEWAL_AVAILABILITY_BLOCKED',
            entityType: 'DRIVER_PROFILE',
            entityId: driverProfileId,
            metadata: {
              expiredApprovedDocuments,
            } as Prisma.InputJsonValue,
          },
        });

        throw new BadRequestException(
          'Document chauffeur expire: renouvellement requis avant mise en ligne.',
        );
      }
    }

    if (nextStatus === DriverStatus.ONLINE) {
      const fatigue = await this.resolveDriverFatigue(driverProfileId);

      if (fatigue.state === 'blocked') {
        await this.prisma.auditLog.create({
          data: {
            userId: auth.user.id,
            action: 'DRIVER_FATIGUE_AVAILABILITY_BLOCKED',
            entityType: 'DRIVER_PROFILE',
            entityId: driverProfileId,
            metadata: {
              completedTrips: fatigue.completedTrips,
              drivingMinutes: fatigue.drivingMinutes,
              restUntil: fatigue.restUntil,
            } as Prisma.InputJsonValue,
          },
        });

        throw new BadRequestException(
          `Pause chauffeur requise jusqu a ${fatigue.restUntil}.`,
        );
      }
    }

    const activeTrip = await this.prisma.trip.findFirst({
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

    if (nextStatus === DriverStatus.OFFLINE && activeTrip) {
      throw new BadRequestException(
        'The driver cannot go offline during an active trip.',
      );
    }

    if (nextStatus === DriverStatus.OFFLINE) {
      await this.releaseDriverReservations(driverProfileId);
    }

    const updatedProfile = await this.prisma.driverProfile.update({
      where: {
        id: driverProfileId,
      },
      data: {
        status: nextStatus,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_AVAILABILITY_UPDATED',
        entityType: 'DRIVER_PROFILE',
        entityId: driverProfileId,
        metadata: {
          status: nextStatus,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      availability: {
        driverId: updatedProfile.id,
        status: updatedProfile.status,
        fatigue: await this.resolveDriverFatigue(driverProfileId),
      },
    };
  }

  async getNearbyDrivers(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<{
    drivers: Array<{
      id: string;
      latitude: number;
      longitude: number;
      vehicleType: string | null;
      status: string;
    }>;
    total: number;
  }> {
    const profiles = await this.prisma.driverProfile.findMany({
      where: {
        status: DriverStatus.ONLINE,
        currentLatitude: { not: null },
        currentLongitude: { not: null },
      },
      select: {
        id: true,
        status: true,
        currentLatitude: true,
        currentLongitude: true,
        vehicles: {
          where: { isActive: true },
          select: { type: true },
          take: 1,
        },
      },
      take: 40,
    });

    const R = 6371;
    const nearby = profiles.filter((p) => {
      const dLat = ((toNumber(p.currentLatitude)! - lat) * Math.PI) / 180;
      const dLng = ((toNumber(p.currentLongitude)! - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((toNumber(p.currentLatitude)! * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return distKm <= radiusKm;
    });

    return {
      drivers: nearby.map((p) => {
        // Floutage de position : bruit gaussien ±~100 m (≈ 0.0009°) pour empêcher
        // le tracking précis des chauffeurs sans dégrader l'utilité de la carte.
        const fuzzed = fuzzCoordinates(
          toNumber(p.currentLatitude)!,
          toNumber(p.currentLongitude)!,
        );
        return {
          id: p.id.slice(0, 8),
          latitude: fuzzed.latitude,
          longitude: fuzzed.longitude,
          vehicleType: p.vehicles[0]?.type ?? null,
          status: p.status,
        };
      }),
      total: nearby.length,
    };
  }

  private async resolveDriverFatigue(driverProfileId: string) {
    const since = new Date(
      Date.now() - driverFatigueWindowHours * 60 * 60 * 1000,
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
      now: new Date(),
      trips,
    });

    return {
      ...fatigue,
      restUntil: fatigue.restUntil?.toISOString() ?? null,
    };
  }

  private async loadDriverProfile(auth: RequestAuthContext) {
    const driverProfileId = auth.user.driverProfile?.id;

    if (!driverProfileId) {
      throw new NotFoundException(
        'No driver profile found for the authenticated user.',
      );
    }

    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      select: {
        id: true,
        status: true,
        verificationStatus: true,
        serviceRadiusKm: true,
        currentLatitude: true,
        currentLongitude: true,
        averageRating: true,
        completedTripsCount: true,
        licenseNumber: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phoneNumber: true,
          },
        },
        vehicles: {
          select: {
            id: true,
            plateNumber: true,
            make: true,
            model: true,
            color: true,
            type: true,
            tier: true,
            seats: true,
            isActive: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile could not be loaded.');
    }

    return profile;
  }

  private assertDriverOnboardingEnabled(auth: RequestAuthContext) {
    if (
      !this.featureFlagsService.isEnabled('driverOnboarding', {
        actorId: auth.user.id,
      })
    ) {
      throw new ServiceUnavailableException(
        'Driver onboarding is temporarily disabled for this actor during controlled rollout.',
      );
    }
  }

  private async buildOnboardingSummary(driverProfileId: string) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: {
        id: driverProfileId,
      },
      include: {
        user: true,
        vehicles: {
          where: {
            isActive: true,
          },
        },
        onboardingDocuments: {
          orderBy: {
            uploadedAt: 'desc',
          },
        },
        onboardingReviews: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
          include: {
            actor: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile could not be loaded.');
    }

    const latestSubmission = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'DRIVER_PROFILE',
        entityId: driverProfileId,
        action: 'DRIVER_ONBOARDING_SUBMITTED',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const submittedDocuments = (
      latestSubmission?.metadata as Record<string, unknown> | null
    )?.documents as Record<string, boolean> | undefined;
    const latestDocumentsByType = new Map<
      DriverDocumentType,
      (typeof profile.onboardingDocuments)[number]
    >();

    for (const document of profile.onboardingDocuments) {
      if (!latestDocumentsByType.has(document.type)) {
        latestDocumentsByType.set(document.type, document);
      }
    }
    const latestReview = profile.onboardingReviews[0] ?? null;

    const checklist = [
      {
        id: 'phone',
        label: 'Numero de telephone verifie',
        completed: Boolean(profile.user.isPhoneVerified),
      },
      {
        id: 'license',
        label: 'Permis de conduire renseigne et securise',
        completed:
          Boolean(profile.licenseNumber) &&
          this.hasOnboardingDocument(
            latestDocumentsByType,
            DriverDocumentType.DRIVER_LICENSE,
            submittedDocuments?.driverLicenseProvided,
          ),
      },
      {
        id: 'identity',
        label: 'Piece d identite securisee',
        completed: this.hasOnboardingDocument(
          latestDocumentsByType,
          DriverDocumentType.IDENTITY_DOCUMENT,
          submittedDocuments?.identityDocumentProvided,
        ),
      },
      {
        id: 'vehicle-registration',
        label: 'Carte grise securisee',
        completed: this.hasOnboardingDocument(
          latestDocumentsByType,
          DriverDocumentType.VEHICLE_REGISTRATION,
          submittedDocuments?.vehicleRegistrationProvided,
        ),
      },
      {
        id: 'insurance',
        label: 'Assurance securisee',
        completed: this.hasOnboardingDocument(
          latestDocumentsByType,
          DriverDocumentType.INSURANCE_PROOF,
          submittedDocuments?.insuranceProofProvided,
        ),
      },
      {
        id: 'selfie',
        label: 'Selfie de verification securise',
        completed: this.hasOnboardingDocument(
          latestDocumentsByType,
          DriverDocumentType.SELFIE_VERIFICATION,
          submittedDocuments?.selfieMatchProvided,
        ),
      },
      {
        id: 'vehicle',
        label: 'Vehicule actif configure',
        completed: profile.vehicles.length > 0,
      },
    ];

    const completedItems = checklist.filter((item) => item.completed).length;

    return {
      verificationStatus: profile.verificationStatus,
      reviewStatus:
        latestReview?.status ?? DriverOnboardingReviewStatus.SUBMITTED,
      completedItems,
      totalItems: checklist.length,
      readinessPercent: Math.round((completedItems / checklist.length) * 100),
      serviceRadiusKm: toNumber(profile.serviceRadiusKm),
      city:
        ((latestSubmission?.metadata as Record<string, unknown> | null)
          ?.city as string | undefined) ?? null,
      submittedAt: latestSubmission?.createdAt.toISOString() ?? null,
      latestReviewAt: latestReview?.createdAt.toISOString() ?? null,
      latestDecisionReason: latestReview?.decisionReason ?? null,
      reviewActorName: latestReview?.actor.fullName ?? null,
      notes: summarizeReviewStatus(latestReview?.status ?? null),
      checklist,
      documents: [
        DriverDocumentType.IDENTITY_DOCUMENT,
        DriverDocumentType.DRIVER_LICENSE,
        DriverDocumentType.VEHICLE_REGISTRATION,
        DriverDocumentType.INSURANCE_PROOF,
        DriverDocumentType.SELFIE_VERIFICATION,
      ].map((documentType) => {
        const document = latestDocumentsByType.get(documentType) ?? null;
        const effectiveStatus = document
          ? resolveEffectiveDocumentStatus(document)
          : DriverDocumentStatus.PENDING;

        return {
          type: documentType,
          status: effectiveStatus,
          fileName: document?.fileName ?? null,
          uploadedAt: document?.uploadedAt.toISOString() ?? null,
          expiresAt: document?.expiresAt?.toISOString() ?? null,
          reviewedAt: document?.reviewedAt?.toISOString() ?? null,
          rejectionReason: document?.rejectionReason ?? null,
        };
      }),
      reviewTimeline: profile.onboardingReviews.map((review) => ({
        id: review.id,
        status: review.status,
        actorName: review.actor.fullName,
        decisionReason: review.decisionReason ?? null,
        createdAt: review.createdAt.toISOString(),
      })),
    };
  }

  private hasOnboardingDocument(
    latestDocumentsByType: Map<
      DriverDocumentType,
      { status: DriverDocumentStatus }
    >,
    type: DriverDocumentType,
    fallbackCompletion?: boolean,
  ) {
    const document = latestDocumentsByType.get(type);

    if (!document) {
      return Boolean(fallbackCompletion);
    }

    const effectiveStatus = resolveEffectiveDocumentStatus(document);

    return (
      effectiveStatus !== DriverDocumentStatus.REJECTED &&
      effectiveStatus !== DriverDocumentStatus.EXPIRED
    );
  }

  private assertDocumentArtifactOwnedByProfile(
    driverProfileId: string,
    storageKey: string,
  ) {
    const expectedPrefix = `${driverProfileId}/`;

    if (
      !storageKey.startsWith(expectedPrefix) ||
      storageKey.includes('..') ||
      storageKey.includes('\\') ||
      storageKey.length > 240
    ) {
      throw new BadRequestException(
        'Driver document storage key is not valid for this profile.',
      );
    }
  }

  async expireStaleReservations(now = new Date()) {
    return this.dispatchCoordinator.expireStaleReservations(now);
  }

  private async releaseDriverReservations(driverProfileId: string) {
    await this.dispatchCoordinator.releaseDriverReservations(driverProfileId);
  }

  private async enqueueDriverDocumentVerification(
    driverProfileId: string,
    documentId: string,
    documentType: string,
    storageKey: string,
    objectVerificationState: string,
  ) {
    await this.jobQueueService.enqueue({
      kind: 'DRIVER_DOCUMENT',
      dedupeKey: `driver-document:${documentId}:artifact-uploaded`,
      entityType: 'driver_document',
      entityId: documentId,
      payload: {
        driverProfileId,
        documentId,
        documentType,
        storageKey,
        objectVerificationState,
      },
    });
  }
}
