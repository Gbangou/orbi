import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DriverDocumentStatus,
  DriverOnboardingReviewStatus,
  DriverStatus,
  Prisma,
  SupportTicketStatus,
  VerificationStatus,
} from '@prisma/client';
import {
  PageQueryDto,
  resolvePageQuery,
} from '../../common/dto/page-query.dto';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { DocumentLinksService } from '../../common/document-links/document-links.service';
import { FeatureFlagsService } from '../../core/runtime/feature-flags.service';
import { HealthIncidentJournalService } from '../health/health-incident-journal.service';
import { DriversService } from '../drivers/drivers.service';
import { ACTIVE_TRIP_STATUSES } from '../trips/trips.constants';
import { UpdateDriverOnboardingReviewDto } from './dto/update-driver-onboarding-review.dto';
import { PaymentWebhookEventsQueryDto } from './dto/payment-webhook-events-query.dto';

const reviewDecisionRoles = new Set(['ADMIN', 'OPS']);
const pricingCalibrationLookbackDays = 14;
const platformCommissionRate = 0.18;
const requiredOnboardingDocumentTypes = [
  'IDENTITY_DOCUMENT',
  'DRIVER_LICENSE',
  'VEHICLE_REGISTRATION',
  'INSURANCE_PROOF',
  'SELFIE_VERIFICATION',
] as const;

function formatTripEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    PICKUP_CODE_ISSUED: 'Code de prise en charge genere',
    PICKUP_CODE_VERIFIED: 'Code de prise en charge verifie',
    TRIP_ACCEPTED: 'Course acceptee',
    DRIVER_ARRIVING: 'Chauffeur arrive',
    TRIP_STARTED: 'Course demarree',
    TRIP_COMPLETED: 'Course terminee',
    TRIP_CANCELLED: 'Course annulee',
    INCIDENT_REPORTED: 'Incident signale',
  };

  return labels[eventType] ?? eventType;
}

function toVerificationStatus(reviewStatus: DriverOnboardingReviewStatus) {
  switch (reviewStatus) {
    case DriverOnboardingReviewStatus.APPROVED:
      return VerificationStatus.APPROVED;
    case DriverOnboardingReviewStatus.REJECTED:
    case DriverOnboardingReviewStatus.CHANGES_REQUESTED:
      return VerificationStatus.REJECTED;
    default:
      return VerificationStatus.PENDING;
  }
}

function resolveEffectiveDocumentStatus(document: {
  status: DriverDocumentStatus;
  expiresAt?: Date | null;
}) {
  if (document.expiresAt && document.expiresAt.getTime() <= Date.now()) {
    return DriverDocumentStatus.EXPIRED;
  }

  return document.status;
}

function isDispatchSettingsRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && !Array.isArray(value) && typeof value === 'object';
}

const sensitivePayloadKeys = new Set([
  'authorization',
  'card',
  'cel_phone_num',
  'cpm_phone_prefixe',
  'customerPhoneNumber',
  'email',
  'msisdn',
  'phone',
  'phoneNumber',
  'secret',
  'signature',
  'token',
  'x-token',
]);

function redactPaymentPayload(value: Prisma.JsonValue): Prisma.JsonValue {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactPaymentPayload(item));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitivePayloadKeys.has(key)
        ? '[redacted]'
        : redactPaymentPayload(entry as Prisma.JsonValue),
    ]),
  );
}

function summarizePaymentPayload(value: Prisma.JsonValue) {
  const redacted = redactPaymentPayload(value);

  if (!redacted || typeof redacted !== 'object' || Array.isArray(redacted)) {
    return {};
  }

  const record = redacted as Record<string, Prisma.JsonValue>;
  const fields = [
    'event',
    'status',
    'transactionRef',
    'providerReference',
    'cpm_trans_id',
    'cpm_amount',
    'cpm_currency',
    'payment_method',
    'cpm_error_message',
  ];

  return Object.fromEntries(
    fields
      .filter((field) => record[field] !== undefined && record[field] !== null)
      .map((field) => [field, record[field]]),
  );
}

function normalizeDispatchSettingsValue(value: unknown) {
  if (!isDispatchSettingsRecord(value)) {
    return null;
  }

  const lookbackHours = Number(value.lookbackHours);
  const halfLifeHours = Number(value.halfLifeHours);
  const declineCooldownMinutes = Number(value.declineCooldownMinutes);
  const historyLimit = Number(value.historyLimit);

  if (
    !Number.isFinite(lookbackHours) ||
    !Number.isFinite(halfLifeHours) ||
    !Number.isFinite(declineCooldownMinutes) ||
    !Number.isFinite(historyLimit)
  ) {
    return null;
  }

  return {
    lookbackHours: Math.round(lookbackHours),
    halfLifeHours: Math.round(halfLifeHours),
    declineCooldownMinutes: Math.round(declineCooldownMinutes),
    historyLimit: Math.round(historyLimit),
  };
}

