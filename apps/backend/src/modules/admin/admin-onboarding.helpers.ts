import {
  DriverDocumentStatus,
  DriverOnboardingReviewStatus,
  Prisma,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import type { RequestAuthContext } from '../auth/auth.types';
import type { UpdateDriverOnboardingReviewDto } from './dto/update-driver-onboarding-review.dto';

export const requiredOnboardingDocumentTypes = [
  'IDENTITY_DOCUMENT',
  'DRIVER_LICENSE',
  'VEHICLE_REGISTRATION',
  'INSURANCE_PROOF',
  'SELFIE_VERIFICATION',
] as const;

export const csvFormulaPrefixPattern = /^[=+\-@\t\r]/;

export type DriverDocumentIntegritySignal = {
  state: 'complete' | 'partial' | 'missing';
  score: number;
  sizeBytes: number | null;
  sha256: string | null;
  uploadSource: string | null;
  capturedAt: string | null;
  objectVerification: {
    state: 'confirmed' | 'failed' | 'pending' | 'missing';
    provider: string | null;
    objectId: string | null;
    verifiedAt: string | null;
    sizeBytes: number | null;
    sha256: string | null;
    failureReason: string | null;
  };
  safetyScan: {
    state: 'clear' | 'quarantined' | 'pending';
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
  checks: Array<{ id: string; label: string; state: 'pass' | 'warn' }>;
};

export type DriverOnboardingDecisionGuidance = {
  level: 'approve' | 'review' | 'resubmit';
  recommendedStatus: 'APPROVED' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED';
  label: string;
  detail: string;
  blockers: string[];
};

export function toVerificationStatus(
  reviewStatus: DriverOnboardingReviewStatus,
) {
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

export function resolveEffectiveDocumentStatus(document: {
  status: DriverDocumentStatus;
  expiresAt?: Date | null;
}) {
  if (document.expiresAt && document.expiresAt.getTime() <= Date.now()) {
    return DriverDocumentStatus.EXPIRED;
  }
  return document.status;
}

export function isJsonRecord(
  value: Prisma.JsonValue | undefined,
): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function nullableString(value: Prisma.JsonValue | undefined) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function nullablePositiveInteger(value: Prisma.JsonValue | undefined) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export function nullableNonNegativeInteger(
  value: Prisma.JsonValue | undefined,
) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export function nullableStringArray(value: Prisma.JsonValue | undefined) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && Boolean(item.trim()),
      )
    : [];
}

export function normalizeOnboardingExportGuidanceFilter(
  value: Prisma.JsonValue | undefined,
) {
  return value === 'approve' ||
    value === 'review' ||
    value === 'resubmit' ||
    value === 'all'
    ? value
    : ('all' as const);
}

export function csvCell(value: string | number | null | undefined) {
  const text = (value === null || value === undefined ? '' : String(value))
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sanitized = csvFormulaPrefixPattern.test(text) ? `'${text}` : text;
  return `"${sanitized.replaceAll('"', '""')}"`;
}

export function maskRequesterName(fullName: string | null | undefined) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Utilisateur Orbi';
  const [firstName, ...rest] = parts;
  const initials = rest
    .map((part) => part.at(0)?.toUpperCase())
    .filter(Boolean)
    .join('.');
  return initials ? `${firstName} ${initials}.` : firstName;
}

export function maskEmailAddress(email: string | null | undefined) {
  if (!email?.trim()) return '[email masque]';
  const [localPart, domain] = email.trim().split('@');
  if (!localPart || !domain) return '[email masque]';
  return `${localPart.slice(0, 1)}***@${domain}`;
}

export function maskPhoneNumber(phoneNumber: string | null | undefined) {
  const digits = phoneNumber?.replace(/\D/g, '') ?? '';
  if (digits.length < 4) return null;
  return `***${digits.slice(-4)}`;
}

export function shouldMinimizeDriverOnboardingIdentity(
  auth?: RequestAuthContext,
) {
  return auth?.user.role === UserRole.SUPPORT;
}

