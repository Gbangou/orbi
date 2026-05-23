export const OFFER_ASSIGNMENT_WINDOW_MS = 30_000;
export const MIN_OFFER_ASSIGNMENT_WINDOW_MS = 20_000;
export const MAX_OFFER_ASSIGNMENT_WINDOW_MS = 50_000;
export const MAX_ASSIGNED_OFFERS = 3;
export const DISPATCH_SIGNAL_LOOKBACK_HOURS = 72;
export const DISPATCH_SIGNAL_HALF_LIFE_HOURS = 18;
export const DISPATCH_DECLINE_COOLDOWN_MINUTES = 20;
export const MAX_DISPATCH_SIGNAL_EVENTS = 48;
export const DISPATCH_LEARNING_SETTING_KEY = 'dispatch-learning';

export type DispatchAuditAction =
  | 'DISPATCH_RESERVATION_ASSIGNED'
  | 'DISPATCH_RESERVATION_ACCEPTED'
  | 'DISPATCH_RESERVATION_DECLINED'
  | 'DISPATCH_RESERVATION_EXPIRED'
  | 'DISPATCH_RESERVATION_RELEASED'
  | 'DISPATCH_PROACTIVE_ASSIGNMENT'
  | 'DISPATCH_PROACTIVE_NO_CANDIDATE';

export type DispatchLearningSettingsValues = {
  lookbackHours: number;
  halfLifeHours: number;
  declineCooldownMinutes: number;
  historyLimit: number;
};

export type DispatchLearningSettingsSnapshot =
  DispatchLearningSettingsValues & {
    source: 'DEFAULT' | 'DATABASE_OVERRIDE';
    updatedAt: string | null;
    updatedBy: {
      id: string;
      name: string | null;
      role: string | null;
    } | null;
  };

export type DispatchSignalFreshness = 'HOT' | 'RECENT' | 'STALE' | 'UNKNOWN';

export type DispatchBehaviorSignal = {
  score: number;
  acceptanceRate: number | null;
  declineRate: number | null;
  expirationRate: number | null;
  signalFreshness: DispatchSignalFreshness;
};

export type DispatchBehaviorAuditEvent = {
  action: DispatchAuditAction;
  createdAt: Date;
};

export function calculateDispatchScore(input: {
  pickupDistanceKm: number | null;
  estimatedTripDistanceKm: number;
  ageMinutes: number;
  hasExactTierMatch: boolean;
  availabilityScore: number;
  supplyPressureLevel: 'LOW' | 'BALANCED' | 'TIGHT' | 'CRITICAL';
  demandLevel: 'NORMAL' | 'HIGH' | 'PEAK';
  trafficLevel: 'FREE_FLOW' | 'MODERATE' | 'HEAVY' | 'GRIDLOCK';
  roadCondition: 'OPEN' | 'SLOW' | 'CONGESTED' | 'BLOCKED';
}) {
  const tierScore = input.hasExactTierMatch ? 35 : 20;
  const pickupScore =
    input.pickupDistanceKm === null
      ? 12
      : Math.max(0, 40 - input.pickupDistanceKm * 4);
  const tripDistanceScore = Math.min(input.estimatedTripDistanceKm, 20);
  const freshnessScore = Math.max(0, 18 - input.ageMinutes);
  const availabilityScore = Math.round(input.availabilityScore * 0.12);
  const pressureScore =
    {
      LOW: -4,
      BALANCED: 4,
      TIGHT: 10,
      CRITICAL: 14,
    }[input.supplyPressureLevel] ?? 0;
  const demandScore =
    {
      NORMAL: 0,
      HIGH: 4,
      PEAK: 7,
    }[input.demandLevel] ?? 0;
  const roadPenalty =
    {
      OPEN: 0,
      SLOW: -1,
      CONGESTED: -3,
      BLOCKED: -6,
    }[input.roadCondition] ?? 0;
  const trafficPenalty =
    {
      FREE_FLOW: 2,
      MODERATE: 0,
      HEAVY: -2,
      GRIDLOCK: -5,
    }[input.trafficLevel] ?? 0;

  return Math.round(
    tierScore +
      pickupScore +
      tripDistanceScore +
      freshnessScore +
      availabilityScore +
      pressureScore +
      demandScore +
      roadPenalty +
      trafficPenalty,
  );
}

