// ── API config, route map, realtime URL builder, fixture data ─────────────────

import type {
  AdminMetric,
  DriverOffer,
  RideOption,
  VoiceSuggestion,
} from "@orbi/domain";

export const apiConfig = {
  versionPrefix: "v1",
  defaultPort: 3000,
  apiPrefix: "/api",
  swaggerPath: "/docs",
} as const;

export const apiRoutes = {
  health: "/health",
  auth: {
    signUp: "/auth/sign-up",
    signIn: "/auth/sign-in",
    me: "/auth/me",
    sessions: "/auth/sessions",
    signOut: "/auth/sign-out",
    supportTickets: "/auth/support-tickets",
    dataExport: "/auth/data-export",
    deleteAccount: "/auth/account",
  },
  mobile: {
    errorReports: "/mobile/error-reports",
  },
  admin: {
    preview: "/admin/preview",
    overview: "/admin/overview",
    liveOps: "/admin/live-ops",
    financeDashboard: "/admin/finance-dashboard",
    operationalKpis: "/admin/operational-kpis",
    tripsAudit: "/admin/trips/audit",
    launchReadiness: "/admin/launch-readiness",
    jobQueue: "/admin/job-queue",
    stream: "/admin/stream",
    healthIncidents: "/admin/health-incidents",
    supportTickets: "/admin/support-tickets",
    riders: "/admin/riders",
    drivers: "/admin/drivers",
    driverWallets: "/admin/driver-wallets",
    driverPayouts: "/admin/driver-payouts",
    driverPayoutSettlementCsv: "/admin/driver-payouts/settlement.csv",
    driverPayoutSettlementPdf: "/admin/driver-payouts/settlement.pdf",
    featureFlags: "/admin/feature-flags",
    dispatchSettings: "/admin/dispatch-settings",
    pricingCalibration: "/admin/pricing-calibration",
    paymentWebhookEvents: "/admin/payment-webhook-events",
    paymentAttempts: "/admin/payment-attempts",
    driverOnboarding: "/admin/driver-onboarding",
    driverOnboardingQueue: "/admin/driver-onboarding-queue",
    driverOnboardingExportHistory: "/admin/driver-onboarding/export-history",
    driverOnboardingExportCsv: "/admin/driver-onboarding/export.csv",
    tripsExportCsv: "/admin/trips/export.csv",
  },
  riders: {
    me: "/riders/me",
    overview: "/riders/overview",
    savedPlaces: "/riders/saved-places",
    trustedContact: "/riders/trusted-contact",
    trustedContacts: "/riders/trusted-contacts",
  },
  drivers: {
    root: "/drivers",
    nearby: "/drivers/nearby",
    previewOffers: "/drivers/preview-offers",
    me: "/drivers/me",
    earnings: "/drivers/earnings",
    overview: "/drivers/overview",
    offers: "/drivers/offers",
    dispatchReadiness: "/drivers/dispatch-readiness",
    declineOffer: "/drivers/offers",
    availability: "/drivers/availability",
    presence: "/drivers/presence",
    onboarding: "/drivers/onboarding",
    onboardingDocumentUploadLinks: "/drivers/onboarding/document-upload-links",
  },
  vehicles: "/vehicles",
  rideRequests: {
    root: "/ride-requests",
    active: "/ride-requests/active",
  },
  trips: {
    root: "/trips",
    dashboard: "/trips/dashboard",
    mine: "/trips/mine",
    stream: "/trips/stream",
    shared: "/trips/shared",
    acceptRideRequest: "/trips/accept",
    verifyPickupCode: "/trips",
    shareLink: "/trips",
    reportIncident: "/trips",
    safetySos: "/trips",
    rate: "/trips",
  },
  pricing: {
    rules: "/pricing/rules",
    estimate: "/pricing/estimate",
    rideOptions: "/pricing/ride-options",
  },
  payments: {
    checkoutIntents: "/payments/checkout-intents",
    webhooks: "/payments/webhooks",
  },
  voice: {
    locationIntent: "/voice/location-intent",
  },
  users: {
    pushToken: "/users/me/push-token",
  },
  scheduledRides: {
    root: "/scheduled-rides",
    mine: "/scheduled-rides/mine",
  },
} as const;

