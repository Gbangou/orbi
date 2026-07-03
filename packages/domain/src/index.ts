export const orbiBrand = {
  name: 'Orbi',
  launchMarket: 'Burkina Faso',
  launchLocale: 'fr-BF',
  promise: 'Se deplacer avec confiance, vite et clairement.',
  pillars: ['speed', 'safety', 'clarity', 'trust'] as const,
} as const;

export const vehicleCategories = ['motorcycle', 'car'] as const;
export type VehicleCategory = (typeof vehicleCategories)[number];
export const apiVehicleTypes = ['MOTORCYCLE', 'CAR'] as const;
export type ApiVehicleType = 'MOTORCYCLE' | 'CAR';

export const serviceTiers = [
  'moto-standard',
  'car-standard',
  'car-comfort',
  'car-xl',
] as const;
export type ServiceTier = (typeof serviceTiers)[number];
export const apiServiceTiers = [
  'MOTO_STANDARD',
  'CAR_STANDARD',
  'CAR_COMFORT',
  'CAR_XL',
] as const;
export type ApiServiceTier =
  | 'MOTO_STANDARD'
  | 'CAR_STANDARD'
  | 'CAR_COMFORT'
  | 'CAR_XL';

export const paymentMethods = ['mobile-money', 'cash', 'wallet'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export const apiPaymentMethods = ['MOBILE_MONEY', 'CASH', 'WALLET'] as const;
export type ApiPaymentMethod = 'MOBILE_MONEY' | 'CASH' | 'WALLET';

export const marketZones = ['urban-core', 'urban-edge', 'semi-urban'] as const;
export type MarketZone = (typeof marketZones)[number];
export const apiMarketZones = [
  'URBAN_CORE',
  'URBAN_EDGE',
  'SEMI_URBAN',
] as const;
export type ApiMarketZone = 'URBAN_CORE' | 'URBAN_EDGE' | 'SEMI_URBAN';

export const pricingCities = [
  'ouagadougou',
  'bobo-dioulasso',
  'koudougou',
  'banfora',
  'ouahigouya',
] as const;
export type PricingCity = (typeof pricingCities)[number];
export const apiPricingCities = [
  'OUAGADOUGOU',
  'BOBO_DIOULASSO',
  'KOUDOUGOU',
  'BANFORA',
  'OUAHIGOUYA',
] as const;
export type ApiPricingCity =
  | 'OUAGADOUGOU'
  | 'BOBO_DIOULASSO'
  | 'KOUDOUGOU'
  | 'BANFORA'
  | 'OUAHIGOUYA';

export const districtProfiles = [
  'cbd',
  'university',
  'government',
  'airport',
  'residential-standard',
  'residential-peripheral',
  'market-dense',
  'industrial',
  'intercity-gate',
] as const;
export type DistrictProfile = (typeof districtProfiles)[number];
export const apiDistrictProfiles = [
  'CBD',
  'UNIVERSITY',
  'GOVERNMENT',
  'AIRPORT',
  'RESIDENTIAL_STANDARD',
  'RESIDENTIAL_PERIPHERAL',
  'MARKET_DENSE',
  'INDUSTRIAL',
  'INTERCITY_GATE',
] as const;
export type ApiDistrictProfile =
  | 'CBD'
  | 'UNIVERSITY'
  | 'GOVERNMENT'
  | 'AIRPORT'
  | 'RESIDENTIAL_STANDARD'
  | 'RESIDENTIAL_PERIPHERAL'
  | 'MARKET_DENSE'
  | 'INDUSTRIAL'
  | 'INTERCITY_GATE';

export const demandLevels = ['normal', 'high', 'peak'] as const;
export type DemandLevel = (typeof demandLevels)[number];
export const apiDemandLevels = ['NORMAL', 'HIGH', 'PEAK'] as const;
export type ApiDemandLevel = 'NORMAL' | 'HIGH' | 'PEAK';
export const trafficLevels = [
  'free-flow',
  'moderate',
  'heavy',
  'gridlock',
] as const;
export type TrafficLevel = (typeof trafficLevels)[number];
export const apiTrafficLevels = [
  'FREE_FLOW',
  'MODERATE',
  'HEAVY',
  'GRIDLOCK',
] as const;
export type ApiTrafficLevel = 'FREE_FLOW' | 'MODERATE' | 'HEAVY' | 'GRIDLOCK';
export const weatherConditions = [
  'clear',
  'heat',
  'wind',
  'dust',
  'rain',
  'storm',
] as const;
export type WeatherCondition = (typeof weatherConditions)[number];
export const apiWeatherConditions = [
  'CLEAR',
  'HEAT',
  'WIND',
  'DUST',
  'RAIN',
  'STORM',
] as const;
export type ApiWeatherCondition =
  | 'CLEAR'
  | 'HEAT'
  | 'WIND'
  | 'DUST'
  | 'RAIN'
  | 'STORM';
export const roadConditions = [
  'open',
  'slow',
  'congested',
  'blocked',
] as const;
export type RoadCondition = (typeof roadConditions)[number];
export const apiRoadConditions = [
  'OPEN',
  'SLOW',
  'CONGESTED',
  'BLOCKED',
] as const;
export type ApiRoadCondition = 'OPEN' | 'SLOW' | 'CONGESTED' | 'BLOCKED';

export const rideStatuses = [
  'requested',
  'matched',
  'driver-arriving',
  'in-progress',
  'completed',
  'expired',
  'cancelled',
] as const;
export type RideStatus = (typeof rideStatuses)[number];

export const rideRequestLifecycleStatuses = [
  'REQUESTED',
  'MATCHED',
  'DRIVER_ARRIVING',
  'EXPIRED',
  'CANCELLED',
] as const;
export type RideRequestLifecycleStatus =
  (typeof rideRequestLifecycleStatuses)[number];

export const activeRideRequestLifecycleStatuses = [
  'REQUESTED',
  'MATCHED',
  'DRIVER_ARRIVING',
] as const;
export type ActiveRideRequestLifecycleStatus =
  (typeof activeRideRequestLifecycleStatuses)[number];

export const tripLifecycleStatuses = [
  'MATCHED',
  'DRIVER_ARRIVING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export type TripLifecycleStatus = (typeof tripLifecycleStatuses)[number];

export const activeTripLifecycleStatuses = [
  'MATCHED',
  'DRIVER_ARRIVING',
  'IN_PROGRESS',
] as const;
export type ActiveTripLifecycleStatus =
  (typeof activeTripLifecycleStatuses)[number];

export const pickupCodeVisibleTripLifecycleStatuses = [
  'MATCHED',
  'DRIVER_ARRIVING',
] as const;

export const allowedTripLifecycleTransitions: Record<
  TripLifecycleStatus,
  readonly TripLifecycleStatus[]
> = {
  MATCHED: ['DRIVER_ARRIVING', 'CANCELLED'],
  DRIVER_ARRIVING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const userRoles = ['rider', 'driver', 'admin', 'support', 'ops'] as const;
export type UserRole = (typeof userRoles)[number];
export type ApiUserRole = 'RIDER' | 'DRIVER' | 'ADMIN' | 'SUPPORT' | 'OPS';

export type Money = {
  amount: number;
  currency: 'XOF';
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type CoordinatePoint = Coordinates;

export type Place = {
  id: string;
  label: string;
  address: string;
  district?: string;
  coordinates?: Coordinates;
};

export type BurkinaPricingCityPreset = {
  id: ApiPricingCity;
  label: string;
  districtProfile: ApiDistrictProfile;
  zone: ApiMarketZone;
  pickup: Place & { coordinates: Coordinates };
  destination: Place & { coordinates: Coordinates };
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
};

export const burkinaPricingCityPresets: BurkinaPricingCityPreset[] = [
  {
    id: 'OUAGADOUGOU',
    label: 'Ouagadougou',
    districtProfile: 'UNIVERSITY',
    zone: 'URBAN_CORE',
    pickup: {
      id: 'ouaga-universite-joseph-ki-zerbo',
      label: 'Universite Joseph Ki-Zerbo',
      address: 'Universite Joseph Ki-Zerbo, Ouagadougou',
      district: 'Zogona',
      coordinates: {
        latitude: 12.3714,
        longitude: -1.5197,
      },
    },
    destination: {
      id: 'ouaga-2000',
      label: 'Ouaga 2000',
      address: 'Ouaga 2000, Ouagadougou',
      district: 'Ouaga 2000',
      coordinates: {
        latitude: 12.3274,
        longitude: -1.5339,
      },
    },
    estimatedDistanceKm: 5.8,
    estimatedDurationMinutes: 16,
  },
  {
    id: 'BOBO_DIOULASSO',
    label: 'Bobo-Dioulasso',
    districtProfile: 'MARKET_DENSE',
    zone: 'URBAN_EDGE',
    pickup: {
      id: 'bobo-gare-routiere',
      label: 'Gare Routiere de Bobo-Dioulasso',
      address: 'Gare Routiere de Bobo-Dioulasso',
      district: 'Belleville',
      coordinates: {
        latitude: 11.1858,
        longitude: -4.2864,
      },
    },
    destination: {
      id: 'bobo-sarfalao',
      label: 'Sarfalao',
      address: 'Sarfalao, Bobo-Dioulasso',
      district: 'Sarfalao',
      coordinates: {
        latitude: 11.1645,
        longitude: -4.2971,
      },
    },
    estimatedDistanceKm: 4.4,
    estimatedDurationMinutes: 14,
  },
  {
    id: 'KOUDOUGOU',
    label: 'Koudougou',
    districtProfile: 'INTERCITY_GATE',
    zone: 'SEMI_URBAN',
    pickup: {
      id: 'koudougou-gare-routiere',
      label: 'Gare routiere de Koudougou',
      address: 'Gare routiere de Koudougou',
      district: 'Centre',
      coordinates: {
        latitude: 12.2526,
        longitude: -2.3626,
      },
    },
    destination: {
      id: 'koudougou-universite-norbert-zongo',
      label: 'Universite Norbert Zongo',
      address: 'Universite Norbert Zongo, Koudougou',
      district: 'Dapoya',
      coordinates: {
        latitude: 12.2379,
        longitude: -2.4014,
      },
    },
    estimatedDistanceKm: 4.6,
    estimatedDurationMinutes: 12,
  },
  {
    id: 'BANFORA',
    label: 'Banfora',
    districtProfile: 'MARKET_DENSE',
    zone: 'SEMI_URBAN',
    pickup: {
      id: 'banfora-marche-central',
      label: 'Marche central de Banfora',
      address: 'Marche central de Banfora',
      district: 'Centre',
      coordinates: {
        latitude: 10.6333,
        longitude: -4.7667,
      },
    },
    destination: {
      id: 'banfora-gare-routiere',
      label: 'Gare routiere de Banfora',
      address: 'Gare routiere de Banfora',
      district: 'Lafiabougou',
      coordinates: {
        latitude: 10.6418,
        longitude: -4.7549,
      },
    },
    estimatedDistanceKm: 2.3,
    estimatedDurationMinutes: 8,
  },
  {
    id: 'OUAHIGOUYA',
    label: 'Ouahigouya',
    districtProfile: 'RESIDENTIAL_PERIPHERAL',
    zone: 'SEMI_URBAN',
    pickup: {
      id: 'ouahigouya-secteur-9',
      label: 'Secteur 9',
      address: 'Secteur 9, Ouahigouya',
      district: 'Secteur 9',
      coordinates: {
        latitude: 13.5766,
        longitude: -2.4216,
      },
    },
    destination: {
      id: 'ouahigouya-centre-ville',
      label: 'Centre-ville',
      address: 'Centre-ville, Ouahigouya',
      district: 'Centre',
      coordinates: {
        latitude: 13.5828,
        longitude: -2.4185,
      },
    },
    estimatedDistanceKm: 2.1,
    estimatedDurationMinutes: 9,
  },
];

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

export function resolveBurkinaPricingPresetForPlace(
  place: Pick<Place, 'address' | 'coordinates'>,
) {
  const normalizedAddress = normalizeSearchText(place.address);

  // Prefer an explicit city mention: it is the strongest signal available from
  // legacy clients that do not yet send a structured pricing city.
  const cityFromAddress = burkinaPricingCityPresets.find((city) =>
    normalizedAddress.includes(normalizeSearchText(city.label)),
  );

  if (cityFromAddress) {
    return cityFromAddress;
  }

  if (!place.coordinates) {
    return null;
  }

  // Coordinate fallback keeps pricing stable for saved places and voice
  // suggestions where the address can be short, user-written, or localized.
  return (
    burkinaPricingCityPresets.find((city) => {
      const distanceToPresetPickup = calculateDistanceKm(
        place.coordinates!,
        city.pickup.coordinates,
      );
      const distanceToPresetDestination = calculateDistanceKm(
        place.coordinates!,
        city.destination.coordinates,
      );

      return Math.min(distanceToPresetPickup, distanceToPresetDestination) < 8;
    }) ?? null
  );
}

export type RideOption = {
  id: string;
  category: VehicleCategory;
  tier: ServiceTier;
  title: string;
  etaMinutes: number;
  fare: number;
  capacity: string;
  accent: string;
  badge?: string;
  paymentMethods?: PaymentMethod[];
  safetyNote?: string;
  /** Driver net payout (after platform commission) */
  driverPayout?: number;
  /** True when demand multiplier > 1.0 */
  surgeActive?: boolean;
  /** Human-readable surge label e.g. "1.4x" — null when no surge */
  surgeLabel?: string | null;
  marketplace?: {
    availabilityLabel: string;
    nearbyDrivers: number;
    pickupRadiusKm: number;
    etaConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
    vehicleExamples: string[];
    pricePromise: string;
  };
  fareBreakdown?: {
    baseFare: number;
    bookingFee: number;
    demandMultiplier: number;
    priceWindow?: {
      min: number;
      max: number;
    };
    reasons?: string[];
    driverPickupDistanceIncludedInFare?: boolean;
    driverPickupDistancePolicy?: string;
  };
};

export type DriverOffer = {
  id: string;
  riderName: string;
  pickup: string;
  destination: string;
  category: VehicleCategory;
  fare: number;
  distanceKm: number;
  etaToPickupMinutes: number;
  driverPayout?: number;
  pickupCodeRequired?: boolean;
  pickupDistanceKm?: number | null;
  pickupDistanceSource?:
    | 'DRIVER_AND_PICKUP_COORDINATES'
    | 'DISPATCH_FALLBACK';
  reservationExpiresAt?: string | null;
  serviceRadiusKm?: number | null;
  dispatchScore?: number;
  matchedTier?: string | null;
  dispatchContextSummary?: string | null;
  offerConfidenceScore?: number | null;
  offerConfidenceLabel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'PRIORITY' | null;
  reservationWindowSeconds?: number | null;
  dispatchLearningSummary?: string | null;
};

export type AdminMetric = {
  label: string;
  value: string;
  trend: string;
};

export type VoiceSuggestion = {
  id: string;
  name: string;
  district: string;
  confidence: number;
};

export type BookingDraft = {
  pickup: Place | null;
  destination: Place | null;
  category: VehicleCategory;
  selectedTier?: ServiceTier;
  paymentMethod?: PaymentMethod;
  note?: string;
};

export const defaultBookingDraft: BookingDraft = {
  pickup: null,
  destination: null,
  category: 'motorcycle',
  paymentMethod: 'mobile-money',
};

export type PricingEstimate = {
  currency: 'XOF';
  market: string;
  vehicleType: ApiVehicleType;
  serviceTier: ApiServiceTier;
  paymentMethod: ApiPaymentMethod;
  zone: ApiMarketZone;
  city?: ApiPricingCity;
  districtProfile?: ApiDistrictProfile;
  demandLevel: ApiDemandLevel;
  distanceKm: number;
  durationMinutes: number;
  estimatedFare: number;
  fareBreakdown: {
    baseFare: number;
    distanceCharge: number;
    timeCharge: number;
    bookingFee: number;
    subtotalBeforeDemand: number;
    demandMultiplier: number;
    surgeAmount: number;
    cashlessDiscount: number;
    paymentProcessingFeeIncluded: number;
    minimumFareApplied: boolean;
    localAdjustmentAmount: number;
    trafficAdjustmentAmount: number;
    weatherAdjustmentAmount: number;
    roadConditionAdjustmentAmount: number;
    availabilityAdjustmentAmount: number;
    affordabilitySupportAmount: number;
    priceWindow: {
      min: number;
      max: number;
    };
    reasons: string[];
    surgeCapApplied: boolean;
    supplyDemandRatio: number | null;
  };
  operatingContext: {
    trafficLevel: ApiTrafficLevel;
    weatherCondition: ApiWeatherCondition;
    roadCondition: ApiRoadCondition;
    supplyPressureLevel: 'LOW' | 'BALANCED' | 'TIGHT' | 'CRITICAL';
    availabilityScore: number;
  };
  driverEconomics: {
    commissionRate: number;
    commissionAmount: number;
    driverPayout: number;
  };
  trustAndPolicy: {
    upfrontPricing: boolean;
    pickupCodeRequired: boolean;
    liveTripSharingEnabled: boolean;
    cashEnabled: boolean;
    burkinaLocalizedPricing: boolean;
    priceReviewAvailable: boolean;
    priceLockWindowSeconds: number;
    driverPickupDistanceIncludedInFare: boolean;
    driverPickupDistancePolicy: string;
  };
};

export function hasDefinedCoordinates(location: {
  latitude?: number | null;
  longitude?: number | null;
}) {
  return (
    location.latitude !== undefined &&
    location.latitude !== null &&
    location.longitude !== undefined &&
    location.longitude !== null
  );
}

export function isActiveRideRequestLifecycleStatus(
  status: string,
): status is ActiveRideRequestLifecycleStatus {
  return activeRideRequestLifecycleStatuses.includes(
    status as ActiveRideRequestLifecycleStatus,
  );
}

export function isActiveTripLifecycleStatus(
  status: string,
): status is ActiveTripLifecycleStatus {
  return activeTripLifecycleStatuses.includes(status as ActiveTripLifecycleStatus);
}

export function isPickupCodeVisibleTripLifecycleStatus(
  status: string,
): status is (typeof pickupCodeVisibleTripLifecycleStatuses)[number] {
  return pickupCodeVisibleTripLifecycleStatuses.includes(
    status as (typeof pickupCodeVisibleTripLifecycleStatuses)[number],
  );
}

export function canTransitionTripLifecycleStatus(
  currentStatus: TripLifecycleStatus,
  nextStatus: TripLifecycleStatus,
) {
  return allowedTripLifecycleTransitions[currentStatus].includes(nextStatus);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistanceKm(
  start: CoordinatePoint,
  end: CoordinatePoint,
) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusKm * arc;
}

export function roundDistanceKm(value: number) {
  return Math.max(0.8, Math.round(value * 10) / 10);
}

// Road distance factor for African urban grids — actual road distance is
// typically 25-35% longer than Haversine straight-line in Ouagadougou due
// to grid streets, roundabouts, and non-straight routes.
const ROAD_DETOUR_FACTOR = 1.3;

// Ouagadougou peak-hour traffic multipliers (local field research):
// Morning rush 7-9h and evening rush 17-20h reduce effective speed by ~30%
// Lunchtime 12-14h reduces by ~15%
function resolveTrafficMultiplier(hour?: number): number {
  if (hour === undefined) return 1;
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 20)) return 1.3;
  if (hour >= 12 && hour < 14) return 1.15;
  return 1;
}

export function estimateDurationMinutes(
  distanceKm: number,
  zone?: 'URBAN_CORE' | 'URBAN_EDGE' | 'SEMI_URBAN',
  options?: { hour?: number },
) {
  const averageSpeedByZone = {
    URBAN_CORE: 22,
    URBAN_EDGE: 26,
    SEMI_URBAN: 30,
  } as const;
  const resolvedZone = zone ?? 'URBAN_CORE';
  const baseSpeedKmh = averageSpeedByZone[resolvedZone];
  // Apply road detour factor: straight-line → estimated road distance
  const roadDistanceKm = distanceKm * ROAD_DETOUR_FACTOR;
  // Apply peak-hour traffic congestion factor
  const trafficMultiplier = resolveTrafficMultiplier(options?.hour);
  const effectiveSpeedKmh = baseSpeedKmh / trafficMultiplier;
  const rollingMinutes = (roadDistanceKm / effectiveSpeedKmh) * 60;
  const boardingBufferMinutes = resolvedZone === 'URBAN_CORE' ? 4 : 3;

  return Math.max(4, Math.round(rollingMinutes + boardingBufferMinutes));
}
