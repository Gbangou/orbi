import { BadRequestException } from '@nestjs/common';
import { resolveBurkinaPricingPresetForPlace } from '@orbi/domain';
import {
  calculateDistanceKm,
  estimateDurationMinutes,
  hasDefinedCoordinates,
  roundDistanceKm,
} from '../../common/geo/route-metrics';
import { RoutingService } from '../../core/routing/routing.service';
import { CreateRideRequestDto } from './dto/create-ride-request.dto';

const SERVICE_TIERS_BY_VEHICLE_TYPE = {
  MOTORCYCLE: ['MOTO_STANDARD'],
  CAR: ['CAR_STANDARD', 'CAR_COMFORT', 'CAR_XL'],
} as const;

export type RideRequestRouteMetrics = {
  distanceKm: number;
  durationMinutes: number;
  source: 'SERVER_ROUTE' | 'SERVER_COORDINATES' | 'CLIENT_ESTIMATE';
};

export function assertRideRequestPayloadConsistency(
  payload: CreateRideRequestDto,
) {
  const allowedServiceTiers = SERVICE_TIERS_BY_VEHICLE_TYPE[
    payload.requestedVehicleType
  ] as readonly string[];

  if (
    payload.requestedServiceTier &&
    !allowedServiceTiers.includes(payload.requestedServiceTier)
  ) {
    throw new BadRequestException(
      'The requested service tier is not compatible with the selected vehicle type.',
    );
  }

  if (
    (payload.pickupLatitude === undefined) !==
    (payload.pickupLongitude === undefined)
  ) {
    throw new BadRequestException(
      'Pickup latitude and longitude must be provided together.',
    );
  }

  if (
    (payload.destinationLatitude === undefined) !==
    (payload.destinationLongitude === undefined)
  ) {
    throw new BadRequestException(
      'Destination latitude and longitude must be provided together.',
    );
  }
}

export function resolveRideRequestRouteMetrics(
  payload: CreateRideRequestDto,
): RideRequestRouteMetrics {
  if (
    hasDefinedCoordinates({
      latitude: payload.pickupLatitude,
      longitude: payload.pickupLongitude,
    }) &&
    hasDefinedCoordinates({
      latitude: payload.destinationLatitude,
      longitude: payload.destinationLongitude,
    })
  ) {
    const distanceKm = roundDistanceKm(
      calculateDistanceKm(
        {
          latitude: payload.pickupLatitude as number,
          longitude: payload.pickupLongitude as number,
        },
        {
          latitude: payload.destinationLatitude as number,
          longitude: payload.destinationLongitude as number,
        },
      ),
    );

    return {
      distanceKm,
      durationMinutes: estimateDurationMinutes(
        distanceKm,
        payload.pickupAreaType,
        { hour: new Date().getHours() },
      ),
      source: 'SERVER_COORDINATES',
    };
  }

  return {
    distanceKm: payload.estimatedDistanceKm,
    durationMinutes: payload.estimatedDurationMinutes,
    source: 'CLIENT_ESTIMATE',
  };
}

export async function resolveRideRequestRouteMetricsWithRouting(
  payload: CreateRideRequestDto,
  routingService?: RoutingService,
): Promise<RideRequestRouteMetrics> {
  if (
    routingService &&
    hasDefinedCoordinates({
      latitude: payload.pickupLatitude,
      longitude: payload.pickupLongitude,
    }) &&
    hasDefinedCoordinates({
      latitude: payload.destinationLatitude,
      longitude: payload.destinationLongitude,
    })
  ) {
    const route = await routingService
      .getRoute(
        {
          latitude: payload.pickupLatitude as number,
          longitude: payload.pickupLongitude as number,
        },
        {
          latitude: payload.destinationLatitude as number,
          longitude: payload.destinationLongitude as number,
        },
      )
      .catch(() => null);

    if (route) {
      return {
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
        source:
          route.source === 'osrm'
            ? 'SERVER_ROUTE'
            : 'SERVER_COORDINATES',
      };
    }
  }

  return resolveRideRequestRouteMetrics(payload);
}

export function inferRideRequestPeakHour(date = new Date()) {
  const hour = date.getHours();

  return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 20);
}

export function inferRideRequestTrafficLevel(
  routeMetrics: Pick<RideRequestRouteMetrics, 'distanceKm' | 'durationMinutes'>,
  pickupAreaType?: CreateRideRequestDto['pickupAreaType'],
) {
  const minutesPerKm =
    routeMetrics.distanceKm > 0
      ? routeMetrics.durationMinutes / routeMetrics.distanceKm
      : routeMetrics.durationMinutes;

  if (
    minutesPerKm >= 4.2 ||
    (pickupAreaType === 'URBAN_CORE' && routeMetrics.durationMinutes >= 22)
  ) {
    return 'GRIDLOCK' as const;
  }

  if (
    minutesPerKm >= 3.2 ||
    (pickupAreaType !== 'SEMI_URBAN' && routeMetrics.durationMinutes >= 16)
  ) {
    return 'HEAVY' as const;
  }

  if (minutesPerKm >= 2.2 || routeMetrics.durationMinutes >= 10) {
    return 'MODERATE' as const;
  }

  return 'FREE_FLOW' as const;
}

