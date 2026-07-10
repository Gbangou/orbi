import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DriverDocumentStatus,
  DriverOnboardingReviewStatus,
  type DriverPayout,
  DriverPayoutStatus,
  DriverStatus,
  Prisma,
  SupportTicketStatus,
  UserRole,
  VerificationStatus,
  WalletTransactionType,
} from '@prisma/client';
import {
  PageQueryDto,
  resolvePageQuery,
} from '../../common/dto/page-query.dto';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { RedisCacheService } from '../../core/cache/redis-cache.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { DocumentLinksService } from '../../common/document-links/document-links.service';
import {
  DocumentObjectStorageService,
  type StoredDocumentObjectVerification,
} from '../../common/document-links/document-object-storage.service';
import { JobQueueService } from '../../common/job-queue/job-queue.service';
import { FeatureFlagsService } from '../../core/runtime/feature-flags.service';
import { HealthIncidentJournalService } from '../health/health-incident-journal.service';
import { HealthService } from '../health/health.service';
import { DriversService } from '../drivers/drivers.service';
import { PaymentsService } from '../payments/payments.service';
import { ACTIVE_TRIP_STATUSES } from '../trips/trips.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationChannel } from '@prisma/client';
import { DriverPayoutApprovalDto } from './dto/driver-payout-approval.dto';
import { DriverWalletRecoveryAdjustmentDto } from './dto/driver-wallet-recovery-adjustment.dto';
import { DriverPayoutSettlementQueryDto } from './dto/driver-payout-settlement-query.dto';
import { DriverOnboardingExportQueryDto } from './dto/driver-onboarding-export-query.dto';
import { LaunchReadinessActionAcknowledgementDto } from './dto/launch-readiness-action-acknowledgement.dto';
import { PaymentAttemptRefundDto } from './dto/payment-attempt-refund.dto';
import { UpdateDriverOnboardingReviewDto } from './dto/update-driver-onboarding-review.dto';
import { PaymentWebhookEventsQueryDto } from './dto/payment-webhook-events-query.dto';
import { JobQueueQueryDto } from './dto/job-queue-query.dto';
import { UpdateDriverDocumentObjectVerificationDto } from './dto/update-driver-document-object-verification.dto';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';