export function calculateOfferConfidenceScore(input: {
  dispatchScore: number;
  pickupDistanceKm: number | null;
  availabilityScore: number;
  ageMinutes: number;
  hasExactTierMatch: boolean;
  behavioralScore: number;
}) {
  const dispatchContribution = Math.min(
    52,
    Math.round(input.dispatchScore * 0.48),
  );
  const pickupContribution =
    input.pickupDistanceKm === null
      ? 10
      : Math.max(0, 24 - Math.round(input.pickupDistanceKm * 5));
  const availabilityContribution = Math.round(input.availabilityScore * 0.18);
  const freshnessContribution = Math.max(0, 16 - input.ageMinutes * 2);
  const tierContribution = input.hasExactTierMatch ? 10 : 4;
  const behavioralContribution = Math.round(
    (input.behavioralScore - 60) * 0.35,
  );

  return Math.max(
    22,
    Math.min(
      97,
      dispatchContribution +
        pickupContribution +
        availabilityContribution +
        freshnessContribution +
        tierContribution +
        behavioralContribution,
    ),
  );
}

export function resolveOfferConfidenceLabel(confidenceScore: number) {
  if (confidenceScore >= 88) {
    return 'PRIORITY' as const;
  }

  if (confidenceScore >= 72) {
    return 'HIGH' as const;
  }

  if (confidenceScore >= 55) {
    return 'MEDIUM' as const;
  }

  return 'LOW' as const;
}

export function resolveAssignmentWindowMs(confidenceScore: number) {
  const weightedWindow =
    OFFER_ASSIGNMENT_WINDOW_MS + (confidenceScore - 60) * 450;

  return Math.max(
    MIN_OFFER_ASSIGNMENT_WINDOW_MS,
    Math.min(MAX_OFFER_ASSIGNMENT_WINDOW_MS, Math.round(weightedWindow)),
  );
}

export function summarizeDispatchLearning(input: {
  acceptanceRate: number | null;
  declineRate: number | null;
  expirationRate: number | null;
  confidenceScore: number;
  signalFreshness: DispatchSignalFreshness;
}) {
  if (input.acceptanceRate === null) {
    return 'Memoire dispatch neutre: pas encore assez de recul comportemental.';
  }

  if (input.confidenceScore >= 85) {
    return appendDispatchFreshness(
      'Memoire dispatch solide: acceptations recentes elevees.',
      input.signalFreshness,
    );
  }

  if ((input.declineRate ?? 0) >= 0.28) {
    return appendDispatchFreshness(
      'Memoire dispatch fragile: refus explicites recents trop frequents.',
      input.signalFreshness,
    );
  }

  if ((input.expirationRate ?? 0) >= 0.35) {
    return appendDispatchFreshness(
      'Memoire dispatch fragile: trop d expirations recentes a corriger.',
      input.signalFreshness,
    );
  }

  if ((input.acceptanceRate ?? 0) >= 0.55) {
    return appendDispatchFreshness(
      'Memoire dispatch correcte: bonnes acceptations recentes.',
      input.signalFreshness,
    );
  }

  return appendDispatchFreshness(
    'Memoire dispatch correcte: quelques expirations recentes a surveiller.',
    input.signalFreshness,
  );
}

export function resolveDispatchSignalWeight(
  createdAt: Date,
  nowMs: number,
  halfLifeHours: number,
) {
  const ageHours = Math.max(0, (nowMs - createdAt.getTime()) / 3_600_000);

  return Math.pow(0.5, ageHours / halfLifeHours);
}

export function resolveDispatchSignalFreshness(
  lastEventAt: Date | null,
  nowMs: number,
): DispatchSignalFreshness {
  if (!lastEventAt) {
    return 'UNKNOWN';
  }

  const ageHours = Math.max(0, (nowMs - lastEventAt.getTime()) / 3_600_000);

  if (ageHours <= 6) {
    return 'HOT';
  }

  if (ageHours <= 24) {
    return 'RECENT';
  }

  return 'STALE';
}

