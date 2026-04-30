import { Injectable } from '@nestjs/common';
import { ServiceTier, VehicleType } from '@prisma/client';
import {
  summarizeDispatchLearning,
  type DispatchBehaviorSignal,
} from './dispatch-engine';

export type DriverOfferViewModel = {
  id: string;
  riderName: string;
  pickup: string;
  destination: string;
  category: 'motorcycle' | 'car';
  fare: number;
  distanceKm: number;
  etaToPickupMinutes: number;
  driverPayout: number;
  pickupCodeRequired: boolean;
  pickupDistanceKm: number | null;
  pickupDistanceSource: 'DISPATCH_FALLBACK' | 'DRIVER_AND_PICKUP_COORDINATES';
  reservationExpiresAt: string | null;
  serviceRadiusKm: number | null;
  dispatchScore: number;
  matchedTier: ServiceTier | null;
  dispatchContextSummary: string;
  offerConfidenceScore: number;
  offerConfidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH' | 'PRIORITY';
  reservationWindowSeconds: number;
  dispatchLearningSummary: string;
};

export type DriverOfferProjectionInput = {
  id: string;
  riderName: string;
  pickup: string;
  destination: string;
  requestedVehicleType: VehicleType;
  fare: number;
  estimatedTripDistanceKm: number;
  ageMinutes: number;
  pickupDistanceKm: number | null;
  serviceRadiusKm: number | null;
  matchedTier: ServiceTier | null;
  dispatchScore: number;
  offerConfidenceScore: number;
  offerConfidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH' | 'PRIORITY';
  reservationExpiresAt: string | null;
  reservationWindowSeconds: number;
  availabilityScore: number;
  demandLevel: 'NORMAL' | 'HIGH' | 'PEAK';
  trafficLevel: 'FREE_FLOW' | 'MODERATE' | 'HEAVY' | 'GRIDLOCK';
  dispatchBehavior: DispatchBehaviorSignal;
};

@Injectable()
export class DriverOfferProjector {
  project(input: DriverOfferProjectionInput): DriverOfferViewModel {
    return {
      id: input.id,
      riderName: input.riderName,
      pickup: input.pickup,
      destination: input.destination,
      category:
        input.requestedVehicleType === VehicleType.MOTORCYCLE
          ? 'motorcycle'
          : 'car',
      fare: input.fare,
      distanceKm: input.estimatedTripDistanceKm,
      etaToPickupMinutes: this.resolvePickupEtaMinutes(
        input.pickupDistanceKm,
        input.ageMinutes,
      ),
      driverPayout: Math.round(input.fare * 0.82),
      pickupCodeRequired: true,
      pickupDistanceKm: input.pickupDistanceKm,
      pickupDistanceSource:
        input.pickupDistanceKm === null
          ? 'DISPATCH_FALLBACK'
          : 'DRIVER_AND_PICKUP_COORDINATES',
      reservationExpiresAt: input.reservationExpiresAt,
      serviceRadiusKm: input.serviceRadiusKm,
      dispatchScore: input.dispatchScore,
      matchedTier: input.matchedTier,
      dispatchContextSummary: this.buildDispatchContextSummary(
        input.demandLevel,
        input.trafficLevel,
        input.availabilityScore,
      ),
      offerConfidenceScore: input.offerConfidenceScore,
      offerConfidenceLabel: input.offerConfidenceLabel,
      reservationWindowSeconds: input.reservationWindowSeconds,
      dispatchLearningSummary: summarizeDispatchLearning({
        acceptanceRate: input.dispatchBehavior.acceptanceRate,
        declineRate: input.dispatchBehavior.declineRate,
        expirationRate: input.dispatchBehavior.expirationRate,
        confidenceScore: input.offerConfidenceScore,
        signalFreshness: input.dispatchBehavior.signalFreshness,
      }),
    };
  }

  comparePriority(
    left: DriverOfferViewModel,
    right: DriverOfferViewModel,
  ): number {
    if (right.dispatchScore !== left.dispatchScore) {
      return right.dispatchScore - left.dispatchScore;
    }

    const leftPickupDistance = left.pickupDistanceKm ?? Number.MAX_SAFE_INTEGER;
    const rightPickupDistance =
      right.pickupDistanceKm ?? Number.MAX_SAFE_INTEGER;

    if (leftPickupDistance !== rightPickupDistance) {
      return leftPickupDistance - rightPickupDistance;
    }

    return right.fare - left.fare;
  }

  private resolvePickupEtaMinutes(
    pickupDistanceKm: number | null,
    ageMinutes: number,
  ) {
    if (pickupDistanceKm === null) {
      return Math.max(3, 3 + Math.floor(ageMinutes / 2));
    }

    return Math.max(2, Math.min(18, Math.round(pickupDistanceKm * 3)));
  }

  private buildDispatchContextSummary(
    demandLevel: DriverOfferProjectionInput['demandLevel'],
    trafficLevel: DriverOfferProjectionInput['trafficLevel'],
    availabilityScore: number,
  ) {
    return `${demandLevel} - ${trafficLevel} - dispo ${availabilityScore}/100`;
  }
}