const reviewDecisionRoles = new Set(['ADMIN', 'OPS']);
type AdminSupportTicketQueueResponse = {
  tickets: Array<{
    id: string;
    subject: string;
    description: string;
    status: SupportTicketStatus;
    priority: number;
    adminNote: string | null;
    requesterName: string;
    requesterRole: UserRole;
    tripId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};
type AdminSupportTicketUpdateResponse = {
  ticket: {
    id: string;
    status: SupportTicketStatus;
    priority: number;
    adminNote: string | null;
    updatedAt: string;
  };
};
type AdminPromoCodesResponse = {
  promoCodes: Array<{
    id: string;
    code: string;
    description: string | null;
    discountBps: number;
    maxUses: number | null;
    usedCount: number;
    validFrom: string;
    validTo: string;
    firstTripOnly: boolean;
    active: boolean;
    createdAt: string;
  }>;
};
const pricingCalibrationLookbackDays = 14;
const platformCommissionRate = 0.18;
const routeCompletionMaxSignalAgeMinutes = 10;
const routeCompletionMaxAccuracyMeters = 250;
const routeCompletionMaxSpeedKph = 110;
const csvFormulaPrefixPattern = /^[=+\-@\t\r]/;
const requiredOnboardingDocumentTypes = [
  'IDENTITY_DOCUMENT',
  'DRIVER_LICENSE',
  'VEHICLE_REGISTRATION',
  'INSURANCE_PROOF',
  'SELFIE_VERIFICATION',
] as const;
const documentSafetyPolicies: Record<
  string,
  {
    allowedExtensions: string[];
    maxBytes: number;
  }
> = {
  IDENTITY_DOCUMENT: {
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  DRIVER_LICENSE: {
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  VEHICLE_REGISTRATION: {
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  INSURANCE_PROOF: {
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  SELFIE_VERIFICATION: {
    allowedExtensions: ['jpg', 'jpeg', 'png'],
    maxBytes: 3_000_000,
  },
};
const sensitiveSupportTokenPattern =
  /\b(sessiontoken|session|token|authorization|password|secret|otp|code)\s*[=:]\s*(?:bearer\s+)?["']?[^"'&\s,;)]+["']?/gi;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phonePattern = /\+?\d[\d\s().-]{7,}\d/g;

type LaunchReadinessCheck = {
  id: string;
  label: string;
  state: 'pass' | 'warn' | 'fail';
  detail: string;
};

type LaunchReadinessNextAction = {
  checkId: string;
  severity: 'warning' | 'blocking';
  owner: 'ops' | 'engineering' | 'support' | 'finance';
  action: string;
  runbookAnchor: string;
};

type LaunchReadinessAcknowledgement = {
  checkId: string;
  owner: 'ops' | 'engineering' | 'support' | 'finance';
  severity: 'warning' | 'blocking';
  acknowledgedAt: string;
  actor: {
    id: string;
    name: string | null;
    role: string | null;
  };
  notes: string | null;
};

type LaunchSafetyBenchmarkCapability = {
  id: string;
  label: string;
  status: 'active' | 'partial' | 'planned';
  priority: 'critical' | 'high' | 'medium';
  orbiSignal: string;
  competitorSignal: string;
  nextStep: string;
};

type LaunchFieldQualitySignal = {
  id: string;
  label: string;
  score: number;
  state: 'excellent' | 'watch' | 'blocked';
  owner: 'ops' | 'engineering' | 'support' | 'finance';
  competitorReference: string;
  orbiSignal: string;
  nextStep: string;
};

type LaunchAssuranceGate = {
  id: string;
  label: string;
  status: 'covered' | 'partial' | 'missing';
  priority: 'critical' | 'high' | 'medium';
  owner: 'ops' | 'engineering' | 'support' | 'finance';
  frameworks: string[];
  currentSignal: string;
  nextStep: string;
};

type DriverDocumentIntegritySignal = {
  state: 'complete' | 'partial' | 'missing';
  score: number;
  sizeBytes: number | null;
  sha256: string | null;
  uploadSource: string | null;
  capturedAt: string | null;
  objectVerification: {
    state: 'confirmed' | 'pending' | 'failed' | 'missing';
    provider: string | null;
    objectId: string | null;
    verifiedAt: string | null;
    sizeBytes: number | null;
    sha256: string | null;
    failureReason: string | null;
  };
  safetyScan: {
    state: 'clear' | 'pending' | 'quarantined';
    engine: string | null;
    scannedAt: string | null;
    findings: string[];
    quarantineReason: string | null;
  };
  guidance: {
    level: 'clear' | 'review' | 'resubmit';
    label: string;
    detail: string;
  };
  checks: Array<{
    id: string;
    label: string;
    state: 'pass' | 'warn';
  }>;
};

type DriverOnboardingDecisionGuidance = {
  level: 'approve' | 'review' | 'resubmit';
  recommendedStatus: 'APPROVED' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED';
  label: string;
  detail: string;
  blockers: string[];
};

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
    INCIDENT_EVIDENCE_DECLARED: 'Preuve incident declaree',
    SOS_TRIGGERED: 'SOS declenche',
    SHARE_LINK_CREATED: 'Lien partage cree',
    ROUTE_POSITION_RECORDED: 'Position route recue',
    ROUTE_MONITORING_ALERT: 'Alerte monitoring route',
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

function isJsonRecord(
  value: Prisma.JsonValue | undefined,
): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nullableString(value: Prisma.JsonValue | undefined) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function nullablePositiveInteger(value: Prisma.JsonValue | undefined) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function nullableStringArray(value: Prisma.JsonValue | undefined) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && Boolean(item.trim()),
      )
    : [];
}

function normalizeOnboardingExportGuidanceFilter(
  value: Prisma.JsonValue | undefined,
) {
  return value === 'approve' ||
    value === 'review' ||
    value === 'resubmit' ||
    value === 'all'
    ? value
    : 'all';
}

function resolveDriverDocumentIntegrity(
  metadata: Prisma.JsonValue | null | undefined,
): DriverDocumentIntegritySignal {
  const integrity =
    metadata && isJsonRecord(metadata) && isJsonRecord(metadata.integrity)
      ? metadata.integrity
      : null;
  const sizeBytes = integrity
    ? nullablePositiveInteger(integrity.sizeBytes)
    : null;
  const sha256 = integrity ? nullableString(integrity.sha256) : null;
  const uploadSource = integrity
    ? nullableString(integrity.uploadSource)
    : null;
  const capturedAt = integrity ? nullableString(integrity.capturedAt) : null;
  const objectVerification =
    metadata &&
    isJsonRecord(metadata) &&
    isJsonRecord(metadata.objectVerification)
      ? metadata.objectVerification
      : null;
  const objectVerificationState =
    objectVerification?.state === 'confirmed'
      ? 'confirmed'
      : objectVerification?.state === 'failed'
        ? 'failed'
        : objectVerification?.state === 'pending_provider_confirmation'
          ? 'pending'
          : objectVerification?.state === 'pending'
            ? 'pending'
            : 'missing';
  const objectProvider = objectVerification
    ? nullableString(objectVerification.provider)
    : null;
  const objectId = objectVerification
    ? nullableString(objectVerification.objectId)
    : null;
  const objectVerifiedAt = objectVerification
    ? nullableString(objectVerification.verifiedAt)
    : null;
  const objectSizeBytes = objectVerification
    ? nullablePositiveInteger(objectVerification.sizeBytes)
    : null;
  const objectSha256 = objectVerification
    ? nullableString(objectVerification.sha256)
    : null;
  const objectFailureReason = objectVerification
    ? nullableString(objectVerification.failureReason)
    : null;
  const safetyScan =
    metadata && isJsonRecord(metadata) && isJsonRecord(metadata.safetyScan)
      ? metadata.safetyScan
      : null;
  const safetyScanState =
    safetyScan?.state === 'clear'
      ? 'clear'
      : safetyScan?.state === 'quarantined' ||
          objectVerificationState === 'failed'
        ? 'quarantined'
        : 'pending';
  const safetyScanEngine = safetyScan
    ? nullableString(safetyScan.engine)
    : null;
  const safetyScannedAt = safetyScan
    ? nullableString(safetyScan.scannedAt)
    : null;
  const safetyFindings = safetyScan
    ? nullableStringArray(safetyScan.findings)
    : objectVerificationState === 'failed'
      ? ['object-verification-failed']
      : [];
  const quarantineReason = safetyScan
    ? nullableString(safetyScan.quarantineReason)
    : objectVerificationState === 'failed'
      ? (objectFailureReason ?? 'Provider object verification failed.')
      : null;
  const checks = [
    {
      id: 'size-bytes',
      label: sizeBytes ? 'Taille declaree' : 'Taille manquante',
      state: sizeBytes ? ('pass' as const) : ('warn' as const),
    },
    {
      id: 'sha256',
      label: sha256 ? 'Empreinte SHA-256' : 'Empreinte manquante',
      state: sha256 ? ('pass' as const) : ('warn' as const),
    },
    {
      id: 'upload-source',
      label: uploadSource ? 'Source capturee' : 'Source manquante',
      state: uploadSource ? ('pass' as const) : ('warn' as const),
    },
    {
      id: 'captured-at',
      label: capturedAt ? 'Horodatage backend' : 'Horodatage manquant',
      state: capturedAt ? ('pass' as const) : ('warn' as const),
    },
    {
      id: 'object-verification',
      label:
        objectVerificationState === 'confirmed'
          ? 'Objet provider confirme'
          : objectVerificationState === 'failed'
            ? 'Verification objet echouee'
            : objectVerificationState === 'pending'
              ? 'Confirmation objet en attente'
              : 'Preuve provider manquante',
      state:
        objectVerificationState === 'confirmed'
          ? ('pass' as const)
          : ('warn' as const),
    },
    {
      id: 'safety-scan',
      label:
        safetyScanState === 'clear'
          ? 'Scan documentaire clair'
          : safetyScanState === 'quarantined'
            ? 'Document en quarantaine'
            : 'Scan documentaire en attente',
      state:
        safetyScanState === 'clear' ? ('pass' as const) : ('warn' as const),
    },
  ];
  const passedChecks = checks.filter((check) => check.state === 'pass').length;
  const score = Math.round((passedChecks / checks.length) * 100);
  const state =
    score === 100 ? 'complete' : score === 0 ? 'missing' : 'partial';
  const guidance =
    state === 'complete'
      ? {
          level: 'clear' as const,
          label: 'Preuves completes',
          detail:
            'La taille, la source, le hash, l horodatage backend, la confirmation objet provider et le scan documentaire sont clairs.',
        }
      : state === 'missing'
        ? {
            level: 'resubmit' as const,
            label: 'Redemander la piece',
            detail:
              'Aucune preuve d integrite n accompagne ce justificatif. Demander une nouvelle capture si le contexte est sensible.',
          }
        : {
            level: 'review' as const,
            label: 'Verifier avant decision',
            detail:
              'Certaines preuves existent mais le dossier n est pas completement tracable.',
          };

  return {
    state,
    score,
    sizeBytes,
    sha256,
    uploadSource,
    capturedAt,
    objectVerification: {
      state: objectVerificationState,
      provider: objectProvider,
      objectId,
      verifiedAt: objectVerifiedAt,
      sizeBytes: objectSizeBytes,
      sha256: objectSha256,
      failureReason: objectFailureReason,
    },
    safetyScan: {
      state: safetyScanState,
      engine: safetyScanEngine,
      scannedAt: safetyScannedAt,
      findings: safetyFindings,
      quarantineReason,
    },
    guidance,
    checks,
  };
}

function resolveDriverOnboardingDecisionGuidance(input: {
  approvedDocuments: number;
  pendingDocuments: number;
  rejectedDocuments: number;
  missingRequiredTypes: string[];
  documentsWithIntegrity: Array<{
    document: {
      type: string;
      status: DriverDocumentStatus;
      expiresAt?: Date | null;
    };
    integrity: DriverDocumentIntegritySignal;
  }>;
}): DriverOnboardingDecisionGuidance {
  const documentsToResubmit = input.documentsWithIntegrity.filter(
    ({ document, integrity }) =>
      resolveEffectiveDocumentStatus(document) ===
        DriverDocumentStatus.REJECTED ||
      resolveEffectiveDocumentStatus(document) ===
        DriverDocumentStatus.EXPIRED ||
      integrity.guidance.level === 'resubmit',
  );
  const documentsToReview = input.documentsWithIntegrity.filter(
    ({ document, integrity }) =>
      resolveEffectiveDocumentStatus(document) ===
        DriverDocumentStatus.PENDING || integrity.guidance.level === 'review',
  );
  const blockers = [
    ...input.missingRequiredTypes.map((type) => `${type}: piece absente`),
    ...documentsToResubmit.map(
      ({ document }) => `${document.type}: piece a redemander`,
    ),
  ];

  if (blockers.length > 0 || input.rejectedDocuments > 0) {
    return {
      level: 'resubmit',
      recommendedStatus: 'CHANGES_REQUESTED',
      label: 'Redemande recommandee',
      detail:
        'Le dossier contient une piece absente, expiree, rejetee ou sans preuve exploitable. Demander une nouvelle capture avant approbation.',
      blockers,
    };
  }

  if (
    input.pendingDocuments > 0 ||
    documentsToReview.length > 0 ||
    input.approvedDocuments < requiredOnboardingDocumentTypes.length
  ) {
    return {
      level: 'review',
      recommendedStatus: 'UNDER_REVIEW',
      label: 'Revue prudente',
      detail:
        'Les pieces essentielles sont presentes, mais au moins un point doit etre valide par les operations avant approbation.',
      blockers: documentsToReview.map(
        ({ document }) => `${document.type}: verification ops requise`,
      ),
    };
  }

  return {
    level: 'approve',
    recommendedStatus: 'APPROVED',
    label: 'Pret pour approbation',
    detail:
      'Toutes les pieces requises sont approuvees et les preuves d integrite sont completes.',
    blockers: [],
  };
}

function resolveDriverOnboardingDecisionSnapshot(input: {
  onboardingDocuments: Array<{
    id: string;
    type: string;
    status: DriverDocumentStatus;
    expiresAt?: Date | null;
    uploadedAt?: Date | null;
    metadata?: Prisma.JsonValue | null;
  }>;
  documentDecisions?: UpdateDriverOnboardingReviewDto['documentDecisions'];
}) {
  const decisionOverrides = new Map(
    (input.documentDecisions ?? []).map((decision) => [
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
      expiresAt?: Date | null;
      uploadedAt?: Date | null;
      metadata?: Prisma.JsonValue | null;
    }
  >();

  for (const document of [...input.onboardingDocuments].sort(
    (left, right) =>
      (right.uploadedAt?.getTime() ?? 0) - (left.uploadedAt?.getTime() ?? 0),
  )) {
    if (!latestDocumentsByType.has(document.type)) {
      latestDocumentsByType.set(document.type, document);
    }
  }

  const reviewableDocuments = Array.from(latestDocumentsByType.values()).map(
    (document) => {
      const override = decisionOverrides.get(document.id);

      return {
        ...document,
        status: override?.status ?? document.status,
        expiresAt: override?.expiresAt
          ? new Date(override.expiresAt)
          : document.expiresAt,
      };
    },
  );
  const approvedDocuments = reviewableDocuments.filter(
    (document) => resolveEffectiveDocumentStatus(document) === 'APPROVED',
  ).length;
  const pendingDocuments = reviewableDocuments.filter(
    (document) => resolveEffectiveDocumentStatus(document) === 'PENDING',
  ).length;
  const rejectedDocuments = reviewableDocuments.filter((document) => {
    const status = resolveEffectiveDocumentStatus(document);

    return status === 'REJECTED' || status === 'EXPIRED';
  }).length;
  const documentsWithIntegrity = reviewableDocuments.map((document) => ({
    document,
    integrity: resolveDriverDocumentIntegrity(document.metadata),
  }));
  const missingRequiredTypes = requiredOnboardingDocumentTypes.filter(
    (type) => !latestDocumentsByType.has(type),
  );

  return {
    summary: {
      total: reviewableDocuments.length,
      approved: approvedDocuments,
      pending: pendingDocuments,
      rejected: rejectedDocuments,
      missingRequired: missingRequiredTypes.length,
      integrityWarnings: documentsWithIntegrity.filter(
        ({ integrity }) => integrity.state !== 'complete',
      ).length,
    },
    guidance: resolveDriverOnboardingDecisionGuidance({
      approvedDocuments,
      pendingDocuments,
      rejectedDocuments,
      missingRequiredTypes: [...missingRequiredTypes],
      documentsWithIntegrity,
    }),
  };
}

function resolveStoredDecisionGuidance(
  metadata: Prisma.JsonValue | null | undefined,
): DriverOnboardingDecisionGuidance | null {
  if (!metadata || !isJsonRecord(metadata)) {
    return null;
  }

  const guidance = metadata.decisionGuidance;

  if (!isJsonRecord(guidance)) {
    return null;
  }

  const level =
    guidance.level === 'approve' ||
    guidance.level === 'review' ||
    guidance.level === 'resubmit'
      ? guidance.level
      : null;
  const recommendedStatus =
    guidance.recommendedStatus === 'APPROVED' ||
    guidance.recommendedStatus === 'UNDER_REVIEW' ||
    guidance.recommendedStatus === 'CHANGES_REQUESTED'
      ? guidance.recommendedStatus
      : null;
  const label = nullableString(guidance.label);
  const detail = nullableString(guidance.detail);
  const blockers = Array.isArray(guidance.blockers)
    ? guidance.blockers.filter(
        (blocker): blocker is string =>
          typeof blocker === 'string' && Boolean(blocker.trim()),
      )
    : [];

  if (!level || !recommendedStatus || !label || !detail) {
    return null;
  }

  return {
    level,
    recommendedStatus,
    label,
    detail,
    blockers,
  };
}

function redactSupportText(value: string) {
  return value
    .replace(emailPattern, '[email masque]')
    .replace(phonePattern, '[telephone masque]')
    .replace(sensitiveSupportTokenPattern, '$1=[masque]');
}

function maskRequesterName(fullName: string | null | undefined) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return 'Utilisateur Orbi';
  }

  const [firstName, ...rest] = parts;
  const initials = rest
    .map((part) => part.at(0)?.toUpperCase())
    .filter(Boolean)
    .join('.');

  return initials ? `${firstName} ${initials}.` : firstName;
}

function maskEmailAddress(email: string | null | undefined) {
  if (!email?.trim()) {
    return '[email masque]';
  }

  const [localPart, domain] = email.trim().split('@');

  if (!localPart || !domain) {
    return '[email masque]';
  }

  return `${localPart.slice(0, 1)}***@${domain}`;
}

function maskPhoneNumber(phoneNumber: string | null | undefined) {
  const digits = phoneNumber?.replace(/\D/g, '') ?? '';

  if (digits.length < 4) {
    return null;
  }

  return `***${digits.slice(-4)}`;
}

function shouldMinimizeDriverOnboardingIdentity(auth?: RequestAuthContext) {
  return auth?.user.role === UserRole.SUPPORT;
}

function nullableNonNegativeInteger(value: Prisma.JsonValue | undefined) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function resolveStoredDocumentSummary(
  metadata: Prisma.JsonValue | null | undefined,
) {
  if (!metadata || !isJsonRecord(metadata)) {
    return null;
  }

  const summary = metadata.documentSummary;

  if (!isJsonRecord(summary)) {
    return null;
  }

  const total = nullableNonNegativeInteger(summary.total);
  const approved = nullableNonNegativeInteger(summary.approved);
  const pending = nullableNonNegativeInteger(summary.pending);
  const rejected = nullableNonNegativeInteger(summary.rejected);
  const missingRequired = nullableNonNegativeInteger(summary.missingRequired);
  const integrityWarnings = nullableNonNegativeInteger(
    summary.integrityWarnings,
  );

  if (
    total === null ||
    approved === null ||
    pending === null ||
    rejected === null ||
    missingRequired === null ||
    integrityWarnings === null
  ) {
    return null;
  }

  return {
    total,
    approved,
    pending,
    rejected,
    missingRequired,
    integrityWarnings,
  };
}

function isPrismaUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function normalizePayoutNote(payload?: DriverPayoutApprovalDto) {
  const note = payload?.notes?.trim();

  return note ? note : null;
}

function normalizeRequiredOpsNote(note: string | undefined) {
  const normalized = note?.trim();

  if (!normalized) {
    throw new BadRequestException('An operations note is required.');
  }

  return normalized;
}

function normalizeIdempotencyKey(key: string | undefined) {
  const normalized = key?.trim();

  if (!normalized) {
    throw new BadRequestException('An idempotency key is required.');
  }

  if (
    normalized.length < 8 ||
    normalized.length > 128 ||
    !/^[a-z0-9._-]+$/i.test(normalized)
  ) {
    throw new BadRequestException(
      'Idempotency key must be 8 to 128 URL-safe characters.',
    );
  }

  return normalized;
}

function csvCell(value: string | number | null | undefined) {
  const text = (value === null || value === undefined ? '' : String(value))
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sanitized = csvFormulaPrefixPattern.test(text) ? `'${text}` : text;

  return `"${sanitized.replaceAll('"', '""')}"`;
}

function pdfText(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function buildSimplePdf(lines: string[]) {
  const content = [
    'BT',
    '/F1 10 Tf',
    '50 790 Td',
    ...lines.flatMap((line, index) => {
      const escaped = `(${pdfText(line.slice(0, 115))}) Tj`;

      return index === 0 ? [escaped] : ['0 -14 Td', escaped];
    }),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

function isDispatchSettingsRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && !Array.isArray(value) && typeof value === 'object';
}

function toFiniteNumber(value: unknown) {
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

function roundKm(distanceKm: number) {
  return Number(distanceKm.toFixed(2));
}

function resolveLiveOpsRoutePosition(input: {
  event:
    | {
        payload?: unknown;
        createdAt: Date;
      }
    | undefined;
  rideRequest?: {
    pickupLatitude?: unknown;
    pickupLongitude?: unknown;
    destinationLatitude?: unknown;
    destinationLongitude?: unknown;
  } | null;
}) {
  const payload = isDispatchSettingsRecord(input.event?.payload)
    ? input.event.payload
    : {};
  const latitude = toFiniteNumber(payload.latitude);
  const longitude = toFiniteNumber(payload.longitude);

  if (!input.event || latitude === null || longitude === null) {
    return null;
  }

  const pickupLatitude = toFiniteNumber(input.rideRequest?.pickupLatitude);
  const pickupLongitude = toFiniteNumber(input.rideRequest?.pickupLongitude);
  const destinationLatitude = toFiniteNumber(
    input.rideRequest?.destinationLatitude,
  );
  const destinationLongitude = toFiniteNumber(
    input.rideRequest?.destinationLongitude,
  );
  let distanceToPickupKm: number | null = null;
  let distanceToDestinationKm = toFiniteNumber(payload.distanceToDestinationKm);

  if (pickupLatitude !== null && pickupLongitude !== null) {
    distanceToPickupKm = roundKm(
      haversineKm(
        { latitude, longitude },
        { latitude: pickupLatitude, longitude: pickupLongitude },
      ),
    );
  }

  if (
    distanceToDestinationKm === null &&
    destinationLatitude !== null &&
    destinationLongitude !== null
  ) {
    distanceToDestinationKm = roundKm(
      haversineKm(
        { latitude, longitude },
        { latitude: destinationLatitude, longitude: destinationLongitude },
      ),
    );
  }

  return {
    latitude,
    longitude,
    accuracyMeters: toFiniteNumber(payload.accuracyMeters),
    speedKph: toFiniteNumber(payload.speedKph),
    distanceToPickupKm,
    distanceToDestinationKm,
    observedAt:
      typeof payload.observedAt === 'string'
        ? payload.observedAt
        : input.event.createdAt.toISOString(),
    sourceRole:
      typeof payload.sourceRole === 'string' ? payload.sourceRole : null,
  };
}

function resolveLiveOpsCompletionGate(input: {
  status: string;
  routeMonitoring: {
    state: 'clear' | 'warning' | 'critical' | 'unknown';
    lastPositionAt: string | null;
    latestPosition: {
      accuracyMeters: number | null;
      speedKph: number | null;
    } | null;
  };
  now: Date;
}) {
  if (input.status !== 'IN_PROGRESS') {
    return {
      state: 'not_applicable' as const,
      label: 'Finalisation non ouverte',
      reason: 'La course n est pas encore en phase de depot.',
      action: 'Suivre le prochain changement de statut.',
      canOpsOverride: false,
    };
  }

  if (
    !input.routeMonitoring.lastPositionAt ||
    !input.routeMonitoring.latestPosition
  ) {
    return {
      state: 'blocked' as const,
      label: 'Finalisation bloquee',
      reason: 'Aucun signal GPS chauffeur exploitable.',
      action:
        'Contacter le chauffeur, demander une actualisation GPS puis finaliser cote ops seulement apres verification.',
      canOpsOverride: true,
    };
  }

  const lastPositionAt = new Date(input.routeMonitoring.lastPositionAt);
  const signalAgeMinutes =
    (input.now.getTime() - lastPositionAt.getTime()) / 60000;

  if (
    Number.isFinite(signalAgeMinutes) &&
    signalAgeMinutes > routeCompletionMaxSignalAgeMinutes
  ) {
    return {
      state: 'blocked' as const,
      label: 'Finalisation bloquee',
      reason: `Signal GPS chauffeur ancien (${Math.round(signalAgeMinutes)} min).`,
      action:
        'Obtenir un nouveau ping chauffeur ou verifier manuellement le depot avant resolution ops.',
      canOpsOverride: true,
    };
  }

  if (input.routeMonitoring.state === 'critical') {
    return {
      state: 'blocked' as const,
      label: 'Finalisation bloquee',
      reason: 'Alerte route critique active.',
      action:
        'Verifier deviation, incident ou spoofing GPS avant toute resolution manuelle.',
      canOpsOverride: true,
    };
  }

  const { accuracyMeters, speedKph } = input.routeMonitoring.latestPosition;

  if (
    typeof accuracyMeters === 'number' &&
    accuracyMeters > routeCompletionMaxAccuracyMeters
  ) {
    return {
      state: 'blocked' as const,
      label: 'Finalisation bloquee',
      reason: `Precision GPS insuffisante (${Math.round(accuracyMeters)} m).`,
      action:
        'Demander au chauffeur de stabiliser le GPS avant finalisation ou documenter une resolution ops.',
      canOpsOverride: true,
    };
  }

  if (typeof speedKph === 'number' && speedKph > routeCompletionMaxSpeedKph) {
    return {
      state: 'blocked' as const,
      label: 'Finalisation bloquee',
      reason: `Vitesse route impossible (${Math.round(speedKph)} km/h).`,
      action:
        'Verifier la position et exclure une manipulation GPS avant resolution.',
      canOpsOverride: true,
    };
  }

  return {
    state: 'ready' as const,
    label: 'Finalisation possible',
    reason: 'Le signal route chauffeur est exploitable.',
    action: 'Laisser le chauffeur finaliser ou assister le support si besoin.',
    canOpsOverride: false,
  };
}

function isLaunchReadinessOwner(
  value: unknown,
): value is LaunchReadinessAcknowledgement['owner'] {
  return (
    typeof value === 'string' &&
    ['ops', 'engineering', 'support', 'finance'].includes(value)
  );
}

function isLaunchReadinessSeverity(
  value: unknown,
): value is LaunchReadinessAcknowledgement['severity'] {
  return typeof value === 'string' && ['warning', 'blocking'].includes(value);
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

function resolveLaunchDecision(checks: LaunchReadinessCheck[]) {
  const failedChecks = checks.filter((check) => check.state === 'fail').length;
  const warningChecks = checks.filter((check) => check.state === 'warn').length;

  if (failedChecks) {
    return {
      state: 'blocked' as const,
      label: 'production pilot bloque',
      detail: `${failedChecks} check(s) critique(s) doivent etre corriges avant un pilote production.`,
    };
  }

  if (warningChecks) {
    return {
      state: 'limited' as const,
      label: 'pilote limite seulement',
      detail: `${warningChecks} warning(s) restent a stabiliser avant une montee en charge.`,
    };
  }

  return {
    state: 'approved' as const,
    label: 'pilot autorise',
    detail:
      'Les signaux runtime, ops, onboarding et argent sont compatibles avec un pilote production encadre.',
  };
}

function resolveLaunchReadinessNextActions(
  checks: LaunchReadinessCheck[],
): LaunchReadinessNextAction[] {
  const actionByCheckId: Record<
    string,
    Omit<LaunchReadinessNextAction, 'severity'>
  > = {
    'runtime-production-readiness': {
      checkId: 'runtime-production-readiness',
      owner: 'engineering',
      action:
        'Corriger les checks runtime production, puis verifier health/ready et launch-readiness avant reprise du pilote.',
      runbookAnchor: 'checklist-avant-de-deployer',
    },
    'support-load': {
      checkId: 'support-load',
      owner: 'support',
      action:
        'Reduire la file support active ou confirmer une permanence support dediee pour le pilote.',
      runbookAnchor: 'checklist-apres-deploiement',
    },
    'urgent-support': {
      checkId: 'urgent-support',
      owner: 'support',
      action:
        'Traiter les tickets P3 ouverts et confirmer qu aucun incident securite ou paiement ne reste sans owner.',
      runbookAnchor: 'checklist-apres-deploiement',
    },
    'driver-onboarding': {
      checkId: 'driver-onboarding',
      owner: 'ops',
      action:
        'Vider ou prioriser la file onboarding chauffeur avant extension du pilote terrain.',
      runbookAnchor: 'checklist-apres-deploiement',
    },
    'driver-documents': {
      checkId: 'driver-documents',
      owner: 'ops',
      action:
        'Approuver, rejeter ou demander correction pour les justificatifs chauffeur en attente.',
      runbookAnchor: 'checklist-apres-deploiement',
    },
    'payment-refunds': {
      checkId: 'payment-refunds',
      owner: 'finance',
      action:
        'Reconciler les remboursements provider et documenter les references fournisseur manquantes.',
      runbookAnchor: 'paiements-et-argent',
    },
    'payment-webhooks': {
      checkId: 'payment-webhooks',
      owner: 'finance',
      action:
        'Ouvrir le journal webhook, qualifier les evenements ignores et relancer seulement les evenements idempotents.',
      runbookAnchor: 'paiements-et-argent',
    },
    'driver-wallet-recovery': {
      checkId: 'driver-wallet-recovery',
      owner: 'finance',
      action:
        'Examiner les wallets chauffeur en recouvrement avant tout payout ou extension de volume.',
      runbookAnchor: 'paiements-et-argent',
    },
    'admin-realtime': {
      checkId: 'admin-realtime',
      owner: 'engineering',
      action:
        'Restaurer le flux temps reel admin ou confirmer un mode de supervision manuel avant le pilote.',
      runbookAnchor: 'temps-reel',
    },
    'safety-benchmark': {
      checkId: 'safety-benchmark',
      owner: 'ops',
      action:
        'Prioriser SOS, partage trajet, route monitoring et contacts de confiance avant toute extension hors pilote limite.',
      runbookAnchor: 'securite-et-benchmark-concurrents',
    },
    'security-assurance': {
      checkId: 'security-assurance',
      owner: 'engineering',
      action:
        'Completer les gates OWASP/NIST critiques: API/BOLA, mobile MASVS, paiements, admin RBAC, fraude GPS et resilience.',
      runbookAnchor: 'assurance-securite-owasp-nist',
    },
  };

  return checks
    .filter((check) => check.state !== 'pass')
    .map((check) => ({
      ...actionByCheckId[check.id],
      severity: check.state === 'fail' ? 'blocking' : 'warning',
    }))
    .filter((action): action is LaunchReadinessNextAction =>
      Boolean(action.checkId),
    );
}

function resolveLaunchSecurityAssurance(input: {
  productionRiskLevel: 'low' | 'medium' | 'high';
  serviceLevelPosture?: 'healthy' | 'watch' | 'breached';
  realtimeDegraded: boolean;
  urgentSupportTickets: number;
  pendingDocuments: number;
  refundPendingPayments: number;
  ignoredPaymentWebhooks: number;
  recoveryWallets: number;
  safetyParityRate: number;
  criticalSafetyGaps: number;
}) {
  const runtimeCovered =
    input.productionRiskLevel === 'low' &&
    input.serviceLevelPosture !== 'breached';
  const moneyCovered =
    input.refundPendingPayments === 0 &&
    input.ignoredPaymentWebhooks === 0 &&
    input.recoveryWallets === 0;
  const safetyCovered =
    input.criticalSafetyGaps === 0 && input.safetyParityRate >= 95;
  const opsCovered =
    input.urgentSupportTickets === 0 && input.pendingDocuments === 0;
  const gates: LaunchAssuranceGate[] = [
    {
      id: 'api-bola-rbac',
      label: 'API BOLA/RBAC/ABAC',
      status: runtimeCovered ? 'covered' : 'partial',
      priority: 'critical',
      owner: 'engineering',
      frameworks: ['OWASP API Top 10', 'OWASP WSTG', 'NIST SSDF'],
      currentSignal: `Runtime ${input.productionRiskLevel}; SLO ${input.serviceLevelPosture ?? 'non expose'}.`,
      nextStep:
        'Etendre les tests d autorisation par objet sur trips, factures, KYC, admin et paiements avec cas cross-role.',
    },
    {
      id: 'mobile-masvs',
      label: 'Mobile MASVS/MASTG',
      status: runtimeCovered && !input.realtimeDegraded ? 'partial' : 'missing',
      priority: 'critical',
      owner: 'engineering',
      frameworks: ['OWASP MASVS', 'OWASP MASTG', 'NIST SSDF'],
      currentSignal: input.realtimeDegraded
        ? 'Realtime degrade: reprise mobile a valider avant pilote large.'
        : 'Smoke mobile et taxonomie MOB-* disponibles; hardening natif a completer.',
      nextStep:
        'Ajouter checks stockage tokens, deep links, screenshots sensibles, reprise offline et detection environnement compromis.',
    },
    {
      id: 'payments-mobile-money',
      label: 'Paiements et Mobile Money',
      status: moneyCovered ? 'covered' : 'partial',
      priority: 'critical',
      owner: 'finance',
      frameworks: ['OWASP API Top 10', 'OWASP WSTG', 'PCI-DSS scoping'],
      currentSignal: `${input.refundPendingPayments} refund(s), ${input.ignoredPaymentWebhooks} webhook(s) ignore(s), ${input.recoveryWallets} wallet(s) en recouvrement.`,
      nextStep:
        'Couvrir signature webhook, replay, double paiement, XOF rounding, reconciliation et rollback provider.',
    },
    {
      id: 'gps-fraud-realtime',
      label: 'GPS, fraude et temps reel',
      status: safetyCovered && !input.realtimeDegraded ? 'covered' : 'partial',
      priority: 'critical',
      owner: 'ops',
      frameworks: ['OWASP API Top 10', 'OWASP WSTG', 'NIST SSDF'],
      currentSignal: `${input.safetyParityRate}% parite securite; realtime ${input.realtimeDegraded ? 'degrade' : 'stable'}.`,
      nextStep:
        'Ajouter scenarios faux GPS, trajets impossibles, replay events WebSocket et alertes fraude route.',
    },
    {
      id: 'admin-data-governance',
      label: 'Admin, KYC et donnees personnelles',
      status: opsCovered ? 'covered' : 'partial',
      priority: 'critical',
      owner: 'support',
      frameworks: ['OWASP WSTG', 'OWASP API Top 10', 'NIST SSDF'],
      currentSignal: `${input.urgentSupportTickets} P3; ${input.pendingDocuments} document(s) chauffeur en attente.`,
      nextStep:
        'Tester MFA admin, double validation actions critiques, exports CSV, KYC, retention logs et audit trail immuable.',
    },
    {
      id: 'resilience-devsecops',
      label: 'Resilience et chaine de dev',
      status: runtimeCovered && moneyCovered ? 'partial' : 'missing',
      priority: 'high',
      owner: 'engineering',
      frameworks: ['NIST SSDF', 'OWASP WSTG'],
      currentSignal: `Runtime ${input.productionRiskLevel}; argent ${moneyCovered ? 'stable' : 'surveillance'}.`,
      nextStep:
        'Brancher SAST, SCA, secret scanning, container/IaC scanning, sauvegarde/restauration et exercices incident.',
    },
  ];
  const coveredGates = gates.filter((gate) => gate.status === 'covered').length;
  const partialGates = gates.filter((gate) => gate.status === 'partial').length;
  const missingGates = gates.filter((gate) => gate.status === 'missing').length;
  const criticalOpenGates = gates.filter(
    (gate) => gate.priority === 'critical' && gate.status !== 'covered',
  ).length;
  const coverageRate = safeRate(
    coveredGates + partialGates * 0.5,
    gates.length,
  );

  return {
    summary: {
      totalGates: gates.length,
      coveredGates,
      partialGates,
      missingGates,
      criticalOpenGates,
      coverageRate,
      launchPosture: criticalOpenGates
        ? ('limited' as const)
        : coverageRate >= 85
          ? ('ready' as const)
          : ('limited' as const),
    },
    gates,
  };
}

function serializeLaunchReadinessAcknowledgements(
  auditLogs: Array<{
    entityId: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    user: {
      id: string;
      fullName: string | null;
      role: string | null;
    };
  }>,
): LaunchReadinessAcknowledgement[] {
  const latestByCheckId = new Map<string, LaunchReadinessAcknowledgement>();

  for (const entry of auditLogs) {
    if (!entry.entityId || latestByCheckId.has(entry.entityId)) {
      continue;
    }

    const metadata = isDispatchSettingsRecord(entry.metadata)
      ? entry.metadata
      : {};
    const owner = metadata.owner;
    const severity = metadata.severity;

    if (
      !isLaunchReadinessOwner(owner) ||
      !isLaunchReadinessSeverity(severity)
    ) {
      continue;
    }

    latestByCheckId.set(entry.entityId, {
      checkId: entry.entityId,
      owner,
      severity,
      acknowledgedAt: entry.createdAt.toISOString(),
      actor: {
        id: entry.user.id,
        name: entry.user.fullName,
        role: entry.user.role,
      },
      notes: typeof metadata.notes === 'string' ? metadata.notes : null,
    });
  }

  return Array.from(latestByCheckId.values());
}

function summarizeLaunchReadinessActions(
  nextActions: LaunchReadinessNextAction[],
  acknowledgements: LaunchReadinessAcknowledgement[],
) {
  const acknowledgedCheckIds = new Set(
    acknowledgements.map((acknowledgement) => acknowledgement.checkId),
  );
  const blockingActions = nextActions.filter(
    (action) => action.severity === 'blocking',
  );
  const acknowledgedActions = nextActions.filter((action) =>
    acknowledgedCheckIds.has(action.checkId),
  );
  const acknowledgedBlockingActions = blockingActions.filter((action) =>
    acknowledgedCheckIds.has(action.checkId),
  );
  const totalActions = nextActions.length;
  const acknowledgedActionCount = acknowledgedActions.length;

  return {
    totalActions,
    acknowledgedActions: acknowledgedActionCount,
    remainingActions: totalActions - acknowledgedActionCount,
    blockingActions: blockingActions.length,
    acknowledgedBlockingActions: acknowledgedBlockingActions.length,
    remainingBlockingActions:
      blockingActions.length - acknowledgedBlockingActions.length,
    completionRate: safeRate(acknowledgedActionCount, totalActions),
  };
}

function resolveLaunchSafetyBenchmark() {
  const capabilities: LaunchSafetyBenchmarkCapability[] = [
    {
      id: 'pickup-code',
      label: 'Code pickup anti-erreur',
      status: 'active',
      priority: 'critical',
      orbiSignal:
        'Code de prise en charge emis, visible et verifiable avant depart.',
      competitorSignal: 'Uber Verify your ride, Bolt pickup codes.',
      nextStep:
        'Garder le code obligatoire sur tous les trajets pilotes et auditer les echecs de verification.',
    },
    {
      id: 'driver-document-verification',
      label: 'Verification chauffeur',
      status: 'active',
      priority: 'critical',
      orbiSignal:
        'Piece, permis, carte grise, assurance et selfie requis avant activation.',
      competitorSignal:
        'Uber/Bolt/Yango mettent en avant verification documentaire et identite chauffeur.',
      nextStep:
        'Ajouter reverification periodique et expiration bloquante par type de document.',
    },
    {
      id: 'trip-gps-tracking',
      label: 'Trace trajet GPS',
      status: 'active',
      priority: 'critical',
      orbiSignal:
        'Trips, timeline live ops et lien de partage securise a expiration courte disponibles.',
      competitorSignal:
        'Uber/Bolt/Yango exposent partage de trajet et suivi route.',
      nextStep:
        'Brancher rafraichissement temps reel public et carte GPS precise quand la position live est disponible.',
    },
    {
      id: 'sos-button',
      label: 'SOS en course',
      status: 'active',
      priority: 'critical',
      orbiSignal:
        'Bouton SOS rider/driver, ticket P3, event realtime, audit log et appel local 112 disponibles.',
      competitorSignal:
        'Uber Emergency Button, Bolt Emergency Assist, Yango SOS Button.',
      nextStep:
        'Ajouter capture GPS native et contacts de confiance pour enrichir la prise en charge.',
    },
    {
      id: 'route-monitoring',
      label: 'Detection deviation/arret',
      status: 'active',
      priority: 'critical',
      orbiSignal:
        'Pings route journalises, detection arret long, deviation et absence de progression avec ticket support et alerte live ops.',
      competitorSignal:
        'Uber RideCheck, Bolt Ride Check, Yango route monitoring.',
      nextStep:
        'Brancher la capture GPS native continue et regler les seuils avec les donnees pilote Ouaga.',
    },
    {
      id: 'trusted-contacts',
      label: 'Contacts de confiance',
      status: 'active',
      priority: 'high',
      orbiSignal:
        'Contact de confiance rider configure, audite, avec modes manuel, nuit ou tous trajets et partage trajet securise.',
      competitorSignal:
        'Uber Emergency Contacts, Bolt Trusted Contacts, Yango trusted contacts.',
      nextStep:
        'Etendre vers plusieurs contacts, SMS/WhatsApp provider et regles automatiques basees heure/zone.',
    },
    {
      id: 'audio-conflict-evidence',
      label: 'Preuve incident chiffree',
      status: 'active',
      priority: 'high',
      orbiSignal:
        'Declaration volontaire de preuve audio/photo/video/note, consentement explicite, retention courte et aucun upload automatique.',
      competitorSignal:
        'Uber/Bolt/Yango proposent enregistrement audio selon pays.',
      nextStep:
        'Ajouter stockage local chiffre natif, upload support explicite et purge automatique verifiable.',
    },
    {
      id: 'driver-fatigue-limits',
      label: 'Limites fatigue chauffeur',
      status: 'active',
      priority: 'high',
      orbiSignal:
        'Mise en ligne et acceptation bloquees apres seuil de courses/minutes sur fenetre glissante avec pause obligatoire auditee.',
      competitorSignal: 'Bolt driving shift limits, Yango shift control.',
      nextStep:
        'Calibrer par ville, chaleur, heure de nuit et type vehicule avec donnees pilote.',
    },
  ];
  const activeCapabilities = capabilities.filter(
    (capability) => capability.status === 'active',
  ).length;
  const partialCapabilities = capabilities.filter(
    (capability) => capability.status === 'partial',
  ).length;
  const plannedCapabilities = capabilities.filter(
    (capability) => capability.status === 'planned',
  ).length;
  const criticalGaps = capabilities.filter(
    (capability) =>
      capability.priority === 'critical' && capability.status !== 'active',
  ).length;

  return {
    summary: {
      totalCapabilities: capabilities.length,
      activeCapabilities,
      partialCapabilities,
      plannedCapabilities,
      criticalGaps,
      competitorParityRate: safeRate(
        activeCapabilities + partialCapabilities * 0.5,
        capabilities.length,
      ),
    },
    capabilities,
  };
}

function resolveLaunchFieldQuality(input: {
  productionRiskLevel: 'low' | 'medium' | 'high';
  serviceLevelPosture?: 'healthy' | 'watch' | 'breached';
  realtimeDegraded: boolean;
  activeRealtimeStreams: number;
  openSupportTickets: number;
  urgentSupportTickets: number;
  onboardingReviewQueue: number;
  pendingDocuments: number;
  refundPendingPayments: number;
  ignoredPaymentWebhooks: number;
  recoveryWallets: number;
  safetyParityRate: number;
  criticalSafetyGaps: number;
}) {
  const signals: LaunchFieldQualitySignal[] = [
    {
      id: 'runtime-mobile-stability',
      label: 'Stabilite runtime et mobile',
      score:
        input.productionRiskLevel === 'low' &&
        input.serviceLevelPosture !== 'breached'
          ? 100
          : input.productionRiskLevel === 'high' ||
              input.serviceLevelPosture === 'breached'
            ? 35
            : 72,
      state:
        input.productionRiskLevel === 'high' ||
        input.serviceLevelPosture === 'breached'
          ? 'blocked'
          : input.productionRiskLevel === 'medium' ||
              input.serviceLevelPosture === 'watch'
            ? 'watch'
            : 'excellent',
      owner: 'engineering',
      competitorReference:
        'Uber, Bolt et Yango reduisent les bugs visibles par observabilite, crash triage et fallback temps reel.',
      orbiSignal: `Risque runtime ${input.productionRiskLevel}; SLO ${input.serviceLevelPosture ?? 'non expose'}.`,
      nextStep:
        'Brancher crash reporting mobile, traces backend et alertes externes sur les codes MOB-* deja exposes.',
    },
    {
      id: 'safety-trust',
      label: 'Securite et confiance visibles',
      score:
        input.criticalSafetyGaps === 0
          ? Math.min(100, input.safetyParityRate)
          : Math.max(45, input.safetyParityRate - 20),
      state:
        input.criticalSafetyGaps > 0
          ? 'blocked'
          : input.safetyParityRate >= 95
            ? 'excellent'
            : 'watch',
      owner: 'ops',
      competitorReference:
        'Les leaders mettent en avant SOS, partage trajet, verification, PIN et ride checks.',
      orbiSignal: `${input.safetyParityRate}% de parite securite; ${input.criticalSafetyGaps} gap critique.`,
      nextStep:
        'Continuer la calibration terrain des seuils SOS, route monitoring, fatigue et preuve volontaire.',
    },
    {
      id: 'support-incident-response',
      label: 'Support et incidents',
      score:
        input.urgentSupportTickets > 0
          ? 55
          : input.openSupportTickets <= 5
            ? 96
            : 74,
      state:
        input.urgentSupportTickets > 0
          ? 'watch'
          : input.openSupportTickets <= 5
            ? 'excellent'
            : 'watch',
      owner: 'support',
      competitorReference:
        'Uber/Bolt/Yango vendent une assistance rapide; Orbi doit montrer les owners et SLA.',
      orbiSignal: `${input.openSupportTickets} ticket(s) actifs; ${input.urgentSupportTickets} P3.`,
      nextStep:
        'Ajouter SLA par priorite, temps de premiere reponse et rituel support quotidien pilote.',
    },
    {
      id: 'driver-supply-quality',
      label: 'Qualite flotte chauffeur',
      score:
        input.pendingDocuments === 0 && input.onboardingReviewQueue <= 3
          ? 94
          : input.pendingDocuments <= 3 && input.onboardingReviewQueue <= 6
            ? 76
            : 58,
      state:
        input.pendingDocuments === 0 && input.onboardingReviewQueue <= 3
          ? 'excellent'
          : 'watch',
      owner: 'ops',
      competitorReference:
        'Les concurrents gagnent par disponibilite chauffeur et controle documentaire constant.',
      orbiSignal: `${input.onboardingReviewQueue} dossier(s) onboarding; ${input.pendingDocuments} document(s) en attente.`,
      nextStep:
        'Ajouter expiration bloquante, reverification periodique et score de qualite chauffeur par zone.',
    },
    {
      id: 'money-reliability',
      label: 'Fiabilite argent',
      score:
        input.refundPendingPayments === 0 &&
        input.ignoredPaymentWebhooks === 0 &&
        input.recoveryWallets === 0
          ? 98
          : input.ignoredPaymentWebhooks > 0 || input.recoveryWallets > 0
            ? 62
            : 78,
      state:
        input.ignoredPaymentWebhooks > 0 || input.recoveryWallets > 0
          ? 'watch'
          : 'excellent',
      owner: 'finance',
      competitorReference:
        'La confiance paiement vient de la reconciliation, des remboursements et des payouts lisibles.',
      orbiSignal: `${input.refundPendingPayments} refund(s), ${input.ignoredPaymentWebhooks} webhook(s) ignore(s), ${input.recoveryWallets} wallet(s) en recouvrement.`,
      nextStep:
        'Connecter reconciliation provider planifiee, exports finance signes et alertes double-debit zero tolerance.',
    },
    {
      id: 'realtime-ops-control',
      label: 'Controle temps reel ops',
      score: input.realtimeDegraded
        ? 38
        : input.activeRealtimeStreams > 0
          ? 95
          : 74,
      state: input.realtimeDegraded
        ? 'blocked'
        : input.activeRealtimeStreams > 0
          ? 'excellent'
          : 'watch',
      owner: 'engineering',
      competitorReference:
        'Le suivi live concurrentiel repose sur evenements fiables, reprise et supervision active.',
      orbiSignal: input.realtimeDegraded
        ? 'Transport realtime degrade.'
        : `${input.activeRealtimeStreams} flux realtime actif(s).`,
      nextStep:
        'Ajouter replay court, resume apres deconnexion et backplane partage obligatoire en production.',
    },
  ];
  const score = Math.round(
    signals.reduce((total, signal) => total + signal.score, 0) / signals.length,
  );
  const blockedSignals = signals.filter(
    (signal) => signal.state === 'blocked',
  ).length;
  const watchSignals = signals.filter(
    (signal) => signal.state === 'watch',
  ).length;

  return {
    score,
    state: blockedSignals
      ? ('blocked' as const)
      : watchSignals
        ? ('watch' as const)
        : ('excellent' as const),
    blockedSignals,
    watchSignals,
    signals,
  };
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
    private readonly documentObjectStorageService: DocumentObjectStorageService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly healthIncidentJournalService: HealthIncidentJournalService,
    private readonly healthService: HealthService,
    private readonly driversService: DriversService,
    private readonly paymentsService: PaymentsService,
    private readonly jobQueueService: JobQueueService,
    private readonly notificationsService: NotificationsService,
    private readonly cache: RedisCacheService,
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
          label: 'Revenus encaisses (24h)',
          value: `XOF ${metrics.revenueXof24h.toLocaleString('fr-FR')}`,
          trend: 'Paiements reussis, dernieres 24h',
        },
        {
          label: 'Taux de completion (24h)',
          value: `${metrics.completionRate24h.toLocaleString('fr-FR')}%`,
          trend: `${metrics.activeTrips} trajets actifs`,
        },
        {
          label: 'Temps moyen pickup (24h)',
          value:
            metrics.avgPickupMinutes24h === null
              ? 'Pas de donnee'
              : `${metrics.avgPickupMinutes24h.toLocaleString('fr-FR')} min`,
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

  async jobQueue(query: JobQueueQueryDto) {
    const page = resolvePageQuery(query);
    const result = await this.jobQueueService.list({
      page: page.page,
      pageSize: page.pageSize,
      kind: query.kind,
      status: query.status,
    });
    const snapshot = await this.jobQueueService.snapshot();

    return {
      ...result,
      snapshot,
      jobs: result.jobs.map((job) => ({
        id: job.id,
        kind: job.kind,
        status: job.status,
        dedupeKey: job.dedupeKey,
        entityType: job.entityType,
        entityId: job.entityId,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        nextRunAt: job.nextRunAt.toISOString(),
        lockedAt: job.lockedAt?.toISOString() ?? null,
        completedAt: job.completedAt?.toISOString() ?? null,
        failedAt: job.failedAt?.toISOString() ?? null,
        lastError: job.lastError,
        deadLetterReason: job.deadLetterReason,
        diagnostics: this.buildJobQueueDiagnostics(job),
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      })),
    };
  }

  private buildJobQueueDiagnostics(job: {
    kind: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    payload?: Prisma.JsonValue;
    lastError: string | null;
    deadLetterReason: string | null;
  }) {
    const payload = isJsonRecord(job.payload) ? job.payload : {};
    const error = `${job.deadLetterReason ?? ''} ${job.lastError ?? ''}`;
    const riskSignals: string[] = [];
    let severity: 'low' | 'medium' | 'high' | 'critical' =
      job.status === 'DEAD_LETTER' ? 'high' : 'medium';
    let owner: 'ops' | 'engineering' | 'finance' | 'trust-and-safety' =
      'engineering';
    let canRequeueSafely = job.status === 'DEAD_LETTER';
    let recommendedAction =
      job.status === 'DEAD_LETTER'
        ? 'Verifier la cause, corriger la configuration ou la donnee, puis remettre en file.'
        : 'Surveiller le prochain passage worker.';

    if (job.kind === 'DRIVER_DOCUMENT') {
      owner = 'trust-and-safety';
      const safetyScanState = nullableString(payload.safetyScanState);
      const objectVerificationState = nullableString(
        payload.objectVerificationState,
      );
      const documentType = nullableString(payload.documentType);

      if (documentType) {
        riskSignals.push(`document:${documentType}`);
      }

      if (objectVerificationState) {
        riskSignals.push(`object:${objectVerificationState}`);
      }

      if (safetyScanState) {
        riskSignals.push(`scan:${safetyScanState}`);
      }

      recommendedAction =
        safetyScanState === 'quarantined' ||
        error.includes('scanner') ||
        error.includes('document')
          ? 'Ouvrir la file onboarding, verifier la raison de quarantaine et ne pas approuver le chauffeur avant correction.'
          : 'Verifier que le scan documentaire worker a persiste un verdict clair.';
      canRequeueSafely =
        job.status === 'DEAD_LETTER' &&
        safetyScanState !== 'quarantined' &&
        objectVerificationState !== 'failed' &&
        !error.includes('quarantine');
      severity = canRequeueSafely ? severity : 'critical';
    } else if (job.kind === 'PAYMENT_WEBHOOK') {
      owner = 'finance';
      const action = nullableString(payload.action);
      const provider = nullableString(payload.provider);

      if (provider) {
        riskSignals.push(`provider:${provider}`);
      }

      if (action) {
        riskSignals.push(`action:${action}`);
      }

      recommendedAction =
        action?.includes('ignored') || error.includes('provider')
          ? 'Ouvrir le journal webhooks paiement, verifier signature/reference/montant, puis relancer seulement si idempotent.'
          : 'Verifier la reconciliation paiement avant requeue.';
      canRequeueSafely =
        job.status === 'DEAD_LETTER' &&
        !action?.includes('ignored') &&
        !error.includes('conflicting') &&
        !error.includes('amount') &&
        !error.includes('currency');
      severity = canRequeueSafely ? severity : 'critical';
    } else if (job.kind === 'PAYMENT_REFUND_VERIFICATION') {
      owner = 'finance';
      const providerRefundReference = nullableString(
        payload.providerRefundReference,
      );
      const paymentAttemptId = nullableString(payload.paymentAttemptId);

      if (providerRefundReference) {
        riskSignals.push(`refund:${providerRefundReference}`);
      }

      if (paymentAttemptId) {
        riskSignals.push(`payment:${paymentAttemptId}`);
      }

      recommendedAction = error.includes('still_pending')
        ? 'Verifier le statut provider du remboursement; requeue acceptable tant que le provider n a pas finalise.'
        : 'Controler la tentative paiement, la reference refund provider et le solde wallet avant requeue.';
      canRequeueSafely =
        job.status === 'DEAD_LETTER' &&
        !error.includes('missing') &&
        !error.includes('not enabled');
      severity = canRequeueSafely ? 'high' : 'critical';
    } else if (job.kind === 'NOTIFICATION') {
      owner = 'ops';
      const channel = nullableString(payload.channel);

      if (channel) {
        riskSignals.push(`channel:${channel}`);
      }

      recommendedAction = error.includes('provider')
        ? 'Configurer le provider notification ou basculer temporairement sur le provider local avant requeue.'
        : 'Verifier que la notification n est pas deja marquee envoyee avant requeue.';
      canRequeueSafely =
        job.status === 'DEAD_LETTER' && !error.includes('provider');
      severity = canRequeueSafely ? 'medium' : severity;
    } else if (job.kind === 'DRIVER_RESERVATION_EXPIRY') {
      owner = 'ops';
      riskSignals.push('dispatch:reservation-expiry');
      recommendedAction = error.includes('expiry')
        ? 'Verifier la sante dispatch et relancer seulement si le worker durable est revenu stable.'
        : 'Surveiller que le worker durable expire les reservations chauffeur sans double sweep multi-instance.';
      canRequeueSafely =
        job.status === 'DEAD_LETTER' && !error.includes('database');
      severity = canRequeueSafely ? 'medium' : severity;
    }

    return {
      attemptPressure:
        job.maxAttempts > 0
          ? Math.round((job.attempts / job.maxAttempts) * 100)
          : 0,
      canRequeueSafely,
      owner,
      riskSignals,
      recommendedAction,
      severity,
    };
  }

  async requeueJob(jobId: string, auth: RequestAuthContext) {
    const job = await this.jobQueueService.requeueDeadLetter(jobId);

    if (!job) {
      throw new BadRequestException(
        'Only dead-letter jobs can be requeued from admin operations.',
      );
    }

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'JOB_QUEUE_DEAD_LETTER_REQUEUED',
        entityType: 'JOB_QUEUE_ENTRY',
        entityId: job.id,
        metadata: {
          kind: job.kind,
          entityType: job.entityType,
          entityId: job.entityId,
          attempts: job.attempts,
          actorRole: auth.user.role,
        } as Prisma.InputJsonValue,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'job-queue.requeued',
      entityId: job.id,
      actorRole: auth.user.role,
      payload: {
        kind: job.kind,
        entityType: job.entityType,
        entityId: job.entityId,
      },
    });

    return {
      job: {
        id: job.id,
        kind: job.kind,
        status: job.status,
        attempts: job.attempts,
        nextRunAt: job.nextRunAt.toISOString(),
      },
    };
  }

  async overview() {
    // Tableau de bord ops interrogé toutes les 60s : une légère latence de
    // fraîcheur (30s) est négligeable face au gain de charge DB.
    return this.cache.getOrSet('admin:overview', () => this.fetchOverview(), 30);
  }

  private async fetchOverview() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      users,
      riders,
      drivers,
      vehicles,
      openRequests,
      activeTrips,
      revenueAgg,
      completedTrips24h,
      cancelledTrips24h,
      pickupTrips24h,
    ] = await Promise.all([
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
      this.prisma.paymentAttempt.aggregate({
        where: { status: 'SUCCEEDED', createdAt: { gte: since } },
        _sum: { amount: true },
      }),
      this.prisma.trip.count({
        where: { status: 'COMPLETED', completedAt: { gte: since } },
      }),
      this.prisma.trip.count({
        where: { status: 'CANCELLED', updatedAt: { gte: since } },
      }),
      this.prisma.trip.findMany({
        where: { startedAt: { not: null }, createdAt: { gte: since } },
        select: { createdAt: true, startedAt: true },
      }),
    ]);

    const revenueXof24h = Math.round(Number(revenueAgg._sum.amount ?? 0));
    const completionRate24h = safeRate(
      completedTrips24h,
      completedTrips24h + cancelledTrips24h,
    );
    const pickupMinutesSamples = pickupTrips24h.map(
      (trip) =>
        (trip.startedAt!.getTime() - trip.createdAt.getTime()) / 60000,
    );
    const avgPickupMinutes24h = pickupMinutesSamples.length
      ? Math.round(
          (pickupMinutesSamples.reduce((total, value) => total + value, 0) /
            pickupMinutesSamples.length) *
            10,
        ) / 10
      : null;

    return {
      users,
      riders,
      drivers,
      vehicles,
      openRequests,
      activeTrips,
      revenueXof24h,
      completionRate24h,
      avgPickupMinutes24h,
    };
  }

  async liveOps() {
    // Interrogé toutes les 30s + à chaque événement SSE (rafales possibles) :
    // un TTL court absorbe les rafales sans nuire à la fraîcheur perçue.
    return this.cache.getOrSet('admin:live-ops', () => this.fetchLiveOps(), 5);
  }

  private async fetchLiveOps() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cancellationLookbackMs = 2 * 60 * 60 * 1000;
    const recentCancellationSince = new Date(
      Date.now() - cancellationLookbackMs,
    );
    const dispatchLeaderboardSince = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    );
    const [
      activeTrips,
      urgentSupportTickets,
      openRequests,
      paymentAttempts,
      paymentWebhookEvents,
      recentlyCancelledTrips,
      dispatchAuditLogs,
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
          rideRequest: true,
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
      this.prisma.trip.findMany({
        where: {
          status: 'CANCELLED',
          updatedAt: {
            gte: recentCancellationSince,
          },
        },
        include: {
          rider: {
            include: { user: true },
          },
          driver: {
            include: { user: true },
          },
          events: {
            where: { eventType: 'TRIP_CANCELLED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 15,
      }),
      this.prisma.auditLog.findMany({
        where: {
          action: {
            in: [
              'DISPATCH_RESERVATION_ACCEPTED',
              'DISPATCH_RESERVATION_DECLINED',
              'DISPATCH_RESERVATION_EXPIRED',
            ],
          },
          createdAt: { gte: dispatchLeaderboardSince },
        },
        select: {
          userId: true,
          action: true,
          user: { select: { fullName: true } },
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
    const matchedSlaStalledMinutes = 10;
    const incidentTrips = activeTrips.filter((trip) =>
      trip.events.some((event) => event.eventType === 'INCIDENT_REPORTED'),
    ).length;
    const routeMonitoringAlertTrips = activeTrips.filter((trip) =>
      trip.events.some((event) => event.eventType === 'ROUTE_MONITORING_ALERT'),
    ).length;
    const stalledMatchedCutoff = new Date(
      Date.now() - matchedSlaStalledMinutes * 60 * 1000,
    );
    const stalledMatchedTrips = activeTrips.filter(
      (trip) =>
        trip.status === 'MATCHED' &&
        trip.createdAt < stalledMatchedCutoff &&
        !trip.events.some((event) => event.eventType === 'DRIVER_ARRIVING'),
    ).length;
    const activeTripsMissingDriverRoutePosition = activeTrips.filter(
      (trip) =>
        !trip.events.some((event) => {
          if (event.eventType !== 'ROUTE_POSITION_RECORDED') {
            return false;
          }

          const payload = isDispatchSettingsRecord(event.payload)
            ? event.payload
            : {};

          return payload.sourceRole !== 'RIDER';
        }),
    ).length;
    const succeededPayments = paymentAttempts.filter(
      (attempt) => attempt.status === 'SUCCEEDED',
    ).length;
    const failedPayments = paymentAttempts.filter(
      (attempt) => attempt.status === 'FAILED',
    ).length;
    const refundedPayments = paymentAttempts.filter(
      (attempt) => attempt.status === 'REFUNDED',
    ).length;
    const refundPendingPayments = paymentAttempts.filter(
      (attempt) => attempt.status === 'REFUND_PENDING',
    ).length;
    const reconciledPayments = paymentAttempts.filter(
      (attempt) => attempt.providerReference,
    ).length;
    const now = new Date();

    const driverDispatchStats = new Map<
      string,
      {
        fullName: string | null;
        accepted: number;
        declined: number;
        expired: number;
      }
    >();
    for (const log of dispatchAuditLogs) {
      const entry = driverDispatchStats.get(log.userId) ?? {
        fullName: log.user.fullName,
        accepted: 0,
        declined: 0,
        expired: 0,
      };
      if (log.action === 'DISPATCH_RESERVATION_ACCEPTED') {
        entry.accepted += 1;
      } else if (log.action === 'DISPATCH_RESERVATION_DECLINED') {
        entry.declined += 1;
      } else if (log.action === 'DISPATCH_RESERVATION_EXPIRED') {
        entry.expired += 1;
      }
      driverDispatchStats.set(log.userId, entry);
    }
    const driverAcceptanceLeaderboard = Array.from(
      driverDispatchStats.entries(),
    )
      .map(([driverId, stats]) => {
        const total = stats.accepted + stats.declined + stats.expired;
        return {
          driverId,
          driverName: stats.fullName ?? 'Inconnu',
          total,
          accepted: stats.accepted,
          declined: stats.declined,
          expired: stats.expired,
          acceptanceRate: safeRate(stats.accepted, total),
          declineRate: safeRate(stats.declined, total),
          expirationRate: safeRate(stats.expired, total),
        };
      })
      .sort((a, b) => b.acceptanceRate - a.acceptanceRate)
      .slice(0, 10);

    const lowConfidenceMinOffers = 5;
    const lowConfidenceThreshold = 50;
    const lowConfidenceDrivers = Array.from(driverDispatchStats.entries())
      .map(([driverId, stats]) => {
        const total = stats.accepted + stats.declined + stats.expired;
        return {
          driverId,
          driverName: stats.fullName ?? 'Inconnu',
          total,
          accepted: stats.accepted,
          declined: stats.declined,
          expired: stats.expired,
          acceptanceRate: safeRate(stats.accepted, total),
          expirationRate: safeRate(stats.expired, total),
        };
      })
      .filter(
        (d) =>
          d.total >= lowConfidenceMinOffers &&
          d.acceptanceRate < lowConfidenceThreshold,
      )
      .sort((a, b) => a.acceptanceRate - b.acceptanceRate)
      .slice(0, 10);

    const recentCancellations = recentlyCancelledTrips.map((trip) => {
      const cancelEvent = trip.events[0];
      const payload =
        cancelEvent && isDispatchSettingsRecord(cancelEvent.payload)
          ? cancelEvent.payload
          : {};
      return {
        id: trip.id,
        riderName: trip.rider.user.fullName,
        driverName: trip.driver.user.fullName,
        route: `${trip.pickupAddress} → ${trip.destinationAddress}`,
        cancelledBy:
          typeof payload.actorRole === 'string' ? payload.actorRole : null,
        cancellationReason:
          typeof payload.cancellationReason === 'string'
            ? payload.cancellationReason
            : null,
        cancelledAt: (cancelEvent?.createdAt ?? trip.updatedAt).toISOString(),
      };
    });

    return {
      summary: {
        activeTrips: activeTrips.length,
        openRequests,
        urgentSupportTickets,
        tripsByStatus,
        stalledMatchedTrips,
        payments: {
          lookbackHours: 24,
          attempts: paymentAttempts.length,
          succeeded: succeededPayments,
          failed: failedPayments,
          refundPending: refundPendingPayments,
          refunded: refundedPayments,
          reconciled: reconciledPayments,
          webhookEvents: paymentWebhookEvents.length,
          webhookConflicts: paymentWebhookEvents.filter(
            (event) =>
              event.action === 'ignored_conflicting_provider_reference',
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
        const routeAlertEvents = trip.events.filter(
          (event) => event.eventType === 'ROUTE_MONITORING_ALERT',
        );
        const latestRouteAlert = routeAlertEvents.at(-1);
        const latestRouteAlertPayload = isDispatchSettingsRecord(
          latestRouteAlert?.payload,
        )
          ? latestRouteAlert.payload
          : {};
        const latestRoutePosition = [...trip.events].reverse().find((event) => {
          if (event.eventType !== 'ROUTE_POSITION_RECORDED') {
            return false;
          }

          const payload = isDispatchSettingsRecord(event.payload)
            ? event.payload
            : {};

          return payload.sourceRole !== 'RIDER';
        });
        const latestPosition = resolveLiveOpsRoutePosition({
          event: latestRoutePosition,
          rideRequest: trip.rideRequest,
        });
        const routeMonitoring: {
          state: 'clear' | 'warning' | 'critical' | 'unknown';
          alertCount: number;
          lastAlertType: string | null;
          lastAlertAt: string | null;
          lastPositionAt: string | null;
          latestPosition: ReturnType<typeof resolveLiveOpsRoutePosition>;
        } = {
          state: latestRouteAlert
            ? latestRouteAlertPayload.severity === 'critical'
              ? 'critical'
              : 'warning'
            : latestRoutePosition
              ? 'clear'
              : 'unknown',
          alertCount: routeAlertEvents.length,
          lastAlertType:
            typeof latestRouteAlertPayload.alertType === 'string'
              ? latestRouteAlertPayload.alertType
              : null,
          lastAlertAt: latestRouteAlert?.createdAt.toISOString() ?? null,
          lastPositionAt: latestRoutePosition?.createdAt.toISOString() ?? null,
          latestPosition,
        };

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
          routeMonitoring,
          completionGate: resolveLiveOpsCompletionGate({
            status: trip.status,
            routeMonitoring,
            now,
          }),
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
        routeMonitoringAlertTrips > 0
          ? `${routeMonitoringAlertTrips} trajet(s) actif(s) ont une alerte route monitoring.`
          : activeTripsMissingDriverRoutePosition > 0
            ? `${activeTripsMissingDriverRoutePosition} trajet(s) actif(s) attendent le premier signal GPS chauffeur.`
            : 'Route monitoring clair sur les trajets actifs instrumentes.',
        stalledMatchedTrips > 0
          ? `${stalledMatchedTrips} trajet(s) MATCHED depuis plus de ${matchedSlaStalledMinutes} min sans signal DRIVER_ARRIVING — vérifier disponibilité chauffeur.`
          : 'Aucun trajet MATCHED en dépassement SLA.',
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
        refundPendingPayments > 0
          ? `${refundPendingPayments} remboursement(s) provider attendent confirmation.`
          : 'Aucun remboursement provider en attente sur 24h.',
      ],
      recentCancellations,
      driverAcceptanceLeaderboard,
      lowConfidenceDrivers,
    };
  }

  async operationalKpis() {
    // Interroge sur 7 jours glissants : ces indicateurs bougent lentement,
    // un TTL d'une minute absorbe le trafic du tableau de bord sans les rendre perimes.
    return this.cache.getOrSet(
      'admin:operational-kpis',
      () => this.fetchOperationalKpis(),
      60,
    );
  }

  private async fetchOperationalKpis() {
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalSessions7d,
      criticalCrashLogs7d,
      riderCohort30d,
      riderConverted30d,
      offerAccepted7d,
      offerDeclined7d,
      offerExpired7d,
      driverAvailabilityLogs7d,
      supportTickets7d,
      supportResponseLogs7d,
    ] = await Promise.all([
      this.prisma.userSession.count({ where: { createdAt: { gte: since7d } } }),
      this.prisma.auditLog.findMany({
        where: {
          action: 'MOBILE_CLIENT_ERROR_REPORTED',
          createdAt: { gte: since7d },
          metadata: { path: ['classification', 'severity'], equals: 'critical' },
        },
        select: { metadata: true },
      }),
      this.prisma.riderProfile.count({
        where: { createdAt: { gte: since30d } },
      }),
      this.prisma.riderProfile.count({
        where: {
          createdAt: { gte: since30d },
          trips: { some: { status: 'COMPLETED' } },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          action: 'DISPATCH_RESERVATION_ACCEPTED',
          createdAt: { gte: since7d },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          action: 'DISPATCH_RESERVATION_DECLINED',
          createdAt: { gte: since7d },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          action: 'DISPATCH_RESERVATION_EXPIRED',
          createdAt: { gte: since7d },
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          action: 'DRIVER_AVAILABILITY_UPDATED',
          createdAt: { gte: since7d },
        },
        select: { userId: true, metadata: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.supportTicket.findMany({
        where: { createdAt: { gte: since7d } },
        select: { id: true, createdAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          action: 'SUPPORT_TICKET_UPDATED',
          entityType: 'SUPPORT_TICKET',
          createdAt: { gte: since7d },
        },
        select: { entityId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const crashedSessionIds = new Set(
      criticalCrashLogs7d
        .map((log) =>
          isDispatchSettingsRecord(log.metadata)
            ? log.metadata.sessionId
            : null,
        )
        .filter((sessionId): sessionId is string => typeof sessionId === 'string'),
    );
    const crashFreeSessionRate7d = safeRate(
      Math.max(totalSessions7d - crashedSessionIds.size, 0),
      totalSessions7d,
    );

    const firstBookingConversionRate30d = safeRate(
      riderConverted30d,
      riderCohort30d,
    );

    const totalOffers7d = offerAccepted7d + offerDeclined7d + offerExpired7d;
    const offerAcceptanceRate7d = safeRate(offerAccepted7d, totalOffers7d);

    const onlineStintMinutes: number[] = [];
    const openStints = new Map<string, Date>();
    for (const log of driverAvailabilityLogs7d) {
      const status = isDispatchSettingsRecord(log.metadata)
        ? log.metadata.status
        : null;
      if (status === 'ONLINE' && !openStints.has(log.userId)) {
        openStints.set(log.userId, log.createdAt);
      } else if (status === 'OFFLINE' && openStints.has(log.userId)) {
        const startedAt = openStints.get(log.userId)!;
        onlineStintMinutes.push(
          (log.createdAt.getTime() - startedAt.getTime()) / 60000,
        );
        openStints.delete(log.userId);
      }
    }
    for (const startedAt of openStints.values()) {
      onlineStintMinutes.push((now.getTime() - startedAt.getTime()) / 60000);
    }
    const avgDriverOnlineMinutes7d = onlineStintMinutes.length
      ? Math.round(
          (onlineStintMinutes.reduce((total, value) => total + value, 0) /
            onlineStintMinutes.length) *
            10,
        ) / 10
      : null;

    const firstResponseByTicket = new Map<string, Date>();
    for (const log of supportResponseLogs7d) {
      if (!log.entityId || firstResponseByTicket.has(log.entityId)) {
        continue;
      }
      firstResponseByTicket.set(log.entityId, log.createdAt);
    }
    const supportResponseMinutes = supportTickets7d
      .map((ticket) => {
        const respondedAt = firstResponseByTicket.get(ticket.id);
        return respondedAt
          ? (respondedAt.getTime() - ticket.createdAt.getTime()) / 60000
          : null;
      })
      .filter((minutes): minutes is number => minutes !== null && minutes >= 0);
    const avgSupportFirstResponseMinutes7d = supportResponseMinutes.length
      ? Math.round(
          (supportResponseMinutes.reduce((total, value) => total + value, 0) /
            supportResponseMinutes.length) *
            10,
        ) / 10
      : null;

    return {
      windowDays: 7,
      crashFreeSessionRate7d,
      firstBookingConversionRate30d,
      offerAcceptanceRate7d,
      avgDriverOnlineMinutes7d,
      avgSupportFirstResponseMinutes7d,
    };
  }

  async tripsAudit(query: { lookbackHours?: number } = {}) {
    const lookbackHours = Math.min(Math.max(query.lookbackHours ?? 24, 1), 168);
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
    const now = new Date();

    const trips = await this.prisma.trip.findMany({
      where: {
        createdAt: {
          gte: since,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        rider: { include: { user: true } },
        driver: { include: { user: true } },
        vehicle: true,
        rideRequest: {
          include: {
            paymentAttempts: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        },
        events: {
          orderBy: { createdAt: 'asc' },
          take: 40,
        },
      },
    });

    const byStatus = {
      matched: trips.filter((trip) => trip.status === 'MATCHED').length,
      arriving: trips.filter((trip) => trip.status === 'DRIVER_ARRIVING')
        .length,
      inProgress: trips.filter((trip) => trip.status === 'IN_PROGRESS').length,
      completed: trips.filter((trip) => trip.status === 'COMPLETED').length,
      cancelled: trips.filter((trip) => trip.status === 'CANCELLED').length,
    };
    const completedTrips = trips.filter((trip) => trip.status === 'COMPLETED');
    const cancelledTrips = trips.filter((trip) => trip.status === 'CANCELLED');
    const mobileMoneyTrips = trips.filter(
      (trip) => trip.rideRequest.paymentMethod === 'MOBILE_MONEY',
    );
    const mobileMoneySucceededTrips = mobileMoneyTrips.filter((trip) =>
      trip.rideRequest.paymentAttempts.some(
        (attempt) => attempt.status === 'SUCCEEDED',
      ),
    );
    const refundPendingTrips = trips.filter((trip) =>
      trip.rideRequest.paymentAttempts.some(
        (attempt) => attempt.status === 'REFUND_PENDING',
      ),
    );

    const riskTrips = trips
      .map((trip) => {
        const latestDriverRoutePosition = [...trip.events]
          .reverse()
          .find((event) => {
            if (event.eventType !== 'ROUTE_POSITION_RECORDED') {
              return false;
            }

            const payload = isDispatchSettingsRecord(event.payload)
              ? event.payload
              : {};

            return payload.sourceRole !== 'RIDER';
          });
        const routeSignalAgeMinutes = latestDriverRoutePosition
          ? Math.round(
              (now.getTime() - latestDriverRoutePosition.createdAt.getTime()) /
                60_000,
            )
          : null;
        const paymentSucceeded = trip.rideRequest.paymentAttempts.some(
          (attempt) => attempt.status === 'SUCCEEDED',
        );
        const hasRefundPending = trip.rideRequest.paymentAttempts.some(
          (attempt) => attempt.status === 'REFUND_PENDING',
        );
        const fare = Number(
          trip.actualFare ?? trip.rideRequest.estimatedFare ?? 0,
        );
        const reasons: string[] = [];
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
        let owner: 'ops' | 'finance' | 'support' | 'engineering' = 'ops';

        if (
          trip.status === 'COMPLETED' &&
          trip.rideRequest.paymentMethod === 'MOBILE_MONEY' &&
          !paymentSucceeded
        ) {
          reasons.push('Course terminee sans paiement mobile money reussi.');
          severity = 'critical';
          owner = 'finance';
        }

        if (trip.status === 'COMPLETED' && fare <= 0) {
          reasons.push('Course terminee sans montant exploitable.');
          severity = severity === 'critical' ? severity : 'high';
          owner = 'finance';
        }

        if (hasRefundPending) {
          reasons.push('Remboursement provider encore en attente.');
          severity = severity === 'critical' ? severity : 'high';
          owner = 'finance';
        }

        if (trip.status === 'CANCELLED' && trip.startedAt) {
          reasons.push('Course annulee apres demarrage declare.');
          severity =
            severity === 'critical' || severity === 'high'
              ? severity
              : 'medium';
          owner = owner === 'finance' ? owner : 'support';
        }

        if (
          ['MATCHED', 'DRIVER_ARRIVING', 'IN_PROGRESS'].includes(trip.status) &&
          (!routeSignalAgeMinutes || routeSignalAgeMinutes > 10)
        ) {
          reasons.push('Signal GPS chauffeur absent ou trop ancien.');
          severity =
            severity === 'critical' || severity === 'high'
              ? severity
              : 'medium';
          owner = owner === 'finance' ? owner : 'ops';
        }

        return reasons.length
          ? {
              id: trip.id,
              status: trip.status,
              route: `${trip.pickupAddress} vers ${trip.destinationAddress}`,
              riderName: trip.rider.user.fullName,
              driverName: trip.driver.user.fullName,
              fare,
              currency: trip.currency,
              paymentMethod: trip.rideRequest.paymentMethod,
              paymentStatus:
                trip.rideRequest.paymentAttempts[0]?.status ?? 'NO_ATTEMPT',
              severity,
              owner,
              reasons,
              createdAt: trip.createdAt.toISOString(),
            }
          : null;
      })
      .filter((trip): trip is NonNullable<typeof trip> => trip !== null)
      .sort((a, b) => {
        const score = { critical: 4, high: 3, medium: 2, low: 1 };
        return score[b.severity] - score[a.severity];
      });

    const moneyAtRisk = riskTrips
      .filter((trip) => trip.owner === 'finance')
      .reduce((sum, trip) => sum + trip.fare, 0);

    return {
      window: {
        lookbackHours,
        since: since.toISOString(),
        generatedAt: now.toISOString(),
      },
      summary: {
        totalTrips: trips.length,
        completedTrips: completedTrips.length,
        cancelledTrips: cancelledTrips.length,
        completionRate: safeRate(completedTrips.length, trips.length),
        cancellationRate: safeRate(cancelledTrips.length, trips.length),
        mobileMoneyTrips: mobileMoneyTrips.length,
        mobileMoneyReconciledTrips: mobileMoneySucceededTrips.length,
        mobileMoneyReconciliationRate: safeRate(
          mobileMoneySucceededTrips.length,
          mobileMoneyTrips.length,
        ),
        refundPendingTrips: refundPendingTrips.length,
        riskTripCount: riskTrips.length,
        criticalRiskTripCount: riskTrips.filter(
          (trip) => trip.severity === 'critical',
        ).length,
        moneyAtRisk,
        currency: 'XOF',
        byStatus,
      },
      ownerQueue: ['finance', 'ops', 'support', 'engineering'].map((owner) => {
        const ownerTrips = riskTrips.filter((trip) => trip.owner === owner);
        return {
          owner,
          count: ownerTrips.length,
          critical: ownerTrips.filter((trip) => trip.severity === 'critical')
            .length,
          moneyAtRisk: ownerTrips.reduce((sum, trip) => sum + trip.fare, 0),
        };
      }),
      riskTrips: riskTrips.slice(0, 12),
      recommendations: [
        riskTrips.some((trip) => trip.owner === 'finance')
          ? 'Rapprocher les courses finance avec le journal paiements avant tout payout chauffeur.'
          : 'Aucun risque finance prioritaire dans la fenetre auditee.',
        refundPendingTrips.length > 0
          ? 'Verifier les remboursements en attente cote provider avant cloture de journee.'
          : 'Aucun remboursement provider en attente sur cette fenetre.',
        riskTrips.some((trip) => trip.owner === 'ops')
          ? 'Traiter les trajets actifs sans signal GPS avant extension du pilote.'
          : 'Le signal operationnel des trajets actifs est sous controle.',
      ],
    };
  }

  async launchReadiness() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      health,
      openSupportTickets,
      urgentSupportTickets,
      onboardingReviewQueue,
      pendingDocuments,
      refundPendingPayments,
      ignoredPaymentWebhooks,
      recoveryWallets,
    ] = await Promise.all([
      this.healthService.check(),
      this.prisma.supportTicket.count({
        where: {
          status: {
            in: ['OPEN', 'IN_REVIEW'],
          },
        },
      }),
      this.prisma.supportTicket.count({
        where: {
          status: {
            in: ['OPEN', 'IN_REVIEW'],
          },
          priority: {
            gte: 3,
          },
        },
      }),
      this.prisma.driverProfile.count({
        where: {
          verificationStatus: {
            in: ['PENDING', 'REJECTED'],
          },
        },
      }),
      this.prisma.driverDocument.count({
        where: {
          status: 'PENDING',
        },
      }),
      this.prisma.paymentAttempt.count({
        where: {
          status: 'REFUND_PENDING',
          createdAt: {
            gte: since,
          },
        },
      }),
      this.prisma.paymentWebhookEvent.count({
        where: {
          action: {
            startsWith: 'ignored_',
          },
          createdAt: {
            gte: since,
          },
        },
      }),
      this.prisma.wallet.count({
        where: {
          user: {
            role: 'DRIVER',
          },
          balance: {
            lt: 0,
          },
        },
      }),
    ]);
    const productionReadiness = health.operations.productionReadiness;
    const runtimeState =
      productionReadiness.riskLevel === 'high'
        ? 'fail'
        : productionReadiness.riskLevel === 'medium'
          ? 'warn'
          : 'pass';
    const realtimeState = health.infrastructure.realtime.degraded
      ? 'fail'
      : health.infrastructure.realtime.activeStreams > 0
        ? 'pass'
        : 'warn';
    const safetyBenchmark = resolveLaunchSafetyBenchmark();
    const serviceLevelObjectives = health.operations.serviceLevelObjectives;
    const fieldQuality = resolveLaunchFieldQuality({
      productionRiskLevel: productionReadiness.riskLevel,
      serviceLevelPosture: serviceLevelObjectives?.posture,
      realtimeDegraded: health.infrastructure.realtime.degraded,
      activeRealtimeStreams: health.infrastructure.realtime.activeStreams,
      openSupportTickets,
      urgentSupportTickets,
      onboardingReviewQueue,
      pendingDocuments,
      refundPendingPayments,
      ignoredPaymentWebhooks,
      recoveryWallets,
      safetyParityRate: safetyBenchmark.summary.competitorParityRate,
      criticalSafetyGaps: safetyBenchmark.summary.criticalGaps,
    });
    const securityAssurance = resolveLaunchSecurityAssurance({
      productionRiskLevel: productionReadiness.riskLevel,
      serviceLevelPosture: serviceLevelObjectives?.posture,
      realtimeDegraded: health.infrastructure.realtime.degraded,
      urgentSupportTickets,
      pendingDocuments,
      refundPendingPayments,
      ignoredPaymentWebhooks,
      recoveryWallets,
      safetyParityRate: safetyBenchmark.summary.competitorParityRate,
      criticalSafetyGaps: safetyBenchmark.summary.criticalGaps,
    });
    const checks: LaunchReadinessCheck[] = [
      {
        id: 'runtime-production-readiness',
        label: 'Runtime production',
        state: runtimeState,
        detail: `${productionReadiness.failedChecks} bloquant(s), ${productionReadiness.warningChecks} warning(s).`,
      },
      {
        id: 'support-load',
        label: 'Charge support',
        state: openSupportTickets <= 5 ? 'pass' : 'warn',
        detail: `${openSupportTickets} ticket(s) support ouverts ou en revue.`,
      },
      {
        id: 'urgent-support',
        label: 'Incidents urgents',
        state: urgentSupportTickets === 0 ? 'pass' : 'warn',
        detail: `${urgentSupportTickets} ticket(s) P3 encore actifs.`,
      },
      {
        id: 'driver-onboarding',
        label: 'Onboarding chauffeur',
        state: onboardingReviewQueue <= 3 ? 'pass' : 'warn',
        detail: `${onboardingReviewQueue} dossier(s) chauffeur a revoir.`,
      },
      {
        id: 'driver-documents',
        label: 'Documents chauffeur',
        state: pendingDocuments === 0 ? 'pass' : 'warn',
        detail: `${pendingDocuments} justificatif(s) en attente.`,
      },
      {
        id: 'payment-refunds',
        label: 'Refunds provider',
        state: refundPendingPayments === 0 ? 'pass' : 'warn',
        detail: `${refundPendingPayments} remboursement(s) provider en attente sur 24h.`,
      },
      {
        id: 'payment-webhooks',
        label: 'Webhooks argent',
        state: ignoredPaymentWebhooks === 0 ? 'pass' : 'warn',
        detail: `${ignoredPaymentWebhooks} webhook(s) ignore(s) sur 24h.`,
      },
      {
        id: 'driver-wallet-recovery',
        label: 'Recouvrement wallet',
        state: recoveryWallets === 0 ? 'pass' : 'warn',
        detail: `${recoveryWallets} wallet(s) chauffeur avec recouvrement du.`,
      },
      {
        id: 'admin-realtime',
        label: 'Temps reel admin',
        state: realtimeState,
        detail: health.infrastructure.realtime.degraded
          ? (health.infrastructure.realtime.degradeReason ??
            'Transport realtime degrade.')
          : `${health.infrastructure.realtime.activeStreams} flux actif(s), ${health.infrastructure.realtime.publishedEvents} evenement(s) publies.`,
      },
      {
        id: 'safety-benchmark',
        label: 'Benchmark securite',
        state:
          safetyBenchmark.summary.criticalGaps === 0 &&
          safetyBenchmark.summary.competitorParityRate >= 80
            ? 'pass'
            : 'warn',
        detail: `${safetyBenchmark.summary.activeCapabilities}/${safetyBenchmark.summary.totalCapabilities} capacite(s) actives, ${safetyBenchmark.summary.criticalGaps} gap(s) critiques face aux leaders.`,
      },
      {
        id: 'security-assurance',
        label: 'Assurance OWASP/NIST',
        state:
          securityAssurance.summary.criticalOpenGates === 0 &&
          securityAssurance.summary.coverageRate >= 85
            ? 'pass'
            : 'warn',
        detail: `${securityAssurance.summary.coveredGates}/${securityAssurance.summary.totalGates} gate(s) couverts, ${securityAssurance.summary.criticalOpenGates} critique(s) encore ouverts.`,
      },
    ];
    const failedChecks = checks.filter(
      (check) => check.state === 'fail',
    ).length;
    const warningChecks = checks.filter(
      (check) => check.state === 'warn',
    ).length;
    const nextActions = resolveLaunchReadinessNextActions(checks);
    const activeActionCheckIds = nextActions.map((action) => action.checkId);
    const acknowledgementLogs = activeActionCheckIds.length
      ? await this.prisma.auditLog.findMany({
          where: {
            action: 'LAUNCH_READINESS_ACTION_ACKNOWLEDGED',
            entityType: 'LAUNCH_READINESS_ACTION',
            entityId: {
              in: activeActionCheckIds,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                role: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 50,
        })
      : [];

    const acknowledgements =
      serializeLaunchReadinessAcknowledgements(acknowledgementLogs);

    return {
      generatedAt: new Date().toISOString(),
      environment: productionReadiness.environment,
      decision: resolveLaunchDecision(checks),
      summary: {
        failedChecks,
        warningChecks,
        passedChecks: checks.length - failedChecks - warningChecks,
        totalChecks: checks.length,
      },
      checks,
      nextActions,
      acknowledgements,
      actionSummary: summarizeLaunchReadinessActions(
        nextActions,
        acknowledgements,
      ),
      safetyBenchmark,
      securityAssurance,
      fieldQuality,
      productionReadiness,
    };
  }

  async acknowledgeLaunchReadinessAction(
    checkId: string,
    payload: LaunchReadinessActionAcknowledgementDto,
    auth: RequestAuthContext,
  ) {
    const readiness = await this.launchReadiness();
    const action = readiness.nextActions.find(
      (candidate) => candidate.checkId === checkId,
    );

    if (!action) {
      throw new BadRequestException(
        'Launch readiness action is not currently active.',
      );
    }

    if (action.owner !== payload.owner) {
      throw new BadRequestException(
        'Acknowledgement owner must match the active launch readiness action owner.',
      );
    }

    const notes = normalizeRequiredOpsNote(payload.notes);

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'LAUNCH_READINESS_ACTION_ACKNOWLEDGED',
        entityType: 'LAUNCH_READINESS_ACTION',
        entityId: checkId,
        metadata: {
          owner: action.owner,
          severity: action.severity,
          action: action.action,
          runbookAnchor: action.runbookAnchor,
          notes,
          idempotencyKey: payload.idempotencyKey?.trim() || null,
          decisionState: readiness.decision.state,
          environment: readiness.environment,
        },
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'system.launch-readiness-action-acknowledged',
      entityId: checkId,
      actorRole: auth.user.role,
      payload: {
        owner: action.owner,
        severity: action.severity,
        decisionState: readiness.decision.state,
      },
    });

    return {
      acknowledgement: {
        checkId,
        owner: action.owner,
        severity: action.severity,
        acknowledgedAt: new Date().toISOString(),
      },
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
    if (!query.action && query.kind) {
      where.action = {
        in: this.resolvePaymentWebhookKindActions(query.kind),
      };
    }
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
      })),
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
      summary: {
        paymentEvents: events.filter((event) =>
          event.action.startsWith('persisted_'),
        ).length,
        refundEvents: events.filter((event) =>
          event.action.startsWith('refund_'),
        ).length,
        ignoredEvents: events.filter((event) =>
          event.action.startsWith('ignored_'),
        ).length,
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

  private resolvePaymentWebhookKindActions(
    kind: NonNullable<PaymentWebhookEventsQueryDto['kind']>,
  ) {
    if (kind === 'refund') {
      return ['refund_processed', 'refund_still_pending'];
    }

    if (kind === 'ignored') {
      return [
        'ignored_amount_mismatch',
        'ignored_conflicting_provider_reference',
        'ignored_unknown_reference',
        'ignored_missing_reference',
      ];
    }

    return ['persisted_and_reconciled', 'persisted_idempotent_replay'];
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
    let supportTicket: {
      id: string;
      status: SupportTicketStatus;
      priority: number;
    } | null = null;

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

  async replayPaymentWebhookEvent(eventId: string, auth: RequestAuthContext) {
    const replay = await this.paymentsService.replayStoredWebhookEvent(eventId);

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'PAYMENT_WEBHOOK_REPLAYED',
        entityType: 'PAYMENT_WEBHOOK_EVENT',
        entityId: eventId,
        metadata: {
          result: {
            event: replay.result.event,
            transactionRef: replay.result.transactionRef,
            provider: replay.result.provider,
            providerReference: replay.result.providerReference ?? null,
            reconciledAttemptCount: replay.result.reconciledAttemptCount,
            nextAction: replay.result.nextAction,
          },
        } as Prisma.InputJsonValue,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'payment-webhook.replayed',
      entityId: eventId,
      actorRole: auth.user.role,
      payload: {
        nextAction: replay.result.nextAction,
        reconciledAttemptCount: replay.result.reconciledAttemptCount,
        providerReference: replay.result.providerReference ?? null,
      },
    });

    return {
      replay,
    };
  }

  async verifyPaymentAttemptWithProvider(
    paymentAttemptId: string,
    auth: RequestAuthContext,
  ) {
    const verification =
      await this.paymentsService.verifyPaymentAttemptWithProvider(
        paymentAttemptId,
      );

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'PAYMENT_ATTEMPT_PROVIDER_VERIFIED',
        entityType: 'PAYMENT_ATTEMPT',
        entityId: paymentAttemptId,
        metadata: {
          result: {
            provider: verification.provider,
            transactionRef: verification.transactionRef,
            event: verification.result.event,
            providerReference: verification.result.providerReference ?? null,
            reconciledAttemptCount: verification.result.reconciledAttemptCount,
            nextAction: verification.result.nextAction,
          },
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'payment-attempt.provider-verified',
      entityId: paymentAttemptId,
      actorRole: auth.user.role,
      payload: {
        provider: verification.provider,
        nextAction: verification.result.nextAction,
        reconciledAttemptCount: verification.result.reconciledAttemptCount,
        providerReference: verification.result.providerReference ?? null,
      },
    });

    return {
      verification,
    };
  }

  async refundPaymentAttempt(
    paymentAttemptId: string,
    payload: PaymentAttemptRefundDto,
    auth: RequestAuthContext,
  ) {
    const refund = await this.paymentsService.refundPaymentAttempt(
      paymentAttemptId,
      {
        actorUserId: auth.user.id,
        actorName: auth.user.fullName ?? null,
        reason: payload.reason?.trim() || null,
      },
    );

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action:
          refund.action === 'refund_pending'
            ? 'PAYMENT_ATTEMPT_REFUND_REQUESTED'
            : 'PAYMENT_ATTEMPT_REFUNDED',
        entityType: 'PAYMENT_ATTEMPT',
        entityId: paymentAttemptId,
        metadata: {
          action: refund.action,
          provider: refund.paymentAttempt.provider,
          transactionRef: refund.paymentAttempt.transactionRef,
          amount: refund.paymentAttempt.amount,
          currency: refund.paymentAttempt.currency,
          providerRefundReference: refund.providerRefundReference,
          walletReversal: refund.walletReversal,
          reason: payload.reason?.trim() || null,
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type:
        refund.action === 'refund_pending'
          ? 'payment-attempt.refund-requested'
          : 'payment-attempt.refunded',
      entityId: paymentAttemptId,
      actorRole: auth.user.role,
      payload: {
        action: refund.action,
        status: refund.paymentAttempt.status,
        amount: refund.paymentAttempt.amount,
        currency: refund.paymentAttempt.currency,
        provider: refund.paymentAttempt.provider,
        transactionRef: refund.paymentAttempt.transactionRef,
        providerRefundReference: refund.providerRefundReference,
      },
    });

    return {
      refund,
    };
  }

  async supportTickets(
    query: PageQueryDto = new PageQueryDto(),
  ): Promise<AdminSupportTicketQueueResponse> {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        skip,
        take,
        include: {
          user: {
            select: {
              fullName: true,
              role: true,
            },
          },
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
          subject: redactSupportText(ticket.subject),
          description: redactSupportText(ticket.description),
          status: ticket.status,
          priority: ticket.priority,
          adminNote: ticket.adminNote ?? null,
          requesterName: maskRequesterName(ticket.user.fullName),
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

  async driverOnboardingQueue(
    query: PageQueryDto = new PageQueryDto(),
    auth?: RequestAuthContext,
  ) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const minimizeIdentity = shouldMinimizeDriverOnboardingIdentity(auth);
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
        const documentsWithIntegrity = reviewableDocuments.map((document) => ({
          document,
          integrity: resolveDriverDocumentIntegrity(document.metadata),
        }));
        const integrityWarnings = documentsWithIntegrity.filter(
          ({ integrity }) => integrity.state !== 'complete',
        ).length;
        const averageIntegrityScore = documentsWithIntegrity.length
          ? Math.round(
              documentsWithIntegrity.reduce(
                (totalScore, { integrity }) => totalScore + integrity.score,
                0,
              ) / documentsWithIntegrity.length,
            )
          : 0;
        const missingRequiredTypes = requiredOnboardingDocumentTypes.filter(
          (type) => !latestDocumentsByType.has(type),
        );
        const decisionGuidance = resolveDriverOnboardingDecisionGuidance({
          approvedDocuments,
          pendingDocuments,
          rejectedDocuments,
          missingRequiredTypes: [...missingRequiredTypes],
          documentsWithIntegrity,
        });

        return {
          id: profile.id,
          driverName: minimizeIdentity
            ? maskRequesterName(profile.user.fullName)
            : profile.user.fullName,
          email: minimizeIdentity
            ? maskEmailAddress(profile.user.email)
            : profile.user.email,
          phoneNumber: minimizeIdentity
            ? maskPhoneNumber(profile.user.phoneNumber)
            : profile.user.phoneNumber,
          driverStatus: profile.status,
          verificationStatus: profile.verificationStatus,
          reviewStatus:
            latestReview?.status ?? DriverOnboardingReviewStatus.SUBMITTED,
          latestReviewAt: latestReview?.createdAt.toISOString() ?? null,
          latestReviewActor: latestReview?.actor.fullName
            ? minimizeIdentity
              ? maskRequesterName(latestReview.actor.fullName)
              : latestReview.actor.fullName
            : null,
          latestDecisionReason: latestReview?.decisionReason ?? null,
          serviceRadiusKm: Number(profile.serviceRadiusKm ?? 0),
          activeVehicleCount: profile.vehicles.length,
          documentSummary: {
            total: reviewableDocuments.length,
            approved: approvedDocuments,
            pending: pendingDocuments,
            rejected: rejectedDocuments,
            integrityWarnings,
            averageIntegrityScore,
            missingRequired: missingRequiredTypes.length,
          },
          decisionGuidance,
          reviewHistory: profile.onboardingReviews.map((review) => ({
            id: review.id,
            status: review.status,
            actorName: minimizeIdentity
              ? maskRequesterName(review.actor.fullName)
              : review.actor.fullName,
            decisionReason: review.decisionReason ?? null,
            createdAt: review.createdAt.toISOString(),
            decisionGuidance: resolveStoredDecisionGuidance(review.metadata),
            documentSummary: resolveStoredDocumentSummary(review.metadata),
          })),
          documents: documentsWithIntegrity.map(({ document, integrity }) => ({
            id: document.id,
            type: document.type,
            status: resolveEffectiveDocumentStatus(document),
            fileName: document.fileName,
            uploadedAt: document.uploadedAt.toISOString(),
            expiresAt: document.expiresAt?.toISOString() ?? null,
            rejectionReason: document.rejectionReason ?? null,
            integrity,
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

  async driverOnboardingExportCsv(
    query: DriverOnboardingExportQueryDto,
    auth: RequestAuthContext,
  ) {
    const guidanceFilter = query.guidanceFilter ?? 'all';
    const searchQuery = query.searchQuery?.trim() ?? '';
    const limit = query.limit ?? 100;
    const queue = await this.driverOnboardingQueue({
      page: 1,
      pageSize: limit,
    });
    const normalizedSearch = searchQuery.toLowerCase();
    const filteredDrivers = queue.drivers.filter((driver) => {
      if (
        guidanceFilter !== 'all' &&
        driver.decisionGuidance.level !== guidanceFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableText = [
        driver.driverName,
        driver.email,
        driver.phoneNumber ?? '',
        driver.verificationStatus,
        driver.reviewStatus,
        driver.decisionGuidance.level,
        driver.decisionGuidance.label,
        ...driver.decisionGuidance.blockers,
        ...driver.documents.flatMap((document) => [
          document.type,
          document.status,
          document.fileName,
          document.integrity.uploadSource ?? '',
        ]),
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
    const headers = [
      'driver_id',
      'driver_name',
      'email',
      'phone',
      'verification_status',
      'review_status',
      'guidance',
      'recommended_status',
      'approved_documents',
      'total_documents',
      'pending_documents',
      'rejected_documents',
      'missing_required',
      'integrity_warnings',
      'average_integrity_score',
      'active_vehicle_count',
      'service_radius_km',
      'blockers',
      'latest_decision_reason',
    ];
    const rows = filteredDrivers.map((driver) => [
      driver.id,
      driver.driverName,
      driver.email,
      driver.phoneNumber,
      driver.verificationStatus,
      driver.reviewStatus,
      driver.decisionGuidance.level,
      driver.decisionGuidance.recommendedStatus,
      driver.documentSummary.approved,
      driver.documentSummary.total,
      driver.documentSummary.pending,
      driver.documentSummary.rejected,
      driver.documentSummary.missingRequired,
      driver.documentSummary.integrityWarnings,
      driver.documentSummary.averageIntegrityScore,
      driver.activeVehicleCount,
      driver.serviceRadiusKm,
      driver.decisionGuidance.blockers.join(' | '),
      driver.latestDecisionReason,
    ]);

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_ONBOARDING_QUEUE_EXPORTED',
        entityType: 'DRIVER_PROFILE',
        entityId: guidanceFilter,
        metadata: {
          format: 'csv',
          guidanceFilter,
          searchQuery: searchQuery || null,
          exportedCount: filteredDrivers.length,
          scannedCount: queue.drivers.length,
          limit,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return [
      headers.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n');
  }

  async driverOnboardingExportHistory(
    query: PageQueryDto = new PageQueryDto(),
  ) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const where: Prisma.AuditLogWhereInput = {
      action: 'DRIVER_ONBOARDING_QUEUE_EXPORTED',
      entityType: 'DRIVER_PROFILE',
    };
    const [exports, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        skip,
        take,
        where,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      exports: exports.map((entry) => {
        const metadata = isJsonRecord(entry.metadata) ? entry.metadata : {};

        return {
          id: entry.id,
          createdAt: entry.createdAt.toISOString(),
          actor: {
            id: entry.user.id,
            name: entry.user.fullName,
            role: entry.user.role,
          },
          guidanceFilter: normalizeOnboardingExportGuidanceFilter(
            metadata.guidanceFilter ?? entry.entityId ?? undefined,
          ),
          searchQuery: nullableString(metadata.searchQuery),
          exportedCount:
            nullableNonNegativeInteger(metadata.exportedCount) ?? 0,
          scannedCount: nullableNonNegativeInteger(metadata.scannedCount) ?? 0,
          limit: nullablePositiveInteger(metadata.limit) ?? null,
          format: metadata.format === 'csv' ? 'csv' : 'unknown',
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

  async driverWallets(query: PageQueryDto = new PageQueryDto()) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const where: Prisma.WalletWhereInput = {
      user: {
        role: 'DRIVER',
      },
    };
    const [wallets, total, balanceAggregate, walletTransactions] =
      await Promise.all([
        this.prisma.wallet.findMany({
          skip,
          take,
          where,
          include: {
            user: {
              include: {
                driverProfile: true,
              },
            },
            transactions: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 5,
            },
            driverPayouts: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 5,
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
        }),
        this.prisma.wallet.count({
          where,
        }),
        this.prisma.wallet.aggregate({
          where,
          _sum: {
            balance: true,
          },
        }),
        this.prisma.walletTransaction.findMany({
          where: {
            wallet: where,
          },
          select: {
            walletId: true,
            type: true,
            amount: true,
            metadata: true,
          },
        }),
      ]);

    const transactionTotalsByWalletId = new Map<
      string,
      { payoutTotal: number; commissionTotal: number }
    >();
    let totalPayouts = 0;
    let totalCommission = 0;

    for (const transaction of walletTransactions) {
      const metadata =
        transaction.metadata &&
        !Array.isArray(transaction.metadata) &&
        typeof transaction.metadata === 'object'
          ? (transaction.metadata as Record<string, unknown>)
          : {};
      const commissionAmount = Number(metadata.commissionAmount ?? 0);
      const payoutAmount =
        transaction.type === WalletTransactionType.CREDIT
          ? Number(transaction.amount)
          : 0;
      const safeCommissionAmount = Number.isFinite(commissionAmount)
        ? commissionAmount
        : 0;
      const current = transactionTotalsByWalletId.get(transaction.walletId) ?? {
        payoutTotal: 0,
        commissionTotal: 0,
      };

      current.payoutTotal += payoutAmount;
      current.commissionTotal += safeCommissionAmount;
      transactionTotalsByWalletId.set(transaction.walletId, current);
      totalPayouts += payoutAmount;
      totalCommission += safeCommissionAmount;
    }

    let recoveryWalletCount = 0;
    let totalRecoveryDue = 0;
    const walletSummaries = wallets.map((wallet) => {
      const driverPayouts = wallet.driverPayouts ?? [];
      const totals = transactionTotalsByWalletId.get(wallet.id) ?? {
        payoutTotal: 0,
        commissionTotal: 0,
      };
      const balance = Number(wallet.balance);
      const recoveryDue = balance < 0 ? Math.abs(balance) : 0;

      if (recoveryDue > 0) {
        recoveryWalletCount += 1;
        totalRecoveryDue += recoveryDue;
      }

      const preparedPayout =
        driverPayouts.find(
          (payout) => payout.status === DriverPayoutStatus.PREPARED,
        ) ?? null;

      return {
        id: wallet.id,
        driverUserId: wallet.userId,
        driverName: wallet.user.fullName,
        driverStatus: wallet.user.driverProfile?.status ?? null,
        verificationStatus:
          wallet.user.driverProfile?.verificationStatus ?? null,
        currency: wallet.currency,
        balance,
        recoveryDue,
        isLocked: wallet.isLocked,
        payoutTotal: totals.payoutTotal,
        commissionTotal: totals.commissionTotal,
        lastActivityAt:
          wallet.transactions[0]?.createdAt.toISOString() ??
          wallet.updatedAt.toISOString(),
        preparedPayout: preparedPayout
          ? {
              id: preparedPayout.id,
              amount: Number(preparedPayout.amount),
              currency: preparedPayout.currency,
              status: preparedPayout.status,
              reference: preparedPayout.reference,
              notes: preparedPayout.notes ?? null,
              preparedAt: preparedPayout.preparedAt.toISOString(),
            }
          : null,
        recentPayouts: driverPayouts.map((payout) => ({
          id: payout.id,
          amount: Number(payout.amount),
          currency: payout.currency,
          status: payout.status,
          reference: payout.reference,
          notes: payout.notes ?? null,
          preparedAt: payout.preparedAt.toISOString(),
          paidAt: payout.paidAt?.toISOString() ?? null,
        })),
        recentTransactions: wallet.transactions.map((transaction) => {
          const metadata =
            transaction.metadata &&
            !Array.isArray(transaction.metadata) &&
            typeof transaction.metadata === 'object'
              ? (transaction.metadata as Record<string, unknown>)
              : {};

          return {
            id: transaction.id,
            type: transaction.type,
            amount: Number(transaction.amount),
            reference: transaction.reference,
            description: transaction.description,
            createdAt: transaction.createdAt.toISOString(),
            paymentAttemptId:
              typeof metadata.paymentAttemptId === 'string'
                ? metadata.paymentAttemptId
                : null,
            provider:
              typeof metadata.provider === 'string' ? metadata.provider : null,
            commissionAmount: Number(metadata.commissionAmount ?? 0),
          };
        }),
      };
    });

    return {
      summary: {
        walletCount: total,
        totalBalance: Number(balanceAggregate._sum.balance ?? 0),
        totalPayouts,
        totalCommission,
        recoveryWalletCount,
        totalRecoveryDue,
      },
      wallets: walletSummaries,
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }

  async prepareDriverWalletPayout(
    walletId: string,
    payload: DriverPayoutApprovalDto,
    auth: RequestAuthContext,
  ) {
    const notes = normalizePayoutNote(payload);
    const wallet = await this.prisma.wallet.findUnique({
      where: {
        id: walletId,
      },
      include: {
        user: {
          include: {
            driverProfile: true,
          },
        },
        driverPayouts: {
          where: {
            status: DriverPayoutStatus.PREPARED,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!wallet || wallet.user.role !== 'DRIVER') {
      throw new NotFoundException('Driver wallet not found.');
    }

    if (wallet.isLocked) {
      throw new BadRequestException('Driver wallet is locked.');
    }

    const balance = Number(wallet.balance);
    if (!Number.isFinite(balance) || balance <= 0) {
      throw new BadRequestException('Driver wallet has no payable balance.');
    }

    const existingPreparedPayout = wallet.driverPayouts[0] ?? null;
    if (existingPreparedPayout) {
      await this.prisma.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'DRIVER_PAYOUT_PREPARE_REUSED',
          entityType: 'DRIVER_PAYOUT',
          entityId: existingPreparedPayout.id,
          metadata: {
            walletId: wallet.id,
            driverUserId: wallet.userId,
            amount: Number(existingPreparedPayout.amount),
            currency: existingPreparedPayout.currency,
            reference: existingPreparedPayout.reference,
            result: 'existing_prepared_payout',
            notes,
          } satisfies Prisma.InputJsonObject,
        },
      });

      return {
        payout: this.serializeDriverPayout(existingPreparedPayout),
        action: 'existing_prepared_payout',
      };
    }

    let payout: DriverPayout;
    try {
      payout = await this.prisma.driverPayout.create({
        data: {
          walletId: wallet.id,
          amount: wallet.balance,
          currency: wallet.currency,
          reference: `driver-payout:${wallet.id}:${Date.now()}`,
          preparedLockKey: wallet.id,
          notes,
          preparedByUserId: auth.user.id,
          metadata: {
            driverUserId: wallet.userId,
            driverName: wallet.user.fullName,
            driverStatus: wallet.user.driverProfile?.status ?? null,
            sourceBalance: balance,
            approval: {
              preparedByUserId: auth.user.id,
              preparedByName: auth.user.fullName,
              notes,
            },
          } satisfies Prisma.InputJsonObject,
        },
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) {
        throw error;
      }

      const concurrentPayout = await this.prisma.driverPayout.findFirst({
        where: {
          walletId: wallet.id,
          status: DriverPayoutStatus.PREPARED,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!concurrentPayout) {
        throw error;
      }

      await this.prisma.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'DRIVER_PAYOUT_PREPARE_REUSED',
          entityType: 'DRIVER_PAYOUT',
          entityId: concurrentPayout.id,
          metadata: {
            walletId: wallet.id,
            driverUserId: wallet.userId,
            amount: Number(concurrentPayout.amount),
            currency: concurrentPayout.currency,
            reference: concurrentPayout.reference,
            result: 'existing_prepared_payout',
            notes,
          } satisfies Prisma.InputJsonObject,
        },
      });

      return {
        payout: this.serializeDriverPayout(concurrentPayout),
        action: 'existing_prepared_payout',
      };
    }

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_PAYOUT_PREPARED',
        entityType: 'DRIVER_PAYOUT',
        entityId: payout.id,
        metadata: {
          walletId: wallet.id,
          driverUserId: wallet.userId,
          amount: Number(payout.amount),
          currency: payout.currency,
          reference: payout.reference,
          notes,
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'driver-wallet.payout-prepared',
      entityId: payout.id,
      actorRole: auth.user.role,
      payload: {
        walletId: wallet.id,
        driverUserId: wallet.userId,
        amount: Number(payout.amount),
        currency: payout.currency,
        reference: payout.reference,
        notes,
      },
    });

    return {
      payout: this.serializeDriverPayout(payout),
      action: 'prepared',
    };
  }

  async recordDriverWalletRecoveryAdjustment(
    walletId: string,
    payload: DriverWalletRecoveryAdjustmentDto,
    auth: RequestAuthContext,
  ) {
    const notes = normalizeRequiredOpsNote(payload.notes);
    const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey);
    const amount = Number(payload.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Recovery adjustment amount must be positive.',
      );
    }

    const reference = `driver-wallet-recovery:${walletId}:${idempotencyKey}`;
    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: {
          id: walletId,
        },
        include: {
          user: true,
        },
      });

      if (!wallet || wallet.user.role !== UserRole.DRIVER) {
        throw new NotFoundException('Driver wallet not found.');
      }

      if (wallet.isLocked) {
        throw new BadRequestException('Driver wallet is locked.');
      }

      const currentBalance = Number(wallet.balance);
      if (currentBalance >= 0) {
        throw new BadRequestException('Driver wallet has no recovery due.');
      }

      const recoveryDue = Math.abs(currentBalance);
      const appliedAmount = Math.min(amount, recoveryDue);
      const existingTransaction = await tx.walletTransaction.findUnique({
        where: {
          walletId_reference: {
            walletId,
            reference,
          },
        },
      });

      if (existingTransaction) {
        return {
          action: 'already_recorded' as const,
          wallet,
          transaction: existingTransaction,
          appliedAmount: Number(existingTransaction.amount),
        };
      }

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId,
          type: WalletTransactionType.ADJUSTMENT,
          amount: new Prisma.Decimal(appliedAmount),
          reference,
          description: `Recouvrement wallet chauffeur ${wallet.user.fullName}`,
          metadata: {
            recovery: true,
            recoveryDueBefore: recoveryDue,
            requestedAmount: amount,
            appliedAmount,
            recordedByUserId: auth.user.id,
            recordedByName: auth.user.fullName,
            notes,
            idempotencyKey,
          } satisfies Prisma.InputJsonObject,
        },
      });

      const updatedWallet = await tx.wallet.update({
        where: {
          id: walletId,
        },
        data: {
          balance: {
            increment: new Prisma.Decimal(appliedAmount),
          },
        },
        include: {
          user: true,
        },
      });

      return {
        action: 'recorded' as const,
        wallet: updatedWallet,
        transaction,
        appliedAmount,
      };
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_WALLET_RECOVERY_ADJUSTMENT_RECORDED',
        entityType: 'WALLET',
        entityId: walletId,
        metadata: {
          action: result.action,
          amount: result.appliedAmount,
          currency: result.wallet.currency,
          reference,
          notes,
          idempotencyKey,
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'driver-wallet.recovery-adjusted',
      entityId: walletId,
      actorRole: auth.user.role,
      payload: {
        action: result.action,
        amount: result.appliedAmount,
        currency: result.wallet.currency,
        reference,
      },
    });

    const balance = Number(result.wallet.balance);

    return {
      action: result.action,
      wallet: {
        id: result.wallet.id,
        balance,
        currency: result.wallet.currency,
        recoveryDue: balance < 0 ? Math.abs(balance) : 0,
      },
      transaction: {
        id: result.transaction.id,
        type: result.transaction.type,
        amount: Number(result.transaction.amount),
        reference: result.transaction.reference,
        description: result.transaction.description,
        createdAt: result.transaction.createdAt.toISOString(),
      },
    };
  }

  async markDriverPayoutPaid(
    payoutId: string,
    payload: DriverPayoutApprovalDto,
    auth: RequestAuthContext,
  ) {
    const paidAt = new Date();
    const notes = normalizePayoutNote(payload);
    const result = await this.prisma.$transaction(async (tx) => {
      const payout = await tx.driverPayout.findUnique({
        where: {
          id: payoutId,
        },
        include: {
          wallet: true,
        },
      });

      if (!payout) {
        throw new NotFoundException('Driver payout not found.');
      }

      if (payout.status !== DriverPayoutStatus.PREPARED) {
        return {
          payout,
          action: 'already_finalized' as const,
        };
      }

      if (payout.wallet.isLocked) {
        throw new BadRequestException('Driver wallet is locked.');
      }

      const payoutAmount = Number(payout.amount);
      const walletBalance = Number(payout.wallet.balance);
      if (walletBalance < payoutAmount) {
        throw new BadRequestException('Driver wallet balance is insufficient.');
      }

      const transactionReference = `driver-payout:${payout.id}:paid`;
      const existingTransaction = await tx.walletTransaction.findUnique({
        where: {
          walletId_reference: {
            walletId: payout.walletId,
            reference: transactionReference,
          },
        },
      });
      let createdTransaction = false;

      if (!existingTransaction) {
        try {
          await tx.walletTransaction.create({
            data: {
              walletId: payout.walletId,
              type: WalletTransactionType.PAYOUT,
              amount: payout.amount,
              reference: transactionReference,
              description: `Payout chauffeur paye ${payout.reference}`,
              metadata: {
                driverPayoutId: payout.id,
                preparedReference: payout.reference,
                paidByUserId: auth.user.id,
                paidByName: auth.user.fullName,
                notes,
              } satisfies Prisma.InputJsonObject,
            },
          });
          createdTransaction = true;
        } catch (error) {
          if (!isPrismaUniqueConstraintError(error)) {
            throw error;
          }
        }
      }

      if (createdTransaction) {
        await tx.wallet.update({
          where: {
            id: payout.walletId,
          },
          data: {
            balance: {
              decrement: payout.amount,
            },
          },
        });
      }

      const updatedPayout = await tx.driverPayout.update({
        where: {
          id: payout.id,
        },
        data: {
          status: DriverPayoutStatus.PAID,
          paidByUserId: auth.user.id,
          paidAt,
          preparedLockKey: null,
          notes: notes ?? payout.notes,
        },
      });

      return {
        payout: updatedPayout,
        action:
          existingTransaction || !createdTransaction ? 'already_paid' : 'paid',
      };
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_PAYOUT_PAID',
        entityType: 'DRIVER_PAYOUT',
        entityId: payoutId,
        metadata: {
          walletId: result.payout.walletId,
          amount: Number(result.payout.amount),
          currency: result.payout.currency,
          reference: result.payout.reference,
          result: result.action,
          notes,
        } satisfies Prisma.InputJsonObject,
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'driver-wallet.payout-paid',
      entityId: payoutId,
      actorRole: auth.user.role,
      payload: {
        walletId: result.payout.walletId,
        amount: Number(result.payout.amount),
        currency: result.payout.currency,
        reference: result.payout.reference,
        result: result.action,
        notes,
      },
    });

    return {
      payout: this.serializeDriverPayout(result.payout),
      action: result.action,
    };
  }

  async driverPayoutSettlementCsv(
    query: DriverPayoutSettlementQueryDto,
    auth: RequestAuthContext,
  ) {
    const settlement = await this.buildDriverPayoutSettlement(
      query,
      auth,
      'csv',
    );
    const headers = [
      'payout_id',
      'wallet_id',
      'driver_user_id',
      'driver_name',
      'amount',
      'currency',
      'status',
      'reference',
      'prepared_at',
      'prepared_by',
      'paid_at',
      'paid_by',
      'approval_notes',
      'approval_signature',
    ];
    const rows = settlement.payouts.map((payout) => [
      payout.id,
      payout.walletId,
      payout.wallet.userId,
      payout.wallet.user.fullName,
      Number(payout.amount),
      payout.currency,
      payout.status,
      payout.reference,
      payout.preparedAt.toISOString(),
      payout.preparedBy.fullName,
      payout.paidAt?.toISOString() ?? '',
      payout.paidBy?.fullName ?? '',
      payout.notes ?? '',
      this.driverPayoutApprovalSignature(payout),
    ]);

    return [
      headers.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n');
  }

  async driverPayoutSettlementPdf(
    query: DriverPayoutSettlementQueryDto,
    auth: RequestAuthContext,
  ) {
    const settlement = await this.buildDriverPayoutSettlement(
      query,
      auth,
      'pdf',
    );
    const lines = [
      'Orbi - Settlement payouts chauffeurs',
      `Genere le: ${settlement.generatedAt.toISOString()}`,
      `Statut: ${settlement.status}`,
      `Exporte par: ${auth.user.fullName} (${auth.user.role})`,
      `Payouts: ${settlement.payouts.length}`,
      `Montant total: ${settlement.totalAmount} XOF`,
      '',
      'ID | Chauffeur | Montant | Statut | Reference | Signature',
      ...settlement.payouts
        .slice(0, 40)
        .map((payout) =>
          [
            payout.id,
            payout.wallet.user.fullName,
            `${Number(payout.amount)} ${payout.currency}`,
            payout.status,
            payout.reference,
            this.driverPayoutApprovalSignature(payout),
          ].join(' | '),
        ),
    ];

    return buildSimplePdf(lines);
  }

  private async buildDriverPayoutSettlement(
    query: DriverPayoutSettlementQueryDto,
    auth: RequestAuthContext,
    format: 'csv' | 'pdf',
  ) {
    const status = query.status ?? DriverPayoutStatus.PREPARED;
    const payouts = await this.prisma.driverPayout.findMany({
      where: {
        status,
      },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
        preparedBy: true,
        paidBy: true,
      },
      orderBy: {
        preparedAt: 'asc',
      },
      take: 200,
    });
    const totalAmount = payouts.reduce(
      (total, payout) => total + Number(payout.amount),
      0,
    );

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_PAYOUT_SETTLEMENT_EXPORTED',
        entityType: 'DRIVER_PAYOUT',
        entityId: status,
        metadata: {
          format,
          status,
          payoutCount: payouts.length,
          totalAmount,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return {
      generatedAt: new Date(),
      status,
      totalAmount,
      payouts,
    };
  }

  private driverPayoutApprovalSignature(payout: {
    preparedByUserId: string;
    paidByUserId: string | null;
    preparedBy: { fullName: string };
    paidBy: { fullName: string } | null;
  }) {
    const prepared = `prepared:${payout.preparedBy.fullName}:${payout.preparedByUserId}`;
    const paid = payout.paidBy
      ? `paid:${payout.paidBy.fullName}:${payout.paidByUserId}`
      : 'paid:pending';

    return `${prepared}; ${paid}`;
  }

  private serializeDriverPayout(payout: {
    id: string;
    walletId: string;
    amount: Prisma.Decimal | number;
    currency: string;
    status: DriverPayoutStatus;
    reference: string;
    notes?: string | null;
    preparedAt: Date;
    paidAt: Date | null;
  }) {
    return {
      id: payout.id,
      walletId: payout.walletId,
      amount: Number(payout.amount),
      currency: payout.currency,
      status: payout.status,
      reference: payout.reference,
      notes: payout.notes ?? null,
      preparedAt: payout.preparedAt.toISOString(),
      paidAt: payout.paidAt?.toISOString() ?? null,
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
      adminNote?: string;
    },
    auth: RequestAuthContext,
  ): Promise<AdminSupportTicketUpdateResponse> {
    const existing = await this.prisma.supportTicket.findUnique({
      where: {
        id: ticketId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Support ticket not found.');
    }

    const trimmedNote = payload.adminNote?.trim() ?? undefined;

    const updated = await this.prisma.supportTicket.update({
      where: {
        id: ticketId,
      },
      data: {
        status: payload.status ?? existing.status,
        priority: payload.priority ?? existing.priority,
        ...(trimmedNote !== undefined
          ? { adminNote: trimmedNote || null }
          : {}),
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
          hasAdminNote: updated.adminNote !== null,
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

    const shouldNotifyUser =
      trimmedNote !== undefined ||
      payload.status === 'RESOLVED' ||
      payload.status === 'CLOSED';

    if (shouldNotifyUser) {
      const notifTitle =
        updated.status === 'RESOLVED' || updated.status === 'CLOSED'
          ? 'Ticket support résolu'
          : 'Réponse du support';
      const notifBody = trimmedNote
        ? `L'équipe support a répondu à votre demande "${updated.subject.slice(0, 40)}".`
        : `Votre ticket "${updated.subject.slice(0, 40)}" a été mis à jour.`;

      void this.notificationsService.enqueue({
        userId: existing.userId,
        title: notifTitle,
        body: notifBody,
        channel: NotificationChannel.PUSH,
        dedupeKey: `support-ticket-update:${updated.id}:${updated.updatedAt.getTime()}`,
        data: {
          type: 'support_ticket_updated',
          ticketId: updated.id,
          status: updated.status,
        },
      });
    }

    return {
      ticket: {
        id: updated.id,
        status: updated.status,
        priority: updated.priority,
        adminNote: updated.adminNote,
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

    const decisionSnapshot = resolveDriverOnboardingDecisionSnapshot({
      onboardingDocuments: profile.onboardingDocuments,
      documentDecisions: payload.documentDecisions,
    });

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
          decisionGuidance: decisionSnapshot.guidance,
          documentSummary: decisionSnapshot.summary,
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
          decisionGuidance: decisionSnapshot.guidance,
          documentSummary: decisionSnapshot.summary,
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
        metadata?: Prisma.JsonValue | null;
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
        metadata?: Prisma.JsonValue | null;
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

      const integrity = resolveDriverDocumentIntegrity(document.metadata);

      if (integrity.state !== 'complete') {
        throw new BadRequestException(
          `Document ${type} must have confirmed object integrity before driver approval.`,
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

  async updateDriverDocumentObjectVerification(
    driverId: string,
    documentId: string,
    payload: UpdateDriverDocumentObjectVerificationDto,
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

    if (
      payload.state === 'confirmed' &&
      (!payload.sizeBytes || !payload.sha256)
    ) {
      throw new BadRequestException(
        'Confirmed driver document object verification requires provider size and SHA-256.',
      );
    }

    if (payload.state === 'failed' && !payload.failureReason?.trim()) {
      throw new BadRequestException(
        'Failed driver document object verification requires a failure reason.',
      );
    }

    const previousMetadata =
      document.metadata && isJsonRecord(document.metadata)
        ? document.metadata
        : {};
    const objectVerification = {
      state: payload.state,
      provider: payload.provider.trim().toLowerCase(),
      objectId: payload.objectId?.trim() || null,
      verifiedAt: new Date().toISOString(),
      sizeBytes: payload.sizeBytes ?? null,
      sha256: payload.sha256?.trim().toLowerCase() ?? null,
      failureReason: payload.failureReason?.trim() || null,
      actor: {
        id: auth.user.id,
        role: auth.user.role,
      },
    };

    return this.persistDriverDocumentObjectVerification(
      document,
      driverId,
      previousMetadata,
      objectVerification,
      auth,
    );
  }

  async verifyDriverDocumentObjectFromProvider(
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

    const previousMetadata =
      document.metadata && isJsonRecord(document.metadata)
        ? document.metadata
        : {};
    const previousIntegrity = previousMetadata.integrity;
    const integrity = isJsonRecord(previousIntegrity) ? previousIntegrity : {};
    const providerVerification =
      await this.documentObjectStorageService.verifyStoredDocument({
        storageKey: document.storageKey,
        expectedSizeBytes: nullablePositiveInteger(integrity.sizeBytes),
        expectedSha256: nullableString(integrity.sha256),
      });

    const objectVerification = {
      ...providerVerification,
      actor: {
        id: auth.user.id,
        role: auth.user.role,
      },
    };

    return this.persistDriverDocumentObjectVerification(
      document,
      driverId,
      previousMetadata,
      objectVerification,
      auth,
    );
  }

  private async persistDriverDocumentObjectVerification(
    document: {
      id: string;
      type: string;
      fileName?: string | null;
      storageKey: string;
    },
    driverId: string,
    previousMetadata: Record<string, unknown>,
    objectVerification: StoredDocumentObjectVerification & {
      actor: {
        id: string;
        role: string;
      };
    },
    auth: RequestAuthContext,
  ) {
    const safetyScan = this.resolveDriverDocumentSafetyScan(
      document,
      previousMetadata,
      objectVerification,
    );
    const updated = await this.prisma.driverDocument.update({
      where: {
        id: document.id,
      },
      data: {
        metadata: {
          ...previousMetadata,
          objectVerification,
          safetyScan,
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_DOCUMENT_OBJECT_VERIFICATION_UPDATED',
        entityType: 'DRIVER_DOCUMENT',
        entityId: document.id,
        metadata: {
          driverProfileId: driverId,
          documentType: document.type,
          storageKey: document.storageKey,
          objectVerification,
          safetyScan,
        } as Prisma.InputJsonValue,
      },
    });

    await this.jobQueueService.enqueue({
      kind: 'DRIVER_DOCUMENT',
      dedupeKey: `driver-document:${document.id}:object-verification`,
      entityType: 'driver_document',
      entityId: document.id,
      payload: {
        driverProfileId: driverId,
        documentId: document.id,
        documentType: document.type,
        storageKey: document.storageKey,
        objectVerificationState: objectVerification.state,
        safetyScanState: safetyScan.state,
      },
    });

    return {
      document: {
        id: updated.id,
        driverId,
        type: updated.type,
        objectVerification,
        safetyScan,
      },
    };
  }

  private resolveDriverDocumentSafetyScan(
    document: {
      type: string;
      fileName?: string | null;
      storageKey: string;
    },
    previousMetadata: Record<string, unknown>,
    objectVerification: StoredDocumentObjectVerification,
  ) {
    const scannedAt = new Date().toISOString();

    if (objectVerification.state !== 'confirmed') {
      return {
        state: 'quarantined',
        engine: 'local-policy',
        scannedAt,
        findings: ['object-verification-failed'],
        quarantineReason:
          objectVerification.failureReason ??
          'Provider object verification failed.',
      };
    }

    const policy = documentSafetyPolicies[document.type];
    const extension = this.resolveDocumentExtension(
      document.storageKey || document.fileName || '',
    );
    const previousIntegrity = previousMetadata.integrity as
      | Prisma.JsonValue
      | undefined;
    const integrity = isJsonRecord(previousIntegrity) ? previousIntegrity : {};
    const capturedSha256 = nullableString(integrity.sha256);
    const capturedSizeBytes = nullablePositiveInteger(integrity.sizeBytes);
    const findings = [
      !policy ? 'unsupported-document-type' : null,
      !extension || !policy?.allowedExtensions.includes(extension)
        ? 'unsupported-file-extension'
        : null,
      policy &&
      objectVerification.sizeBytes &&
      objectVerification.sizeBytes > policy.maxBytes
        ? 'object-size-exceeds-policy'
        : null,
      capturedSizeBytes && objectVerification.sizeBytes !== capturedSizeBytes
        ? 'captured-size-mismatch'
        : null,
      capturedSha256 && objectVerification.sha256 !== capturedSha256
        ? 'captured-sha256-mismatch'
        : null,
      !/^[a-f0-9]{64}$/.test(objectVerification.sha256 ?? '')
        ? 'invalid-provider-sha256'
        : null,
    ].filter((finding): finding is string => Boolean(finding));

    if (findings.length > 0) {
      return {
        state: 'quarantined',
        engine: 'local-policy',
        scannedAt,
        findings,
        quarantineReason:
          'Document kept in quarantine because local safety policy found one or more anomalies.',
      };
    }

    return {
      state: 'clear',
      engine: 'local-policy',
      scannedAt,
      findings: [],
      quarantineReason: null,
    };
  }

  async tripsExportCsv(
    query: {
      status?: string;
      limit?: number;
      fromDate?: string;
      toDate?: string;
      search?: string;
    },
    auth: RequestAuthContext,
  ) {
    const limit = Math.min(query.limit ?? 200, 500);

    const dateFilter: Record<string, unknown> = {};
    if (query.fromDate) {
      dateFilter['gte'] = new Date(query.fromDate);
    }
    if (query.toDate) {
      const to = new Date(query.toDate);
      to.setUTCHours(23, 59, 59, 999);
      dateFilter['lte'] = to;
    }

    const where: Prisma.TripWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      ...(query.search
        ? {
            OR: [
              {
                rider: {
                  user: {
                    fullName: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
              {
                driver: {
                  user: {
                    fullName: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const trips = await this.prisma.trip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        cancelledBy: true,
        pickupAddress: true,
        destinationAddress: true,
        actualFare: true,
        distanceKm: true,
        durationMinutes: true,
        currency: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        rider: { select: { user: { select: { fullName: true } } } },
        driver: { select: { user: { select: { fullName: true } } } },
        vehicle: {
          select: { make: true, model: true, type: true, plateNumber: true },
        },
        rideRequest: { select: { paymentMethod: true, estimatedFare: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'TRIPS_EXPORTED',
        entityType: 'TRIP',
        entityId: query.status ?? 'ALL',
        metadata: {
          format: 'csv',
          statusFilter: query.status ?? null,
          fromDate: query.fromDate ?? null,
          toDate: query.toDate ?? null,
          search: query.search ?? null,
          exportedCount: trips.length,
          limit,
        } satisfies Prisma.InputJsonObject,
      },
    });

    const headers = [
      'trip_id',
      'status',
      'cancelled_by',
      'rider_name',
      'driver_name',
      'vehicle',
      'plate_number',
      'pickup_address',
      'destination_address',
      'estimated_fare',
      'actual_fare',
      'currency',
      'distance_km',
      'duration_minutes',
      'payment_method',
      'created_at',
      'started_at',
      'completed_at',
    ];

    const rows = trips.map((trip) => [
      trip.id,
      trip.status,
      trip.cancelledBy ?? '',
      trip.rider.user.fullName,
      trip.driver.user.fullName,
      `${trip.vehicle.make} ${trip.vehicle.model} (${trip.vehicle.type})`,
      trip.vehicle.plateNumber,
      trip.pickupAddress,
      trip.destinationAddress,
      trip.rideRequest.estimatedFare !== null
        ? Number(trip.rideRequest.estimatedFare)
        : '',
      trip.actualFare !== null ? Number(trip.actualFare) : '',
      trip.currency,
      trip.distanceKm !== null ? Number(trip.distanceKm) : '',
      trip.durationMinutes ?? '',
      trip.rideRequest.paymentMethod,
      trip.createdAt.toISOString(),
      trip.startedAt?.toISOString() ?? '',
      trip.completedAt?.toISOString() ?? '',
    ]);

    return [
      headers.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n');
  }

  async suspendDriver(
    driverId: string,
    payload: { reason: string },
    auth: RequestAuthContext,
  ) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      select: { id: true, userId: true, status: true },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    if (profile.status === DriverStatus.SUSPENDED) {
      throw new BadRequestException('Driver is already suspended.');
    }

    await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: { status: DriverStatus.SUSPENDED },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_SUSPENDED',
        entityType: 'DRIVER_PROFILE',
        entityId: driverId,
        metadata: { reason: payload.reason } satisfies Prisma.InputJsonObject,
      },
    });

    void this.notificationsService.enqueue({
      userId: profile.userId,
      title: 'Compte suspendu',
      body: "Votre compte chauffeur a ete temporairement suspendu. Contactez le support pour plus d'informations.",
      channel: NotificationChannel.PUSH,
      dedupeKey: `driver-suspended:${driverId}:${Date.now()}`,
      data: { type: 'driver_account_suspended' },
    });

    return { driverId, status: 'SUSPENDED' };
  }

  async reactivateDriver(driverId: string, auth: RequestAuthContext) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      select: { id: true, userId: true, status: true },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    if (profile.status !== DriverStatus.SUSPENDED) {
      throw new BadRequestException('Driver is not suspended.');
    }

    await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: { status: DriverStatus.OFFLINE },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_REACTIVATED',
        entityType: 'DRIVER_PROFILE',
        entityId: driverId,
        metadata: {} satisfies Prisma.InputJsonObject,
      },
    });

    void this.notificationsService.enqueue({
      userId: profile.userId,
      title: 'Compte reactivé',
      body: 'Votre compte chauffeur est de nouveau actif. Bon retour sur Orbi !',
      channel: NotificationChannel.PUSH,
      dedupeKey: `driver-reactivated:${driverId}:${Date.now()}`,
      data: { type: 'driver_account_reactivated' },
    });

    return { driverId, status: 'OFFLINE' };
  }

  async listPromoCodes(): Promise<AdminPromoCodesResponse> {
    const codes = await this.prisma.promoCode.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      promoCodes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        description: c.description,
        discountBps: c.discountBps,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        validFrom: c.validFrom.toISOString(),
        validTo: c.validTo.toISOString(),
        firstTripOnly: c.firstTripOnly,
        active: c.active,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  async createPromoCode(dto: CreatePromoCodeDto, auth: RequestAuthContext) {
    const normalizedCode = dto.code.toUpperCase().trim();
    const validFrom = new Date(dto.validFrom);
    const validTo = new Date(dto.validTo);

    if (validTo <= validFrom) {
      throw new BadRequestException('validTo must be after validFrom.');
    }

    const existing = await this.prisma.promoCode.findUnique({
      where: { code: normalizedCode },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `Promo code "${normalizedCode}" already exists.`,
      );
    }

    const created = await this.prisma.promoCode.create({
      data: {
        code: normalizedCode,
        description: dto.description?.trim() ?? null,
        discountBps: dto.discountBps,
        maxUses: dto.maxUses ?? null,
        validFrom,
        validTo,
        firstTripOnly: dto.firstTripOnly ?? true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'PROMO_CODE_CREATED',
        entityType: 'PROMO_CODE',
        entityId: created.id,
        metadata: {
          code: normalizedCode,
          discountBps: dto.discountBps,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return {
      id: created.id,
      code: created.code,
      discountBps: created.discountBps,
      validFrom: created.validFrom.toISOString(),
      validTo: created.validTo.toISOString(),
      firstTripOnly: created.firstTripOnly,
      active: created.active,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async deactivatePromoCode(promoCodeId: string, auth: RequestAuthContext) {
    const code = await this.prisma.promoCode.findUnique({
      where: { id: promoCodeId },
      select: { id: true, code: true, active: true },
    });

    if (!code) {
      throw new NotFoundException('Promo code not found.');
    }

    if (!code.active) {
      throw new BadRequestException('Promo code is already inactive.');
    }

    await this.prisma.promoCode.update({
      where: { id: promoCodeId },
      data: { active: false },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'PROMO_CODE_DEACTIVATED',
        entityType: 'PROMO_CODE',
        entityId: promoCodeId,
        metadata: { code: code.code } satisfies Prisma.InputJsonObject,
      },
    });

    return { promoCodeId, active: false };
  }

  async listDrivers(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 30));
    const searchTerm = query.search?.trim();
    const allowedStatuses = new Set([
      'PENDING',
      'ACTIVE',
      'SUSPENDED',
      'REJECTED',
    ]);
    const filterStatus =
      query.status && allowedStatuses.has(query.status.toUpperCase())
        ? (query.status.toUpperCase() as DriverStatus)
        : undefined;

    const where: Prisma.DriverProfileWhereInput = {
      ...(searchTerm
        ? {
            OR: [
              {
                user: {
                  fullName: { contains: searchTerm, mode: 'insensitive' },
                },
              },
              {
                user: { email: { contains: searchTerm, mode: 'insensitive' } },
              },
              { user: { phoneNumber: { contains: searchTerm } } },
            ],
          }
        : {}),
      ...(filterStatus ? { status: filterStatus } : {}),
    };

    const [driverRows, total] = await Promise.all([
      this.prisma.driverProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phoneNumber: true,
              isActive: true,
            },
          },
          vehicles: {
            where: { isActive: true },
            select: {
              make: true,
              model: true,
              plateNumber: true,
              type: true,
            },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.driverProfile.count({ where }),
    ]);

    return {
      drivers: driverRows.map((d) => {
        const [firstVehicle] = d.vehicles;
        return {
          id: d.id,
          userId: d.user.id,
          fullName: d.user.fullName,
          email: d.user.email,
          phoneNumber: d.user.phoneNumber ?? null,
          isActive: d.user.isActive,
          status: d.status,
          createdAt: d.createdAt.toISOString(),
          completedTripsCount: d.completedTripsCount,
          vehicle: firstVehicle
            ? {
                make: firstVehicle.make,
                model: firstVehicle.model,
                plateNumber: firstVehicle.plateNumber,
                vehicleType: firstVehicle.type,
              }
            : null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async listRiders(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    activeOnly?: boolean;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 30));
    const searchTerm = query.search?.trim();

    const where: Prisma.UserWhereInput = {
      role: UserRole.RIDER,
      ...(searchTerm
        ? {
            OR: [
              { fullName: { contains: searchTerm, mode: 'insensitive' } },
              { email: { contains: searchTerm, mode: 'insensitive' } },
              { phoneNumber: { contains: searchTerm } },
            ],
          }
        : {}),
      ...(query.activeOnly ? { isActive: true } : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          isActive: true,
          createdAt: true,
          riderProfile: {
            select: {
              id: true,
              _count: { select: { trips: true, rideRequests: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      riders: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phoneNumber: u.phoneNumber ?? null,
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
        riderId: u.riderProfile?.id ?? null,
        completedTripsCount: u.riderProfile?._count.trips ?? 0,
        rideRequestsCount: u.riderProfile?._count.rideRequests ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async setRiderStatus(
    userId: string,
    payload: { isActive: boolean; reason?: string },
    auth: RequestAuthContext,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true, fullName: true },
    });

    if (!user || user.role !== UserRole.RIDER) {
      throw new NotFoundException('Rider not found.');
    }

    if (user.isActive === payload.isActive) {
      throw new BadRequestException(
        payload.isActive
          ? 'Ce compte rider est déjà actif.'
          : 'Ce compte rider est déjà suspendu.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: payload.isActive },
    });

    const reason = payload.reason?.trim() || null;

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: payload.isActive ? 'RIDER_ACTIVATED' : 'RIDER_SUSPENDED',
        entityType: 'USER',
        entityId: userId,
        metadata: {
          reason,
          previousIsActive: user.isActive,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return { riderId: userId, isActive: payload.isActive };
  }

  private resolveDocumentExtension(value: string) {
    const leafName = value.trim().split(/[\\/]/).pop()?.trim() ?? '';

    if (!leafName.includes('.')) {
      return null;
    }

    return leafName.split('.').pop()?.toLowerCase() ?? null;
  }
}
