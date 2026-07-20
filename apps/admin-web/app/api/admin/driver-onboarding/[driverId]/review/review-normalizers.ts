import { updateAdminDriverOnboardingReview } from '@orbi/api';
import { isSafeOpaqueAdminId } from '../../../../../admin-server-security';

const reviewStatuses = new Set([
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
]);
const documentStatuses = new Set([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
]);
const isoUtcDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

type ReviewPayload = Parameters<typeof updateAdminDriverOnboardingReview>[2];

export function normalizeDriverDocumentExpiryDate(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

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

  return date.toISOString();
}

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

export function normalizeReviewPayload(value: unknown): ReviewPayload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;

  if (!reviewStatuses.has(input.status as string)) {
    return null;
  }

  const payload: ReviewPayload = {
    status: input.status as ReviewPayload['status'],
  };
  const notesInternal = boundedText(input.notesInternal, 500);
  const decisionReason = boundedText(input.decisionReason, 500);

  if (notesInternal) {
    payload.notesInternal = notesInternal;
  }

  if (decisionReason) {
    payload.decisionReason = decisionReason;
  }

  if (
    typeof input.supportPriority === 'number' &&
    Number.isInteger(input.supportPriority) &&
    input.supportPriority >= 1 &&
    input.supportPriority <= 3
  ) {
    payload.supportPriority = input.supportPriority;
  } else if (input.supportPriority !== undefined) {
    return null;
  }

  if (input.documentDecisions !== undefined) {
    if (!Array.isArray(input.documentDecisions)) {
      return null;
    }

    if (input.documentDecisions.length > 25) {
      return null;
    }

    const documentDecisions: NonNullable<ReviewPayload['documentDecisions']> =
      [];

    for (const decision of input.documentDecisions) {
      if (
        typeof decision !== 'object' ||
        decision === null ||
        Array.isArray(decision)
      ) {
        return null;
      }

      const documentDecision = decision as Record<string, unknown>;

      if (
        typeof documentDecision.documentId !== 'string' ||
        !isSafeOpaqueAdminId(documentDecision.documentId) ||
        !documentStatuses.has(documentDecision.status as string)
      ) {
        return null;
      }

      let expiresAt: string | undefined;

      if (documentDecision.expiresAt !== undefined) {
        const normalizedExpiry = normalizeDriverDocumentExpiryDate(
          documentDecision.expiresAt,
        );

        if (!normalizedExpiry) {
          return null;
        }

        expiresAt = normalizedExpiry;
      }

      const rejectionReason = boundedText(
        documentDecision.rejectionReason,
        240,
      );

      documentDecisions.push({
        documentId: documentDecision.documentId,
        status: documentDecision.status as
          | 'PENDING'
          | 'APPROVED'
          | 'REJECTED'
          | 'EXPIRED',
        ...(rejectionReason ? { rejectionReason } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      });
    }

    payload.documentDecisions = documentDecisions;
  }

  return payload;
}