// ── Realtime ──────────────────────────────────────────────────────────────────

import type { OrbiApiClient } from "./client";

export function buildRealtimeStreamUrl(
  client: OrbiApiClient,
  sessionToken: string,
) {
  return client.endpoint(apiRoutes.trips.stream, {
    sessionToken,
  });
}

// ── Fixture / preview data ────────────────────────────────────────────────────

function createPreviewReservationExpiry(windowSeconds: number) {
  return new Date(Date.now() + windowSeconds * 1000).toISOString();
}

export const riderRideOptions: RideOption[] = [
  {
    id: "moto-standard",
    category: "motorcycle",
    tier: "moto-standard",
    title: "Moto",
    etaMinutes: 3,
    fare: 1200,
    capacity: "1 place",
    accent: "#2dd4bf",
    badge: "Le plus rapide",
    paymentMethods: ["mobile-money", "cash", "wallet"],
    safetyNote: "Verification nom, plaque et partage du trajet actifs.",
    marketplace: {
      availabilityLabel: "Tres disponible",
      nearbyDrivers: 9,
      pickupRadiusKm: 1.8,
      etaConfidence: "HIGH",
      etaSource: "LIVE",
      supplySource: "LIVE",
      signalFreshnessSeconds: 45,
      signalLabel: "Live recent",
      reliabilityNote: "Disponibilite calculee depuis les chauffeurs en ligne recents.",
      vehicleExamples: ["Yamaha Crypton", "TVS HLX", "Bajaj Boxer"],
      pricePromise: "Prix upfront verrouille avant confirmation.",
    },
    fareBreakdown: {
      baseFare: 600,
      bookingFee: 150,
      demandMultiplier: 1,
      commercialRoundingAmount: 0,
      commercialRoundingStep: 100,
    },
  },
  {
    id: "car-standard",
    category: "car",
    tier: "car-standard",
    title: "Voiture Ville",
    etaMinutes: 6,
    fare: 2400,
    capacity: "4 places",
    accent: "#f59e0b",
    badge: "Le plus populaire",
    paymentMethods: ["mobile-money", "cash", "wallet"],
    safetyNote: "Tarif transparent avant confirmation et suivi partageable.",
    marketplace: {
      availabilityLabel: "Disponible",
      nearbyDrivers: 5,
      pickupRadiusKm: 2.6,
      etaConfidence: "MEDIUM",
      etaSource: "LIVE",
      supplySource: "LIVE",
      signalFreshnessSeconds: 60,
      signalLabel: "Live recent",
      reliabilityNote: "Disponibilite calculee depuis les chauffeurs en ligne recents.",
      vehicleExamples: ["Toyota Corolla", "Hyundai Accent", "Suzuki Dzire"],
      pricePromise: "Prix upfront affiche sans frais de pickup caches.",
    },
    fareBreakdown: {
      baseFare: 1200,
      bookingFee: 250,
      demandMultiplier: 1.1,
      commercialRoundingAmount: 0,
      commercialRoundingStep: 100,
    },
  },
  {
    id: "car-confort",
    category: "car",
    tier: "car-comfort",
    title: "Confort",
    etaMinutes: 8,
    fare: 3500,
    capacity: "4 places",
    accent: "#38bdf8",
    badge: "Premium",
    paymentMethods: ["mobile-money", "wallet"],
    safetyNote: "Verification chauffeur renforcee et experience plus calme.",
    marketplace: {
      availabilityLabel: "Selection limitee",
      nearbyDrivers: 3,
      pickupRadiusKm: 3.4,
      etaConfidence: "MEDIUM",
      etaSource: "ESTIMATED",
      supplySource: "ESTIMATED",
      signalFreshnessSeconds: null,
      signalLabel: "Estime",
      reliabilityNote: "Disponibilite estimee; confirmation chauffeur requise avant depart.",
      vehicleExamples: ["Toyota Yaris", "Hyundai Elantra", "Kia Rio"],
      pricePromise: "Prix upfront avec confort et verification renforces.",
    },
    fareBreakdown: {
      baseFare: 1500,
      bookingFee: 300,
      demandMultiplier: 1.15,
      commercialRoundingAmount: 0,
      commercialRoundingStep: 100,
    },
  },
];