export function evaluateDispatchBehaviorSignal(input: {
  events: DispatchBehaviorAuditEvent[];
  halfLifeHours: number;
  nowMs?: number;
}): DispatchBehaviorSignal {
  const nowMs = input.nowMs ?? Date.now();
  const signalFreshness = resolveDispatchSignalFreshness(
    input.events[0]?.createdAt ?? null,
    nowMs,
  );
  let assignedWeight = 0;
  let acceptedWeight = 0;
  let declinedWeight = 0;
  let expiredWeight = 0;
  let releasedWeight = 0;

  for (const event of input.events) {
    const weight = resolveDispatchSignalWeight(
      event.createdAt,
      nowMs,
      input.halfLifeHours,
    );

    switch (event.action) {
      case 'DISPATCH_RESERVATION_ASSIGNED':
        assignedWeight += weight;
        break;
      case 'DISPATCH_RESERVATION_ACCEPTED':
        acceptedWeight += weight;
        break;
      case 'DISPATCH_RESERVATION_DECLINED':
        declinedWeight += weight;
        break;
      case 'DISPATCH_RESERVATION_EXPIRED':
        expiredWeight += weight;
        break;
      case 'DISPATCH_RESERVATION_RELEASED':
        releasedWeight += weight;
        break;
      default:
        break;
    }
  }

  if (!assignedWeight) {
    return {
      score: 60,
      acceptanceRate: null,
      declineRate: null,
      expirationRate: null,
      signalFreshness,
    };
  }

  const acceptanceRate = acceptedWeight / assignedWeight;
  const declineRate = declinedWeight / assignedWeight;
  const expirationRate = expiredWeight / assignedWeight;
  const releaseRate = releasedWeight / assignedWeight;
  const score = Math.max(
    34,
    Math.min(
      92,
      Math.round(
        60 +
          acceptanceRate * 24 -
          declineRate * 18 -
          expirationRate * 14 -
          releaseRate * 10,
      ),
    ),
  );

  return {
    score,
    acceptanceRate,
    declineRate,
    expirationRate,
    signalFreshness,
  };
}

export function resolveDispatchZone(estimatedTripDistanceKm: number) {
  if (estimatedTripDistanceKm >= 8) {
    return 'SEMI_URBAN' as const;
  }

  if (estimatedTripDistanceKm >= 5) {
    return 'URBAN_EDGE' as const;
  }

  return 'URBAN_CORE' as const;
}

export function resolveDispatchTrafficLevel(
  estimatedTripDistanceKm: number,
  estimatedDurationMinutes: number,
) {
  const minutesPerKm =
    estimatedTripDistanceKm > 0
      ? estimatedDurationMinutes / estimatedTripDistanceKm
      : estimatedDurationMinutes;

  if (minutesPerKm >= 4.2) {
    return 'GRIDLOCK' as const;
  }

  if (minutesPerKm >= 3.1) {
    return 'HEAVY' as const;
  }

  if (minutesPerKm >= 2.1) {
    return 'MODERATE' as const;
  }

  return 'FREE_FLOW' as const;
}

export function resolveDispatchRoadCondition(
  estimatedTripDistanceKm: number,
  estimatedDurationMinutes: number,
) {
  const minutesPerKm =
    estimatedTripDistanceKm > 0
      ? estimatedDurationMinutes / estimatedTripDistanceKm
      : estimatedDurationMinutes;

  if (minutesPerKm >= 4.4) {
    return 'BLOCKED' as const;
  }

  if (minutesPerKm >= 3.3) {
    return 'CONGESTED' as const;
  }

  if (minutesPerKm >= 2.3) {
    return 'SLOW' as const;
  }

  return 'OPEN' as const;
}

export function isPeakTrafficWindow(date: Date) {
  const hour = date.getHours();

  return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 20);
}

function appendDispatchFreshness(
  summary: string,
  freshness: DispatchSignalFreshness,
) {
  switch (freshness) {
    case 'HOT':
      return `${summary} Signal tres recent.`;
    case 'RECENT':
      return `${summary} Signal recent.`;
    case 'STALE':
      return `${summary} Signal plus ancien, a revalider sur le terrain.`;
    case 'UNKNOWN':
    default:
      return summary;
  }
}
