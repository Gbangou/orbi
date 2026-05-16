import { NextResponse, type NextRequest } from 'next/server';
import { updateAdminDriverOnboardingReview } from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../../../../../admin-server-security';

export const dynamic = 'force-dynamic';

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

type ReviewPayload = Parameters<typeof updateAdminDriverOnboardingReview>[2];

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function normalizeReviewPayload(value: unknown): ReviewPayload | null {
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

      const expiresAt =
        typeof documentDecision.expiresAt === 'string' &&
        !Number.isNaN(Date.parse(documentDecision.expiresAt))
          ? documentDecision.expiresAt
          : undefined;
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ driverId: string }> },
) {
  const { driverId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(driverId)) {
    return NextResponse.json(
      { message: 'Invalid driver identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  const payload = normalizeReviewPayload(await request.json().catch(() => null));

  if (!payload) {
    return NextResponse.json(
      { message: 'Invalid driver onboarding review update.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await updateAdminDriverOnboardingReview(
      authClient,
      driverId,
      payload,
    );

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to update driver onboarding review.',
    );
  }
}