export const driverOffers: DriverOffer[] = [
  {
    id: "offer-001",
    riderName: "Awa Ouedraogo",
    pickup: "Universite Joseph Ki-Zerbo",
    destination: "Ouaga 2000",
    category: "motorcycle",
    fare: 1600,
    distanceKm: 5.8,
    etaToPickupMinutes: 4,
    driverPayout: 1350,
    pickupCodeRequired: false,
    pickupDistanceKm: 1.2,
    pickupDistanceSource: "DRIVER_AND_PICKUP_COORDINATES",
    reservationExpiresAt: createPreviewReservationExpiry(45),
    serviceRadiusKm: 8,
    dispatchScore: 86,
    matchedTier: "MOTO_STANDARD",
    dispatchContextSummary: "HIGH - HEAVY - dispo 74/100",
    offerConfidenceScore: 91,
    offerConfidenceLabel: "PRIORITY",
    reservationWindowSeconds: 45,
    dispatchLearningSummary:
      "Memoire dispatch solide: acceptations recentes elevees. Signal recent.",
    fairnessScore: 84,
    fairnessLabel: "BALANCED",
    fairnessSummary:
      "Equilibre marketplace sain. Rider 88/100 - Chauffeur 78/100 - Ops 96/100.",
    fairnessBreakdown: {
      riderAccessibilityScore: 88,
      driverPayoutScore: 78,
      opsMarginScore: 96,
    },
  },
  {
    id: "offer-002",
    riderName: "Moussa Traore",
    pickup: "Zone du Bois",
    destination: "Koulouba",
    category: "car",
    fare: 2900,
    distanceKm: 7.2,
    etaToPickupMinutes: 6,
    driverPayout: 2400,
    pickupCodeRequired: false,
    pickupDistanceKm: 2.8,
    pickupDistanceSource: "DRIVER_AND_PICKUP_COORDINATES",
    reservationExpiresAt: createPreviewReservationExpiry(35),
    serviceRadiusKm: 8,
    dispatchScore: 71,
    matchedTier: "CAR_STANDARD",
    dispatchContextSummary: "BALANCED - MODERATE - dispo 81/100",
    offerConfidenceScore: 68,
    offerConfidenceLabel: "HIGH",
    reservationWindowSeconds: 35,
    dispatchLearningSummary:
      "Memoire dispatch correcte: quelques expirations recentes a surveiller. Signal recent.",
    fairnessScore: 67,
    fairnessLabel: "DRIVER_PAYOUT_WATCH",
    fairnessSummary:
      "Payout chauffeur a surveiller avant priorisation. Rider 91/100 - Chauffeur 52/100 - Ops 96/100.",
    fairnessBreakdown: {
      riderAccessibilityScore: 91,
      driverPayoutScore: 52,
      opsMarginScore: 96,
    },
  },
];

export const adminMetrics: AdminMetric[] = [
  {
    label: "Reservations brutes",
    value: "XOF 3,2M",
    trend: "+14% cette semaine",
  },
  { label: "Taux de completion", value: "94,8%", trend: "+2,1 pts" },
  { label: "Temps moyen pickup", value: "3 min 12 s", trend: "-28 s" },
  { label: "Incidents en direct", value: "3", trend: "2 a revoir" },
];

export const voiceSuggestions: VoiceSuggestion[] = [
  {
    id: "loc-1",
    name: "Ouaga 2000",
    district: "Ouagadougou",
    confidence: 0.98,
  },
  {
    id: "loc-2",
    name: "Universite Joseph Ki-Zerbo",
    district: "Ouagadougou",
    confidence: 0.96,
  },
  {
    id: "loc-3",
    name: "Aeroport de Ouagadougou",
    district: "Ouagadougou",
    confidence: 0.91,
  },
];