export function inferRideRequestRoadCondition(
  routeMetrics: Pick<RideRequestRouteMetrics, 'distanceKm' | 'durationMinutes'>,
  pickupAreaType?: CreateRideRequestDto['pickupAreaType'],
) {
  const minutesPerKm =
    routeMetrics.distanceKm > 0
      ? routeMetrics.durationMinutes / routeMetrics.distanceKm
      : routeMetrics.durationMinutes;

  if (
    minutesPerKm >= 4.5 ||
    (pickupAreaType === 'SEMI_URBAN' && routeMetrics.durationMinutes >= 24)
  ) {
    return 'BLOCKED' as const;
  }

  if (minutesPerKm >= 3.4) {
    return 'CONGESTED' as const;
  }

  if (minutesPerKm >= 2.4) {
    return 'SLOW' as const;
  }

  return 'OPEN' as const;
}

export function resolveRideRequestPricingGeography(
  payload: Pick<
    CreateRideRequestDto,
    | 'pickupAddress'
    | 'destinationAddress'
    | 'pickupLatitude'
    | 'pickupLongitude'
    | 'destinationLatitude'
    | 'destinationLongitude'
    | 'pickupAreaType'
    | 'city'
    | 'districtProfile'
  >,
) {
  const searchableText =
    `${payload.pickupAddress} ${payload.destinationAddress}`.toLowerCase();
  const inferredPreset =
    resolveBurkinaPricingPresetForPlace({
      address: payload.pickupAddress,
      coordinates:
        payload.pickupLatitude !== undefined &&
        payload.pickupLongitude !== undefined
          ? {
              latitude: payload.pickupLatitude,
              longitude: payload.pickupLongitude,
            }
          : undefined,
    }) ??
    resolveBurkinaPricingPresetForPlace({
      address: payload.destinationAddress,
      coordinates:
        payload.destinationLatitude !== undefined &&
        payload.destinationLongitude !== undefined
          ? {
              latitude: payload.destinationLatitude,
              longitude: payload.destinationLongitude,
            }
          : undefined,
    });
  const city = payload.city ?? inferredPreset?.id ?? 'OUAGADOUGOU';

  // Structured client values win, then shared Burkina presets, then conservative
  // lexical heuristics for older clients that only submit plain addresses.
  const districtProfile =
    payload.districtProfile ??
    inferredPreset?.districtProfile ??
    (searchableText.includes('universite') || searchableText.includes('campus')
      ? 'UNIVERSITY'
      : searchableText.includes('aeroport')
        ? 'AIRPORT'
        : searchableText.includes('marche') || searchableText.includes('gare')
          ? 'MARKET_DENSE'
          : payload.pickupAreaType === 'SEMI_URBAN'
            ? 'RESIDENTIAL_PERIPHERAL'
            : payload.pickupAreaType === 'URBAN_CORE'
              ? 'CBD'
              : 'RESIDENTIAL_STANDARD');

  return {
    city,
    districtProfile,
  };
}

export function buildRideRequestCreateData(
  payload: CreateRideRequestDto,
  estimatedFare: number,
  routeMetrics: Pick<RideRequestRouteMetrics, 'distanceKm' | 'durationMinutes'>,
) {
  const normalizedNotes = payload.notes?.trim();
  const pricingGeography = resolveRideRequestPricingGeography(payload);

  return {
    riderId: payload.riderId,
    pickupAddress: payload.pickupAddress.trim(),
    pickupLatitude: payload.pickupLatitude,
    pickupLongitude: payload.pickupLongitude,
    destinationAddress: payload.destinationAddress.trim(),
    destinationLatitude: payload.destinationLatitude,
    destinationLongitude: payload.destinationLongitude,
    requestedVehicleType: payload.requestedVehicleType,
    requestedServiceTier: payload.requestedServiceTier,
    paymentMethod: payload.paymentMethod ?? 'MOBILE_MONEY',
    pricingCity: pricingGeography.city,
    districtProfile: pricingGeography.districtProfile,
    estimatedFare,
    estimatedDistanceKm: routeMetrics.distanceKm,
    estimatedDurationMinutes: routeMetrics.durationMinutes,
    notes: normalizedNotes ? normalizedNotes : undefined,
    currency: 'XOF',
    status: 'REQUESTED' as const,
  };
}