function safeRate(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

function average(values: number[]) {
  const usableValues = values.filter((value) => Number.isFinite(value));

  if (!usableValues.length) {
    return 0;
  }

  return Math.round(
    usableValues.reduce((total, value) => total + value, 0) /
      usableValues.length,
  );
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function resolveOperationalTimeWindow(date: Date) {
  const hour = date.getHours();

  if (hour >= 6 && hour < 10) {
    return {
      key: 'MORNING_PEAK',
      label: 'Pic matin',
      targetAcceptanceRate: 70,
      targetCancellationRate: 16,
    };
  }

  if (hour >= 10 && hour < 16) {
    return {
      key: 'MIDDAY',
      label: 'Journee',
      targetAcceptanceRate: 66,
      targetCancellationRate: 18,
    };
  }

  if (hour >= 16 && hour < 21) {
    return {
      key: 'EVENING_PEAK',
      label: 'Pic soir',
      targetAcceptanceRate: 72,
      targetCancellationRate: 16,
    };
  }

  return {
    key: 'NIGHT',
    label: 'Nuit',
    targetAcceptanceRate: 62,
    targetCancellationRate: 22,
  };
}

function resolveCalibrationRecommendation(input: {
  scope: string;
  acceptanceRate: number;
  cancellationRate: number;
  averageFarePerKm: number;
  averagePickupWaitMinutes: number;
  targetAcceptanceRate: number;
  targetCancellationRate: number;
}) {
  if (
    input.averageFarePerKm > 650 &&
    input.acceptanceRate < input.targetAcceptanceRate
  ) {
    return {
      scope: input.scope,
      priority: 'HIGH' as const,
      action: 'Revoir le cap de prix ou le soutien accessibilite.',
      rationale:
        'Le prix par kilometre est haut et l acceptation passe sous la cible.',
    };
  }

  if (input.cancellationRate > input.targetCancellationRate) {
    return {
      scope: input.scope,
      priority: 'HIGH' as const,
      action:
        'Analyser annulations, expirations et clarte du prix avant confirmation.',
      rationale:
        'La perte de demandes depasse le seuil cible pour cette fenetre.',
    };
  }

  if (input.averagePickupWaitMinutes >= 8) {
    return {
      scope: input.scope,
      priority: 'MEDIUM' as const,
      action: 'Renforcer le rayon offre ou le positionnement chauffeur.',
      rationale:
        'L attente pickup commence a peser sur la conversion et la confiance.',
    };
  }

  if (input.acceptanceRate < input.targetAcceptanceRate) {
    return {
      scope: input.scope,
      priority: 'MEDIUM' as const,
      action:
        'Tester un bonus chauffeur cible ou une baisse de friction checkout.',
      rationale:
        'L acceptation reste sous la cible sans signal prix/km critique.',
    };
  }

  return {
    scope: input.scope,
    priority: 'LOW' as const,
    action: 'Continuer la collecte avant ajustement automatique.',
    rationale: 'Les signaux restent compatibles avec une calibration prudente.',
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
    private readonly documentLinksService: DocumentLinksService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly healthIncidentJournalService: HealthIncidentJournalService,
    private readonly driversService: DriversService,
  ) {}

  async previewOverview() {
    const metrics = await this.overview();
    const urgentSupportTickets = await this.prisma.supportTicket.count({
      where: {
        status: {
          in: ['OPEN', 'IN_REVIEW'],
        },
        priority: {
          gte: 2,
        },
      },
    });

    return {
      metrics: [
        {
          label: 'Reservations brutes',
          value: `XOF ${(metrics.openRequests * 1850).toLocaleString('fr-FR')}`,
          trend: 'Projection live preview',
        },
        {
          label: 'Taux de completion',
          value: metrics.users ? '94,8%' : '0%',
          trend: `${metrics.activeTrips} trajets actifs`,
        },
        {
          label: 'Temps moyen pickup',
          value: '3 min 12 s',
          trend: `${metrics.openRequests} demandes ouvertes`,
        },
        {
          label: 'Incidents en direct',
          value: String(urgentSupportTickets),
          trend: 'Priorites a revoir',
        },
      ],
      operations: [
        {
          title: 'Passagers',
          value: String(metrics.riders),
          note: 'Comptes passagers relies a un profil actif',
        },
        {
          title: 'Chauffeurs actifs',
          value: String(metrics.drivers),
          note: 'Motos et voitures confondues',
        },
        {
          title: 'Demandes ouvertes',
          value: String(metrics.openRequests),
          note: 'Flux de reservation actuellement en attente',
        },
      ],
      incidents: [
        `${metrics.drivers} chauffeurs a monitorer dans le reseau actif`,
        `${urgentSupportTickets} demandes support prioritaires`,
        metrics.openRequests > 3
          ? 'Pression de demande a surveiller sur les heures de pointe'
          : 'Niveau de demande stable sur la zone de lancement',
      ],
    };
  }

  async overview() {
    const [users, riders, drivers, vehicles, openRequests, activeTrips] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.riderProfile.count(),
        this.prisma.driverProfile.count(),
        this.prisma.vehicle.count(),
        this.prisma.rideRequest.count({
          where: { status: 'REQUESTED' },
        }),
        this.prisma.trip.count({
          where: {
            status: {
              in: ACTIVE_TRIP_STATUSES,
            },
          },
        }),
      ]);

    return {
      users,
      riders,
      drivers,
      vehicles,
      openRequests,
      activeTrips,
    };
  }

  async liveOps() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      activeTrips,
      urgentSupportTickets,
      openRequests,
      paymentAttempts,
      paymentWebhookEvents,
    ] = await Promise.all([
        this.prisma.trip.findMany({
          where: {
            status: {
              in: ACTIVE_TRIP_STATUSES,
            },
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
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
        }),
        this.prisma.supportTicket.count({
          where: {
            status: {
              in: ['OPEN', 'IN_REVIEW'],
            },
            priority: {
              gte: 2,
            },
          },
        }),
        this.prisma.rideRequest.count({
          where: {
            status: 'REQUESTED',
          },
        }),
        this.prisma.paymentAttempt.findMany({
          where: {
            createdAt: {
              gte: since,
            },
          },
          select: {
            status: true,
            provider: true,
            providerReference: true,
            failureReason: true,
          },
        }),
        this.prisma.paymentWebhookEvent.findMany({
          where: {
            createdAt: {
              gte: since,
            },
          },
          select: {
            action: true,
          },
        }),
      ]);

    const tripsByStatus = {
      matched: activeTrips.filter((trip) => trip.status === 'MATCHED').length,
      arriving: activeTrips.filter((trip) => trip.status === 'DRIVER_ARRIVING')
        .length,
      inProgress: activeTrips.filter((trip) => trip.status === 'IN_PROGRESS')
        .length,
    };
    const incidentTrips = activeTrips.filter((trip) =>
      trip.events.some((event) => event.eventType === 'INCIDENT_REPORTED'),
    ).length;
    const succeededPayments = paymentAttempts.filter(
      (attempt) => attempt.status === 'SUCCEEDED',
    ).length;
    const failedPayments = paymentAttempts.filter(
      (attempt) => attempt.status === 'FAILED',
    ).length;
    const reconciledPayments = paymentAttempts.filter(
      (attempt) => attempt.providerReference,
    ).length;

    return {
      summary: {
        activeTrips: activeTrips.length,
        openRequests,
        urgentSupportTickets,
        tripsByStatus,
        payments: {
          lookbackHours: 24,
          attempts: paymentAttempts.length,
          succeeded: succeededPayments,
          failed: failedPayments,
          reconciled: reconciledPayments,
          webhookEvents: paymentWebhookEvents.length,
          webhookConflicts: paymentWebhookEvents.filter(
            (event) => event.action === 'ignored_conflicting_provider_reference',
          ).length,
          webhookUnknownReferences: paymentWebhookEvents.filter(
            (event) => event.action === 'ignored_unknown_reference',
          ).length,
          successRate: safeRate(succeededPayments, paymentAttempts.length),
          reconciliationRate: safeRate(
            reconciledPayments,
            paymentAttempts.length,
          ),
        },
      },
      trips: activeTrips.map((trip) => {
        const lastEvent = trip.events.at(-1);

        return {
          id: trip.id,
          status: trip.status,
          riderName: trip.rider.user.fullName,
          driverName: trip.driver.user.fullName,
          route: `${trip.pickupAddress} vers ${trip.destinationAddress}`,
          fare: Number(trip.actualFare ?? 0),
          currency: trip.currency,
          vehicleLabel: `${trip.vehicle.make} ${trip.vehicle.model}`,
          pickupCodeIssued: trip.events.some(
            (event) => event.eventType === 'PICKUP_CODE_ISSUED',
          ),
          hasIncident: trip.events.some(
            (event) => event.eventType === 'INCIDENT_REPORTED',
          ),
          incidentCount: trip.events.filter(
            (event) => event.eventType === 'INCIDENT_REPORTED',
          ).length,
          lastEvent: lastEvent
            ? {
                label: formatTripEventLabel(lastEvent.eventType),
                createdAt: lastEvent.createdAt.toISOString(),
              }
            : null,
          timeline: trip.events.slice(-4).map((event) => ({
            id: event.id,
            label: formatTripEventLabel(event.eventType),
            createdAt: event.createdAt.toISOString(),
          })),
        };
      }),
      alerts: [
        incidentTrips > 0
          ? `${incidentTrips} trajets actifs ont declenche un signalement d incident.`
          : 'Aucun signalement d incident sur les trajets actifs.',
        openRequests > 5
          ? 'La file de reservations ouvertes demande une attention immediate.'
          : 'La file de reservations ouvertes reste sous controle.',
        urgentSupportTickets > 0
          ? `${urgentSupportTickets} tickets support prioritaires sont a traiter.`
          : 'Aucun ticket support prioritaire en attente.',
        tripsByStatus.arriving > tripsByStatus.inProgress
          ? 'Beaucoup de chauffeurs sont encore en phase de prise en charge.'
          : 'Le flux de courses demarrees reste fluide.',
        paymentAttempts.length > 0 &&
        safeRate(reconciledPayments, paymentAttempts.length) < 80
          ? 'Reconciliation paiement sous surveillance: verifier webhooks et signatures fournisseur.'
          : 'Reconciliation paiement stable sur les dernieres 24h.',
        paymentWebhookEvents.some((event) =>
          event.action.startsWith('ignored_'),
        )
          ? 'Des webhooks paiement ignores existent: ouvrir le journal audit avant relance fournisseur.'
          : 'Aucun webhook paiement ignore sur les dernieres 24h.',
      ],
    };
  }

  async pricingCalibration() {
    const since = new Date(
      Date.now() - pricingCalibrationLookbackDays * 24 * 60 * 60 * 1000,
    );
    const [rideRequests, paymentAttempts, paymentWebhookEvents] =
      await Promise.all([
      this.prisma.rideRequest.findMany({
        where: {
          createdAt: {
            gte: since,
          },
        },
        include: {
          trip: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
        this.prisma.paymentAttempt.findMany({
          where: {
            createdAt: {
              gte: since,
            },
          },
          select: {
            rideRequestId: true,
            status: true,
            amount: true,
            provider: true,
            providerReference: true,
            failureReason: true,
          },
        }),
        this.prisma.paymentWebhookEvent.findMany({
          where: {
            createdAt: {
              gte: since,
            },
          },
          select: {
            action: true,
            signatureVerified: true,
          },
        }),
      ]);

    const totalRequests = rideRequests.length;
    const matchedRequests = rideRequests.filter(
      (request) => request.trip || request.status === 'MATCHED',
    ).length;
    const completedTrips = rideRequests.filter(
      (request) => request.trip?.status === 'COMPLETED',
    ).length;
    const cancelledRequests = rideRequests.filter(
      (request) =>
        request.status === 'CANCELLED' || request.trip?.status === 'CANCELLED',
    ).length;
    const expiredRequests = rideRequests.filter(
      (request) => request.status === 'EXPIRED',
    ).length;
    const completedFares = rideRequests
      .filter((request) => request.trip?.status === 'COMPLETED')
      .map((request) =>
        Number(request.trip?.actualFare ?? request.estimatedFare ?? 0),
      )
      .filter((fare) => fare > 0);
    const completedDistances = rideRequests
      .filter((request) => request.trip?.status === 'COMPLETED')
      .map((request) =>
        Number(request.trip?.distanceKm ?? request.estimatedDistanceKm ?? 0),
      )
      .filter((distance) => distance > 0);
    const pickupWaitMinutes = rideRequests
      .filter((request) => request.trip)
      .map((request) =>
        minutesBetween(request.createdAt, request.trip!.createdAt),
      );
    const succeededPaymentAttempts = paymentAttempts.filter(
      (attempt) => attempt.status === 'SUCCEEDED',
    );
    const failedPaymentAttempts = paymentAttempts.filter(
      (attempt) => attempt.status === 'FAILED',
    );
    const reconciledPaymentAttempts = paymentAttempts.filter(
      (attempt) => attempt.providerReference,
    );
    const paidRideRequestIds = new Set(
      succeededPaymentAttempts.map((attempt) => attempt.rideRequestId),
    );
    const averageFare = average(completedFares);
    const averageDriverPayout = Math.round(
      averageFare * (1 - platformCommissionRate),
    );
    const averageFarePerKm = completedDistances.length
      ? Math.round((averageFare / (average(completedDistances) || 1)) * 10) / 10
      : 0;

    const segmentMap = new Map<
      string,
      {
        vehicleType: string;
        serviceTier: string;
        requests: typeof rideRequests;
      }
    >();
    const timeWindowMap = new Map<
      string,
      {
        key: string;
        label: string;
        targetAcceptanceRate: number;
        targetCancellationRate: number;
        requests: typeof rideRequests;
      }
    >();
    const geographyMap = new Map<
      string,
      {
        city: string;
        districtProfile: string;
        requests: typeof rideRequests;
      }
    >();

    for (const request of rideRequests) {
      const vehicleType = request.requestedVehicleType;
      const serviceTier = request.requestedServiceTier ?? 'UNSPECIFIED';
      const key = `${vehicleType}:${serviceTier}`;
      const segment = segmentMap.get(key) ?? {
        vehicleType,
        serviceTier,
        requests: [],
      };

      segment.requests.push(request);
      segmentMap.set(key, segment);

      const timeWindow = resolveOperationalTimeWindow(request.createdAt);
      const existingTimeWindow = timeWindowMap.get(timeWindow.key) ?? {
        ...timeWindow,
        requests: [],
      };

      existingTimeWindow.requests.push(request);
      timeWindowMap.set(timeWindow.key, existingTimeWindow);

      const city = String(request.pricingCity ?? 'OUAGADOUGOU');
      const districtProfile = String(
        request.districtProfile ?? 'RESIDENTIAL_STANDARD',
      );
      const geographyKey = `${city}:${districtProfile}`;
      const geographySegment = geographyMap.get(geographyKey) ?? {
        city,
        districtProfile,
        requests: [],
      };

      geographySegment.requests.push(request);
      geographyMap.set(geographyKey, geographySegment);
    }

    const segments = Array.from(segmentMap.values())
      .map((segment) => {
        const requests = segment.requests.length;
        const completed = segment.requests.filter(
          (request) => request.trip?.status === 'COMPLETED',
        ).length;
        const cancelled = segment.requests.filter(
          (request) =>
            request.status === 'CANCELLED' ||
            request.trip?.status === 'CANCELLED',
        ).length;
        const expired = segment.requests.filter(
          (request) => request.status === 'EXPIRED',
        ).length;
        const fares = segment.requests
          .filter((request) => request.trip?.status === 'COMPLETED')
          .map((request) =>
            Number(request.trip?.actualFare ?? request.estimatedFare ?? 0),
          )
          .filter((fare) => fare > 0);

        return {
          vehicleType: segment.vehicleType,
          serviceTier: segment.serviceTier,
          requests,
          completionRate: safeRate(completed, requests),
          cancellationRate: safeRate(cancelled + expired, requests),
          averageFare: average(fares),
        };
      })
      .sort((left, right) => right.requests - left.requests);
    const timeWindows = Array.from(timeWindowMap.values())
      .map((timeWindow) => {
        const requests = timeWindow.requests.length;
        const matched = timeWindow.requests.filter(
          (request) => request.trip || request.status === 'MATCHED',
        ).length;
        const completed = timeWindow.requests.filter(
          (request) => request.trip?.status === 'COMPLETED',
        ).length;
        const cancelledOrExpired = timeWindow.requests.filter(
          (request) =>
            request.status === 'CANCELLED' ||
            request.status === 'EXPIRED' ||
            request.trip?.status === 'CANCELLED',
        ).length;
        const fares = timeWindow.requests
          .filter((request) => request.trip?.status === 'COMPLETED')
          .map((request) =>
            Number(request.trip?.actualFare ?? request.estimatedFare ?? 0),
          )
          .filter((fare) => fare > 0);
        const distances = timeWindow.requests
          .filter((request) => request.trip?.status === 'COMPLETED')
          .map((request) =>
            Number(
              request.trip?.distanceKm ?? request.estimatedDistanceKm ?? 0,
            ),
          )
          .filter((distance) => distance > 0);
        const waits = timeWindow.requests
          .filter((request) => request.trip)
          .map((request) =>
            minutesBetween(request.createdAt, request.trip!.createdAt),
          );
        const windowAverageFare = average(fares);
        const windowAverageDistance = average(distances);
        const windowAverageFarePerKm = windowAverageDistance
          ? Math.round((windowAverageFare / windowAverageDistance) * 10) / 10
          : 0;

        return {
          key: timeWindow.key,
          label: timeWindow.label,
          requests,
          matchedRequests: matched,
          completedTrips: completed,
          acceptanceRate: safeRate(matched, requests),
          completionRate: safeRate(completed, requests),
          cancellationRate: safeRate(cancelledOrExpired, requests),
          averageFare: windowAverageFare,
          averageFarePerKm: windowAverageFarePerKm,
          averagePickupWaitMinutes: average(waits),
          targetAcceptanceRate: timeWindow.targetAcceptanceRate,
          targetCancellationRate: timeWindow.targetCancellationRate,
        };
      })
      .sort((left, right) => {
        const order = ['MORNING_PEAK', 'MIDDAY', 'EVENING_PEAK', 'NIGHT'];

        return order.indexOf(left.key) - order.indexOf(right.key);
      });
    const geographySegments = Array.from(geographyMap.values())
      .map((segment) => {
        const requests = segment.requests.length;
        const matched = segment.requests.filter(
          (request) => request.trip || request.status === 'MATCHED',
        ).length;
        const completed = segment.requests.filter(
          (request) => request.trip?.status === 'COMPLETED',
        ).length;
        const cancelledOrExpired = segment.requests.filter(
          (request) =>
            request.status === 'CANCELLED' ||
            request.status === 'EXPIRED' ||
            request.trip?.status === 'CANCELLED',
        ).length;
        const fares = segment.requests
          .filter((request) => request.trip?.status === 'COMPLETED')
          .map((request) =>
            Number(request.trip?.actualFare ?? request.estimatedFare ?? 0),
          )
          .filter((fare) => fare > 0);
        const distances = segment.requests
          .filter((request) => request.trip?.status === 'COMPLETED')
          .map((request) =>
            Number(
              request.trip?.distanceKm ?? request.estimatedDistanceKm ?? 0,
            ),
          )
          .filter((distance) => distance > 0);
        const segmentAverageFare = average(fares);
        const segmentAverageDistance = average(distances);

        return {
          city: segment.city,
          districtProfile: segment.districtProfile,
          requests,
          matchedRequests: matched,
          completedTrips: completed,
          acceptanceRate: safeRate(matched, requests),
          completionRate: safeRate(completed, requests),
          cancellationRate: safeRate(cancelledOrExpired, requests),
          averageFare: segmentAverageFare,
          averageFarePerKm: segmentAverageDistance
            ? Math.round((segmentAverageFare / segmentAverageDistance) * 10) /
              10
            : 0,
        };
      })
      .sort((left, right) => right.requests - left.requests);
    const recommendations = [
      resolveCalibrationRecommendation({
        scope: 'Global',
        acceptanceRate: safeRate(matchedRequests, totalRequests),
        cancellationRate: safeRate(
          cancelledRequests + expiredRequests,
          totalRequests,
        ),
        averageFarePerKm,
        averagePickupWaitMinutes: average(pickupWaitMinutes),
        targetAcceptanceRate: 68,
        targetCancellationRate: 18,
      }),
      ...timeWindows
        .filter((timeWindow) => timeWindow.requests > 0)
        .map((timeWindow) =>
          resolveCalibrationRecommendation({
            scope: timeWindow.label,
            acceptanceRate: timeWindow.acceptanceRate,
            cancellationRate: timeWindow.cancellationRate,
            averageFarePerKm: timeWindow.averageFarePerKm,
            averagePickupWaitMinutes: timeWindow.averagePickupWaitMinutes,
            targetAcceptanceRate: timeWindow.targetAcceptanceRate,
            targetCancellationRate: timeWindow.targetCancellationRate,
          }),
        ),
      ...geographySegments
        .filter((segment) => segment.requests >= 3)
        .map((segment) =>
          resolveCalibrationRecommendation({
            scope: `${segment.city} / ${segment.districtProfile}`,
            acceptanceRate: segment.acceptanceRate,
            cancellationRate: segment.cancellationRate,
            averageFarePerKm: segment.averageFarePerKm,
            averagePickupWaitMinutes: 0,
            targetAcceptanceRate: 68,
            targetCancellationRate: 18,
          }),
        ),
    ];

    const alerts = [
      safeRate(matchedRequests, totalRequests) < 65 && totalRequests > 0
        ? 'Acceptation sous le seuil cible: verifier disponibilite, distance pickup et prix par segment.'
        : 'Acceptation terrain compatible avec une calibration progressive.',
      safeRate(cancelledRequests + expiredRequests, totalRequests) > 18
        ? 'Annulation/expiration elevee: regarder les zones, le temps pickup et la clarte du prix.'
        : 'Annulation et expiration contenues sur la fenetre observee.',
      averageFarePerKm > 650
        ? 'Prix moyen au kilometre a surveiller pour proteger l accessibilite rider.'
        : 'Prix moyen au kilometre lisible pour le marche observe.',
      safeRate(paidRideRequestIds.size, totalRequests) < 50 && totalRequests > 0
        ? 'Conversion paiement encore fragile: prioriser mobile money et relances de checkout.'
        : 'Conversion paiement coherente avec le volume actuel.',
    ];

    return {
      window: {
        lookbackDays: pricingCalibrationLookbackDays,
        since: since.toISOString(),
      },
      summary: {
        totalRequests,
        matchedRequests,
        completedTrips,
        cancelledRequests,
        expiredRequests,
        paidRequests: paidRideRequestIds.size,
        acceptanceRate: safeRate(matchedRequests, totalRequests),
        completionRate: safeRate(completedTrips, totalRequests),
        cancellationRate: safeRate(
          cancelledRequests + expiredRequests,
          totalRequests,
        ),
        paymentConversionRate: safeRate(paidRideRequestIds.size, totalRequests),
        paymentAttemptCount: paymentAttempts.length,
        failedPaymentAttemptCount: failedPaymentAttempts.length,
        reconciledPaymentAttemptCount: reconciledPaymentAttempts.length,
        paymentSuccessRate: safeRate(
          succeededPaymentAttempts.length,
          paymentAttempts.length,
        ),
        paymentReconciliationRate: safeRate(
          reconciledPaymentAttempts.length,
          paymentAttempts.length,
        ),
        averageFare,
        averageDriverPayout,
        averageFarePerKm,
        averagePickupWaitMinutes: average(pickupWaitMinutes),
      },
      paymentSignals: {
        attempts: paymentAttempts.length,
        succeeded: succeededPaymentAttempts.length,
        failed: failedPaymentAttempts.length,
        reconciled: reconciledPaymentAttempts.length,
        unresolved: Math.max(
          0,
          paymentAttempts.length - reconciledPaymentAttempts.length,
        ),
        webhookEvents: paymentWebhookEvents.length,
        webhookIgnored: paymentWebhookEvents.filter((event) =>
          event.action.startsWith('ignored_'),
        ).length,
        webhookSignatureVerified: paymentWebhookEvents.filter(
          (event) => event.signatureVerified,
        ).length,
        failureReasons: Array.from(
          failedPaymentAttempts.reduce((reasons, attempt) => {
            const reason = attempt.failureReason ?? 'unknown';
            reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
            return reasons;
          }, new Map<string, number>()),
        )
          .map(([reason, count]) => ({ reason, count }))
          .sort((left, right) => right.count - left.count),
      },
      segments,
      timeWindows,
      geographySegments,
      recommendations,
      alerts,
    };
  }

  async paymentWebhookEvents(
    query: PaymentWebhookEventsQueryDto = new PaymentWebhookEventsQueryDto(),
  ) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const where: Prisma.PaymentWebhookEventWhereInput = {
      provider: query.provider,
      action: query.action,
      transactionRef: query.transactionRef?.trim() || undefined,
      providerReference: query.providerReference?.trim() || undefined,
    };
    const [events, total] = await Promise.all([
      this.prisma.paymentWebhookEvent.findMany({
        skip,
        take,
        where,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          provider: true,
          eventType: true,
          transactionRef: true,
          providerReference: true,
          action: true,
          reconciledAttemptCount: true,
          signatureVerified: true,
          rawBodyHash: true,
          payload: true,
          paymentAttemptId: true,
          userId: true,
          createdAt: true,
        },
      }),
      this.prisma.paymentWebhookEvent.count({
        where,
      }),
    ]);

    return {
      events: events.map((event) => ({
        id: event.id,
        provider: event.provider,
        eventType: event.eventType,
        transactionRef: event.transactionRef,
        providerReference: event.providerReference,
        action: event.action,
        reconciledAttemptCount: event.reconciledAttemptCount,
        signatureVerified: event.signatureVerified,
        rawBodyHash: event.rawBodyHash,
        payloadPreview: summarizePaymentPayload(event.payload),
        paymentAttemptId: event.paymentAttemptId,
        userId: event.userId,
        createdAt: event.createdAt.toISOString(),
      })),
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }

  async paymentWebhookEventDetail(eventId: string) {
    const event = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        provider: true,
        eventType: true,
        transactionRef: true,
        providerReference: true,
        action: true,
        reconciledAttemptCount: true,
        signatureVerified: true,
        rawBodyHash: true,
        payload: true,
        paymentAttemptId: true,
        userId: true,
        createdAt: true,
        paymentAttempt: {
          select: {
            status: true,
            amount: true,
            currency: true,
            rideRequestId: true,
            failureReason: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Payment webhook event not found.');
    }

    return {
      event: {
        id: event.id,
        provider: event.provider,
        eventType: event.eventType,
        transactionRef: event.transactionRef,
        providerReference: event.providerReference,
        action: event.action,
        reconciledAttemptCount: event.reconciledAttemptCount,
        signatureVerified: event.signatureVerified,
        rawBodyHash: event.rawBodyHash,
        payload: redactPaymentPayload(event.payload),
        payloadPreview: summarizePaymentPayload(event.payload),
        paymentAttemptId: event.paymentAttemptId,
        userId: event.userId,
        createdAt: event.createdAt.toISOString(),
        paymentAttempt: event.paymentAttempt
          ? {
              status: event.paymentAttempt.status,
              amount: Number(event.paymentAttempt.amount),
              currency: event.paymentAttempt.currency,
              rideRequestId: event.paymentAttempt.rideRequestId,
              failureReason: event.paymentAttempt.failureReason,
              updatedAt: event.paymentAttempt.updatedAt.toISOString(),
            }
          : null,
      },
    };
  }

  async startPaymentWebhookInvestigation(
    eventId: string,
    auth: RequestAuthContext,
  ) {
    const event = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        provider: true,
        eventType: true,
        transactionRef: true,
        providerReference: true,
        action: true,
        userId: true,
        paymentAttemptId: true,
        paymentAttempt: {
          select: {
            userId: true,
            rideRequestId: true,
            status: true,
            failureReason: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Payment webhook event not found.');
    }

    const targetUserId = event.userId ?? event.paymentAttempt?.userId ?? null;
    let supportTicket:
      | {
          id: string;
          status: SupportTicketStatus;
          priority: number;
        }
      | null = null;

    if (targetUserId) {
      const subject = `Investigation paiement webhook ${event.id}`;
      const existingTicket = await this.prisma.supportTicket.findFirst({
        where: {
          userId: targetUserId,
          subject,
          status: {
            in: [SupportTicketStatus.OPEN, SupportTicketStatus.IN_REVIEW],
          },
        },
        select: {
          id: true,
          status: true,
          priority: true,
        },
      });

      supportTicket =
        existingTicket ??
        (await this.prisma.supportTicket.create({
          data: {
            userId: targetUserId,
            subject,
            description: [
              `Provider: ${event.provider}`,
              `Event: ${event.eventType}`,
              `Action: ${event.action}`,
              `Transaction: ${event.transactionRef ?? 'absente'}`,
              `Reference fournisseur: ${event.providerReference ?? 'absente'}`,
              `PaymentAttempt: ${event.paymentAttemptId ?? 'absente'}`,
            ].join('\n'),
            priority:
              event.action === 'ignored_conflicting_provider_reference' ? 3 : 2,
            status: SupportTicketStatus.OPEN,
          },
          select: {
            id: true,
            status: true,
            priority: true,
          },
        }));
    }

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'PAYMENT_WEBHOOK_INVESTIGATION_STARTED',
        entityType: 'PAYMENT_WEBHOOK_EVENT',
        entityId: event.id,
        metadata: {
          provider: event.provider,
          eventType: event.eventType,
          transactionRef: event.transactionRef,
          providerReference: event.providerReference,
          webhookAction: event.action,
          paymentAttemptId: event.paymentAttemptId,
          supportTicketId: supportTicket?.id ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'payment-webhook.investigation-started',
      entityId: event.id,
      actorRole: auth.user.role,
      payload: {
        provider: event.provider,
        action: event.action,
        supportTicketId: supportTicket?.id ?? null,
      },
    });

    return {
      investigation: {
        eventId: event.id,
        status: 'STARTED',
        supportTicket: supportTicket
          ? {
              id: supportTicket.id,
              status: supportTicket.status,
              priority: supportTicket.priority,
            }
          : null,
      },
    };
  }

  async supportTickets(query: PageQueryDto = new PageQueryDto()) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        skip,
        take,
        include: {
          user: true,
        },
        orderBy: [
          {
            priority: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
      }),
      this.prisma.supportTicket.count(),
    ]);

    return {
      tickets: tickets.map((ticket) => {
        const tripIdMatch = ticket.subject.match(
          /Incident trajet ([a-z0-9]+)/i,
        );

        return {
          id: ticket.id,
          subject: ticket.subject,
          description: ticket.description,
          status: ticket.status,
          priority: ticket.priority,
          requesterName: ticket.user.fullName,
          requesterRole: ticket.user.role,
          tripId: tripIdMatch?.[1] ?? null,
          createdAt: ticket.createdAt.toISOString(),
          updatedAt: ticket.updatedAt.toISOString(),
        };
      }),
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }

  async driverOnboardingQueue(query: PageQueryDto = new PageQueryDto()) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const [profiles, total] = await Promise.all([
      this.prisma.driverProfile.findMany({
        skip,
        take,
        where: {
          verificationStatus: {
            in: ['PENDING', 'REJECTED'],
          },
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
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      this.prisma.driverProfile.count({
        where: {
          verificationStatus: {
            in: ['PENDING', 'REJECTED'],
          },
        },
      }),
    ]);

    return {
      drivers: profiles.map((profile) => {
        const latestReview = profile.onboardingReviews[0] ?? null;
        const latestDocumentsByType = new Map<
          string,
          (typeof profile.onboardingDocuments)[number]
        >();

        for (const document of profile.onboardingDocuments) {
          if (!latestDocumentsByType.has(document.type)) {
            latestDocumentsByType.set(document.type, document);
          }
        }

        const reviewableDocuments = Array.from(latestDocumentsByType.values());
        const approvedDocuments = reviewableDocuments.filter(
          (document) => resolveEffectiveDocumentStatus(document) === 'APPROVED',
        ).length;
        const pendingDocuments = reviewableDocuments.filter(
          (document) => resolveEffectiveDocumentStatus(document) === 'PENDING',
        ).length;
        const rejectedDocuments = reviewableDocuments.filter(
          (document) =>
            resolveEffectiveDocumentStatus(document) === 'REJECTED' ||
            resolveEffectiveDocumentStatus(document) === 'EXPIRED',
        ).length;

        return {
          id: profile.id,
          driverName: profile.user.fullName,
          email: profile.user.email,
          phoneNumber: profile.user.phoneNumber,
          verificationStatus: profile.verificationStatus,
          reviewStatus:
            latestReview?.status ?? DriverOnboardingReviewStatus.SUBMITTED,
          latestReviewAt: latestReview?.createdAt.toISOString() ?? null,
          latestReviewActor: latestReview?.actor.fullName ?? null,
          latestDecisionReason: latestReview?.decisionReason ?? null,
          serviceRadiusKm: Number(profile.serviceRadiusKm ?? 0),
          activeVehicleCount: profile.vehicles.length,
          documentSummary: {
            total: reviewableDocuments.length,
            approved: approvedDocuments,
            pending: pendingDocuments,
            rejected: rejectedDocuments,
          },
          documents: reviewableDocuments.map((document) => ({
            id: document.id,
            type: document.type,
            status: resolveEffectiveDocumentStatus(document),
            fileName: document.fileName,
            uploadedAt: document.uploadedAt.toISOString(),
            expiresAt: document.expiresAt?.toISOString() ?? null,
            rejectionReason: document.rejectionReason ?? null,
          })),
        };
      }),
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }

  featureFlags() {
    const realtimeSnapshot = this.realtimeService.snapshot();

    return {
      flags: this.featureFlagsService.snapshot().map((flag) => ({
        ...flag,
        effectiveForAnonymous:
          flag.mode === 'on' ||
          flag.flag === 'pricing' ||
          flag.flag === 'voice',
      })),
      infrastructure: {
        realtime: {
          adapter: realtimeSnapshot.adapter,
          sharedBackplane: realtimeSnapshot.sharedBackplane,
          degraded: realtimeSnapshot.degraded,
          degradeReason: realtimeSnapshot.degradeReason,
          activeStreams: realtimeSnapshot.activeStreams,
          publishedEvents: realtimeSnapshot.publishedEvents,
          featureFlagMode: realtimeSnapshot.featureFlagMode ?? 'off',
          featureFlagEnabled: realtimeSnapshot.featureFlagEnabled ?? false,
        },
      },
    };
  }

  async dispatchSettings() {
    const settings = await this.driversService.getDispatchLearningSettings();
    const history = await this.prisma.auditLog.findMany({
      where: {
        action: 'DISPATCH_SETTINGS_UPDATED',
        entityType: 'SYSTEM_CONFIGURATION',
        entityId: 'dispatch-learning',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 8,
      select: {
        id: true,
        createdAt: true,
        metadata: true,
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    return {
      settings,
      history: history.map((entry) => {
        const metadata = isDispatchSettingsRecord(entry.metadata)
          ? entry.metadata
          : {};

        return {
          id: entry.id,
          createdAt: entry.createdAt.toISOString(),
          resetToDefaults: Boolean(metadata.resetToDefaults),
          source:
            metadata.source === 'DATABASE_OVERRIDE'
              ? 'DATABASE_OVERRIDE'
              : 'DEFAULT',
          actor: {
            id: entry.user.id,
            name: entry.user.fullName,
            role: entry.user.role,
          },
          before: normalizeDispatchSettingsValue(metadata.previous),
          after:
            normalizeDispatchSettingsValue(metadata.next) ??
            normalizeDispatchSettingsValue(metadata),
        };
      }),
    };
  }

  async updateDispatchSettings(
    payload: {
      lookbackHours?: number;
      halfLifeHours?: number;
      declineCooldownMinutes?: number;
      historyLimit?: number;
      resetToDefaults?: boolean;
    },
    auth: RequestAuthContext,
  ) {
    if (
      !payload.resetToDefaults &&
      payload.lookbackHours === undefined &&
      payload.halfLifeHours === undefined &&
      payload.declineCooldownMinutes === undefined &&
      payload.historyLimit === undefined
    ) {
      throw new BadRequestException(
        'At least one dispatch setting value must be provided.',
      );
    }

    const previousSettings =
      await this.driversService.getDispatchLearningSettings();
    const settings = await this.driversService.updateDispatchLearningSettings({
      ...payload,
      actor: {
        id: auth.user.id,
        name: auth.user.fullName ?? null,
        role: auth.user.role,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DISPATCH_SETTINGS_UPDATED',
        entityType: 'SYSTEM_CONFIGURATION',
        entityId: 'dispatch-learning',
        metadata: {
          resetToDefaults: payload.resetToDefaults ?? false,
          lookbackHours: settings.lookbackHours,
          halfLifeHours: settings.halfLifeHours,
          declineCooldownMinutes: settings.declineCooldownMinutes,
          historyLimit: settings.historyLimit,
          source: settings.source,
          previous: {
            lookbackHours: previousSettings.lookbackHours,
            halfLifeHours: previousSettings.halfLifeHours,
            declineCooldownMinutes: previousSettings.declineCooldownMinutes,
            historyLimit: previousSettings.historyLimit,
          },
          next: {
            lookbackHours: settings.lookbackHours,
            halfLifeHours: settings.halfLifeHours,
            declineCooldownMinutes: settings.declineCooldownMinutes,
            historyLimit: settings.historyLimit,
          },
        } as Prisma.InputJsonValue,
      },
    });

    return this.dispatchSettings();
  }

  async updateSupportTicket(
    ticketId: string,
    payload: {
      status?: SupportTicketStatus;
      priority?: number;
    },
    auth: RequestAuthContext,
  ) {
    const existing = await this.prisma.supportTicket.findUnique({
      where: {
        id: ticketId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Support ticket not found.');
    }

    const updated = await this.prisma.supportTicket.update({
      where: {
        id: ticketId,
      },
      data: {
        status: payload.status ?? existing.status,
        priority: payload.priority ?? existing.priority,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'SUPPORT_TICKET_UPDATED',
        entityType: 'SUPPORT_TICKET',
        entityId: updated.id,
        metadata: {
          status: updated.status,
          priority: updated.priority,
        },
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'support-ticket.updated',
      entityId: updated.id,
      actorRole: auth.user.role,
      payload: {
        status: updated.status,
        priority: updated.priority,
      },
    });

    return {
      ticket: {
        id: updated.id,
        status: updated.status,
        priority: updated.priority,
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  async updateDriverOnboardingReview(
    driverId: string,
    payload: UpdateDriverOnboardingReviewDto,
    auth: RequestAuthContext,
  ) {
    this.assertReviewAuthority(payload.status, auth);

    const profile = await this.prisma.driverProfile.findUnique({
      where: {
        id: driverId,
      },
      include: {
        user: true,
        vehicles: {
          where: {
            isActive: true,
          },
        },
        onboardingDocuments: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    if (
      (payload.status === 'REJECTED' ||
        payload.status === 'CHANGES_REQUESTED') &&
      !payload.decisionReason?.trim()
    ) {
      throw new BadRequestException(
        'A decision reason is required for rejected or changes requested reviews.',
      );
    }

    if (payload.documentDecisions?.length) {
      for (const decision of payload.documentDecisions) {
        const document = profile.onboardingDocuments.find(
          (candidate) => candidate.id === decision.documentId,
        );

        if (!document) {
          throw new NotFoundException(
            `Driver document ${decision.documentId} not found for this profile.`,
          );
        }

        await this.prisma.driverDocument.update({
          where: {
            id: decision.documentId,
          },
          data: {
            status: decision.status as DriverDocumentStatus,
            rejectionReason:
              decision.status === 'REJECTED'
                ? (decision.rejectionReason ?? 'Document non conforme.')
                : null,
            expiresAt: decision.expiresAt ? new Date(decision.expiresAt) : null,
            reviewedAt: new Date(),
            reviewedByUserId: auth.user.id,
          },
        });
      }
    }

    if (payload.status === 'APPROVED') {
      this.assertApprovalReadiness(profile, payload);
    }

    const verificationStatus = toVerificationStatus(
      payload.status as DriverOnboardingReviewStatus,
    );

    await this.prisma.driverProfile.update({
      where: {
        id: driverId,
      },
      data: {
        verificationStatus,
        status:
          payload.status === 'APPROVED' &&
          profile.status !== DriverStatus.SUSPENDED
            ? DriverStatus.OFFLINE
            : profile.status === DriverStatus.SUSPENDED
              ? DriverStatus.SUSPENDED
              : DriverStatus.OFFLINE,
      },
    });

    const review = await this.prisma.driverOnboardingReview.create({
      data: {
        driverProfileId: driverId,
        status: payload.status as DriverOnboardingReviewStatus,
        actorUserId: auth.user.id,
        notesInternal: payload.notesInternal?.trim(),
        decisionReason: payload.decisionReason?.trim(),
        metadata: {
          supportPriority: payload.supportPriority ?? null,
          documentDecisions: payload.documentDecisions ?? [],
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_ONBOARDING_REVIEW_UPDATED',
        entityType: 'DRIVER_PROFILE',
        entityId: driverId,
        metadata: {
          status: payload.status,
          decisionReason: payload.decisionReason ?? null,
          supportPriority: payload.supportPriority ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    if (
      payload.supportPriority !== undefined &&
      payload.supportPriority >= 2 &&
      payload.status !== 'APPROVED'
    ) {
      const supportSubject = `Revue onboarding chauffeur ${driverId}`;
      const existingSupportTicket = await this.prisma.supportTicket.findFirst({
        where: {
          userId: profile.userId,
          subject: supportSubject,
          status: {
            in: [SupportTicketStatus.OPEN, SupportTicketStatus.IN_REVIEW],
          },
        },
        select: {
          id: true,
        },
      });

      if (!existingSupportTicket) {
        await this.prisma.supportTicket.create({
          data: {
            userId: profile.userId,
            subject: supportSubject,
            description:
              payload.decisionReason?.trim() ??
              'Une action operations est requise sur le dossier chauffeur.',
            priority: payload.supportPriority,
            status: SupportTicketStatus.OPEN,
          },
        });
      }
    }

    this.realtimeService.publish({
      channel: 'admin',
      type: 'driver-onboarding.review-updated',
      entityId: driverId,
      actorRole: auth.user.role,
      payload: {
        status: payload.status,
        decisionReason: payload.decisionReason ?? null,
      },
    });

    return {
      review: {
        id: review.id,
        driverId,
        verificationStatus,
        status: review.status,
        decisionReason: review.decisionReason ?? null,
        createdAt: review.createdAt.toISOString(),
      },
    };
  }

  private assertReviewAuthority(
    status: UpdateDriverOnboardingReviewDto['status'],
    auth: RequestAuthContext,
  ) {
    if (status !== 'UNDER_REVIEW' && !reviewDecisionRoles.has(auth.user.role)) {
      throw new ForbiddenException(
        'Only admin or ops can approve, reject, or request onboarding changes.',
      );
    }
  }

  private assertApprovalReadiness(
    profile: {
      user: { isPhoneVerified?: boolean | null };
      licenseNumber?: string | null;
      vehicles: Array<{ id: string }>;
      onboardingDocuments: Array<{
        id: string;
        type: string;
        status: DriverDocumentStatus;
        expiresAt: Date | null;
      }>;
    },
    payload: UpdateDriverOnboardingReviewDto,
  ) {
    if (!profile.user.isPhoneVerified) {
      throw new BadRequestException(
        'Phone verification must be completed before approving a driver.',
      );
    }

    if (!profile.licenseNumber?.trim()) {
      throw new BadRequestException(
        'A driver license number is required before approval.',
      );
    }

    if (!profile.vehicles.length) {
      throw new BadRequestException(
        'At least one active vehicle is required before approval.',
      );
    }

    const decisionOverrides = new Map(
      (payload.documentDecisions ?? []).map((decision) => [
        decision.documentId,
        decision,
      ]),
    );
    const latestDocumentsByType = new Map<
      string,
      {
        id: string;
        type: string;
        status: DriverDocumentStatus;
        expiresAt: Date | null;
      }
    >();

    for (const document of profile.onboardingDocuments) {
      if (!latestDocumentsByType.has(document.type)) {
        latestDocumentsByType.set(document.type, document);
      }
    }

    for (const type of requiredOnboardingDocumentTypes) {
      const document = latestDocumentsByType.get(type);

      if (!document) {
        throw new BadRequestException(
          `Document ${type} must be uploaded before approval.`,
        );
      }

      const override = decisionOverrides.get(document.id);
      const effectiveStatus = override?.status ?? document.status;
      const effectiveExpiry = override?.expiresAt
        ? new Date(override.expiresAt)
        : document.expiresAt;

      if (effectiveStatus !== 'APPROVED') {
        throw new BadRequestException(
          `Document ${type} must be approved before driver approval.`,
        );
      }

      if (effectiveExpiry && effectiveExpiry.getTime() <= Date.now()) {
        throw new BadRequestException(
          `Document ${type} is expired and cannot be approved.`,
        );
      }
    }
  }

  async getDriverDocumentViewLink(
    driverId: string,
    documentId: string,
    auth: RequestAuthContext,
  ) {
    const document = await this.prisma.driverDocument.findFirst({
      where: {
        id: documentId,
        driverProfileId: driverId,
      },
    });

    if (!document) {
      throw new NotFoundException('Driver document not found.');
    }

    return {
      documentId: document.id,
      type: document.type,
      ...this.documentLinksService.createViewLink({
        documentId: document.id,
        driverProfileId: driverId,
        storageKey: document.storageKey,
        actorRole: auth.user.role,
      }),
    };
  }

  acknowledgeHealthIncident(incidentId: string, auth: RequestAuthContext) {
    const incident = this.healthIncidentJournalService.acknowledge(incidentId, {
      id: auth.user.id,
      fullName: auth.user.fullName,
      role: auth.user.role,
    });

    if (!incident) {
      throw new NotFoundException('Health incident not found.');
    }

    this.realtimeService.publish({
      channel: 'admin',
      type: 'system.health-incident-acknowledged',
      entityId: incident.id,
      actorRole: auth.user.role,
      payload: {
        acknowledgedAt: incident.acknowledgedAt,
        acknowledgedBy: incident.acknowledgedBy,
      },
    });

    return {
      incident,
    };
  }

  muteHealthIncident(incidentId: string, auth: RequestAuthContext) {
    const incident = this.healthIncidentJournalService.mute(incidentId, {
      id: auth.user.id,
      fullName: auth.user.fullName,
      role: auth.user.role,
    });

    if (!incident) {
      throw new NotFoundException('Health incident not found.');
    }

    this.realtimeService.publish({
      channel: 'admin',
      type: 'system.health-incident-muted',
      entityId: incident.id,
      actorRole: auth.user.role,
      payload: {
        mutedAt: incident.mutedAt,
        mutedBy: incident.mutedBy,
      },
    });

    return {
      incident,
    };
  }
}
