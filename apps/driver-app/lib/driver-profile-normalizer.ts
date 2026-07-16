import type { DriverProfileResponse } from '@orbi/api';

export const fallbackDriverProfile: DriverProfileResponse = {
  profile: {
    id: 'loading',
    fullName: '',
    email: '',
    phoneNumber: null,
    status: 'OFFLINE',
    verificationStatus: 'PENDING',
    serviceRadiusKm: 8,
    averageRating: null,
    completedTripsCount: 0,
    fatigue: {
      state: 'clear',
      completedTrips: 0,
      drivingMinutes: 0,
      windowHours: 8,
      maxCompletedTrips: 8,
      maxDrivingMinutes: 300,
      restMinutes: 30,
      restUntil: null,
      reason: '',
    },
    onboarding: {
      verificationStatus: 'PENDING',
      reviewStatus: 'SUBMITTED',
      completedItems: 0,
      totalItems: 7,
      readinessPercent: 0,
      serviceRadiusKm: 8,
      city: 'OUAGADOUGOU',
      submittedAt: null,
      latestReviewAt: null,
      latestDecisionReason: null,
      reviewActorName: null,
      notes: '',
      checklist: [],
      documents: [],
      reviewTimeline: [],
    },
    vehicles: [],
  },
};

export function normalizeDriverProfileResponse(
  response: unknown,
): DriverProfileResponse {
  const fallback = fallbackDriverProfile.profile;
  const record =
    response && typeof response === 'object'
      ? (response as { profile?: unknown })
      : {};
  const input =
    record.profile && typeof record.profile === 'object'
      ? (record.profile as Partial<DriverProfileResponse['profile']>)
      : {};
  const fallbackOnboarding = fallback.onboarding;
  const inputOnboarding =
    input.onboarding && typeof input.onboarding === 'object'
      ? (input.onboarding as Partial<DriverProfileResponse['profile']['onboarding']>)
      : {};

  return {
    profile: {
      ...fallback,
      ...input,
      id: typeof input.id === 'string' ? input.id : fallback.id,
      fullName:
        typeof input.fullName === 'string' ? input.fullName : fallback.fullName,
      email: typeof input.email === 'string' ? input.email : fallback.email,
      phoneNumber:
        typeof input.phoneNumber === 'string' || input.phoneNumber === null
          ? input.phoneNumber
          : fallback.phoneNumber,
      status: typeof input.status === 'string' ? input.status : fallback.status,
      verificationStatus:
        typeof input.verificationStatus === 'string'
          ? input.verificationStatus
          : fallback.verificationStatus,
      serviceRadiusKm:
        typeof input.serviceRadiusKm === 'number' || input.serviceRadiusKm === null
          ? input.serviceRadiusKm
          : fallback.serviceRadiusKm,
      averageRating:
        typeof input.averageRating === 'number' || input.averageRating === null
          ? input.averageRating
          : fallback.averageRating,
      completedTripsCount:
        typeof input.completedTripsCount === 'number'
          ? input.completedTripsCount
          : fallback.completedTripsCount,
      fatigue:
        input.fatigue && typeof input.fatigue === 'object'
          ? { ...fallback.fatigue, ...input.fatigue }
          : fallback.fatigue,
      onboarding: {
        ...fallbackOnboarding,
        ...inputOnboarding,
        checklist: Array.isArray(inputOnboarding.checklist)
          ? inputOnboarding.checklist
          : fallbackOnboarding.checklist,
        documents: Array.isArray(inputOnboarding.documents)
          ? inputOnboarding.documents
          : fallbackOnboarding.documents,
        reviewTimeline: Array.isArray(inputOnboarding.reviewTimeline)
          ? inputOnboarding.reviewTimeline
          : fallbackOnboarding.reviewTimeline,
      },
      vehicles: Array.isArray(input.vehicles) ? input.vehicles : fallback.vehicles,
      dispatchSignal:
        input.dispatchSignal && typeof input.dispatchSignal === 'object'
          ? input.dispatchSignal
          : undefined,
    },
  };
}
