import { Injectable } from '@nestjs/common';
import { roundXofForCashOperations } from '@orbi/domain';
import type { RideRequestRouteMetrics } from './ride-request-creation.policy';

type OperatingContextSnapshot = {
  demandLevel: string;
  trafficLevel: string;
  weatherCondition: string;
  roadCondition: string;
};

@Injectable()
export class RideRequestProjector {
  projectCreatedRideRequest(input: {
    rideRequest: {
      id: string;
      status: string;
      pickupAddress: string;
      destinationAddress: string;
      estimatedFare?: unknown;
      estimatedDistanceKm?: unknown;
      estimatedDurationMinutes?: number | null;
      requestedVehicleType: 'MOTORCYCLE' | 'CAR';
      requestedServiceTier?: string | null;
      paymentMethod?: string | null;
      pricingCity?: string | null;
      districtProfile?: string | null;
      createdAt?: Date;
    };
    routeMetrics: RideRequestRouteMetrics;
    operatingContext: OperatingContextSnapshot;
    pricing: {
      estimatedFare: number;
      fareBreakdown?: {
        reasons?: string[];
      } | null;
    };
  }) {
    return {
      id: input.rideRequest.id,
      status: input.rideRequest.status,
      pickupAddress: input.rideRequest.pickupAddress,
      destinationAddress: input.rideRequest.destinationAddress,
      estimatedFare: this.toRoundedMoneyAmount(
        input.rideRequest.estimatedFare ?? input.pricing.estimatedFare,
      ),
      estimatedDistanceKm: this.toNumber(input.rideRequest.estimatedDistanceKm),
      estimatedDurationMinutes: input.rideRequest.estimatedDurationMinutes,
      routeMetricsSource: input.routeMetrics.source,
      requestedVehicleType: input.rideRequest.requestedVehicleType,
      requestedServiceTier: input.rideRequest.requestedServiceTier ?? null,
      paymentMethod: input.rideRequest.paymentMethod ?? 'MOBILE_MONEY',
      city: input.rideRequest.pricingCity ?? null,
      districtProfile: input.rideRequest.districtProfile ?? null,
      createdAt: input.rideRequest.createdAt?.toISOString(),
      pricingContextSummary: `${input.operatingContext.demandLevel} - ${input.operatingContext.trafficLevel} - ${input.operatingContext.roadCondition}`,
      bookingReadinessSummary: this.buildBookingReadinessSummary(
        input.routeMetrics.source,
        input.operatingContext,
      ),
      pricingReason: input.pricing.fareBreakdown?.reasons?.[0] ?? null,
    };
  }

  private buildBookingReadinessSummary(
    routeMetricsSource: RideRequestRouteMetrics['source'],
    operatingContext: OperatingContextSnapshot,
  ) {
    const metricsSummary =
      routeMetricsSource === 'SERVER_COORDINATES'
        ? 'Metriques consolidees depuis les coordonnees serveur.'
        : 'Metriques conservees depuis l estimation client.';

    return `${metricsSummary} Contexte ${operatingContext.demandLevel.toLowerCase()} avec trafic ${operatingContext.trafficLevel.toLowerCase()} et voirie ${operatingContext.roadCondition.toLowerCase()}.`;
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    return Number(value);
  }

  private toRoundedMoneyAmount(value: unknown) {
    const amount = this.toNumber(value);

    return amount === null ? null : roundXofForCashOperations(amount).amount;
  }
}