export function resolveDriverDocumentIntegrity(
  metadata: Prisma.JsonValue | null | undefined,
): DriverDocumentIntegritySignal {
  const integrity =
    metadata && isJsonRecord(metadata) && isJsonRecord(metadata.integrity)
      ? metadata.integrity
      : null;
  const sizeBytes = integrity ? nullablePositiveInteger(integrity.sizeBytes) : null;
  const sha256 = integrity ? nullableString(integrity.sha256) : null;
  const uploadSource = integrity ? nullableString(integrity.uploadSource) : null;
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
        : objectVerification?.state === 'pending_provider_confirmation' ||
            objectVerification?.state === 'pending'
          ? 'pending'
          : 'missing';
  const objectProvider = objectVerification
    ? nullableString(objectVerification.provider)
    : null;
  const objectId = objectVerification ? nullableString(objectVerification.objectId) : null;
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
      : safetyScan?.state === 'quarantined' || objectVerificationState === 'failed'
        ? 'quarantined'
        : 'pending';
  const safetyScanEngine = safetyScan ? nullableString(safetyScan.engine) : null;
  const safetyScannedAt = safetyScan ? nullableString(safetyScan.scannedAt) : null;
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
      state: safetyScanState === 'clear' ? ('pass' as const) : ('warn' as const),
    },
  ];

  const passedChecks = checks.filter((c) => c.state === 'pass').length;
  const score = Math.round((passedChecks / checks.length) * 100);
  const state = score === 100 ? 'complete' : score === 0 ? 'missing' : 'partial';
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

export function resolveDriverOnboardingDecisionGuidance(input: {
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
      resolveEffectiveDocumentStatus(document) === DriverDocumentStatus.REJECTED ||
      resolveEffectiveDocumentStatus(document) === DriverDocumentStatus.EXPIRED ||
      integrity.guidance.level === 'resubmit',
  );
  const documentsToReview = input.documentsWithIntegrity.filter(
    ({ document, integrity }) =>
      resolveEffectiveDocumentStatus(document) === DriverDocumentStatus.PENDING ||
      integrity.guidance.level === 'review',
  );
  const blockers = [
    ...input.missingRequiredTypes.map((type) => `${type}: piece absente`),
    ...documentsToResubmit.map(({ document }) => `${document.type}: piece a redemander`),
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

export function resolveDriverOnboardingDecisionSnapshot(input: {
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
        expiresAt: override?.expiresAt ? new Date(override.expiresAt) : document.expiresAt,
      };
    },
  );

  const approvedDocuments = reviewableDocuments.filter(
    (d) => resolveEffectiveDocumentStatus(d) === 'APPROVED',
  ).length;
  const pendingDocuments = reviewableDocuments.filter(
    (d) => resolveEffectiveDocumentStatus(d) === 'PENDING',
  ).length;
  const rejectedDocuments = reviewableDocuments.filter((d) => {
    const status = resolveEffectiveDocumentStatus(d);
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

export function resolveStoredDecisionGuidance(
  metadata: Prisma.JsonValue | null | undefined,
): DriverOnboardingDecisionGuidance | null {
  if (!metadata || !isJsonRecord(metadata)) return null;
  const guidance = metadata.decisionGuidance;
  if (!isJsonRecord(guidance)) return null;

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

  if (!level || !recommendedStatus || !label || !detail) return null;

  return { level, recommendedStatus, label, detail, blockers };
}

export function resolveStoredDocumentSummary(
  metadata: Prisma.JsonValue | null | undefined,
) {
  if (!metadata || !isJsonRecord(metadata)) return null;
  const summary = metadata.documentSummary;
  if (!isJsonRecord(summary)) return null;

  const total = nullableNonNegativeInteger(summary.total);
  const approved = nullableNonNegativeInteger(summary.approved);
  const pending = nullableNonNegativeInteger(summary.pending);
  const rejected = nullableNonNegativeInteger(summary.rejected);
  const missingRequired = nullableNonNegativeInteger(summary.missingRequired);
  const integrityWarnings = nullableNonNegativeInteger(summary.integrityWarnings);

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

  return { total, approved, pending, rejected, missingRequired, integrityWarnings };
}
