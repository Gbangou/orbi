import { Injectable } from '@nestjs/common';
import { ServiceTier, VehicleType } from '@prisma/client';
import {
  calculateMarketplaceDispatchPriority,
  calculateMarketplaceFairnessSignal,
  summarizeDispatchLearning,
  type DispatchBehaviorSignal,
  type FairnessSignalLabel,
  type MarketplaceDispatchPrioritySignal,
} from './dispatch-engine';
import { calculateDriverEconomics } from '../../common/economics/driver-commission';

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
  businessPriorityScore: number;
  businessPriorityLabel: MarketplaceDispatchPrioritySignal['label'];
  businessPrioritySummary: string;
  matchedTier: ServiceTier | null;
  dispatchContextSummary: string;
  offerConfidenceScore: number;
  offerConfidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH' | 'PRIORITY';
  reservationWindowSeconds: number;
  dispatchLearningSummary: string;
  fairnessScore: number;
  fairnessLabel: FairnessSignalLabel;
  fairnessSummary: string;
  fairnessBreakdown: {
    riderAccessibilityScore: number;
    driverPayoutScore: number;
    opsMarginScore: number;
  };
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
  supplyPressureLevel: 'LOW' | 'BALANCED' | 'TIGHT' | 'CRITICAL';
  demandLevel: 'NORMAL' | 'HIGH' | 'PEAK';
  trafficLevel: 'FREE_FLOW' | 'MODERATE' | 'HEAVY' | 'GRIDLOCK';
  dispatchBehavior: DispatchBehaviorSignal;
  driverOnboardingDays?: number;
  driverCreatedAt?: Date | string | null;
};

@Injectable()
export class DriverOfferProjector {
  project(input: DriverOfferProjectionInput): DriverOfferViewModel {
    const driverPayout = calculateDriverEconomics(input.fare, {
      driverOnboardingDays: input.driverOnboardingDays,
      driverCreatedAt: input.driverCreatedAt,
    }).driverPayout;
    const fairness = calculateMarketplaceFairnessSignal({
      fare: input.fare,
      driverPayout,
      estimatedTripDistanceKm: input.estimatedTripDistanceKm,
      pickupDistanceKm: input.pickupDistanceKm,
      vehicleType:
        input.requestedVehicleType === VehicleType.MOTORCYCLE
          ? 'MOTORCYCLE'
        : 'CAR',
    });
    const businessPriority = calculateMarketplaceDispatchPriority({
      dispatchScore: input.dispatchScore,
      offerConfidenceScore: input.offerConfidenceScore,
      behavioralScore: input.dispatchBehavior.score,
      fairnessScore: fairness.score,
      pickupDistanceKm: input.pickupDistanceKm,
      estimatedTripDistanceKm: input.estimatedTripDistanceKm,
      supplyPressureLevel: input.supplyPressureLevel,
    });

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
      driverPayout,
      pickupCodeRequired: false,
      pickupDistanceKm: input.pickupDistanceKm,
      pickupDistanceSource:
        input.pickupDistanceKm === null
          ? 'DISPATCH_FALLBACK'
          : 'DRIVER_AND_PICKUP_COORDINATES',
      reservationExpiresAt: input.reservationExpiresAt,
      serviceRadiusKm: input.serviceRadiusKm,
      dispatchScore: input.dispatchScore,
      businessPriorityScore: businessPriority.score,
      businessPriorityLabel: businessPriority.label,
      businessPrioritySummary: businessPriority.summary,
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
      fairnessScore: fairness.score,
      fairnessLabel: fairness.label,
      fairnessSummary: fairness.summary,
      fairnessBreakdown: {
        riderAccessibilityScore: fairness.riderAccessibilityScore,
        driverPayoutScore: fairness.driverPayoutScore,
        opsMarginScore: fairness.opsMarginScore,
      },
    };
  }

  comparePriority(
    left: DriverOfferViewModel,
    right: DriverOfferViewModel,
  ): number {
    if (right.businessPriorityScore !== left.businessPriorityScore) {
      return right.businessPriorityScore - left.businessPriorityScore;
    }

    if (right.dispatchScore !== left.dispatchScore) {
      return right.dispatchScore - left.dispatchScore;
    }

    const leftPickupDistance = left.pickupDistanceKm ?? Number.MAX_SAFE_INTEGER;
    const rightPickupDistance =
      right.pickupDistanceKm ?? Number.MAX_SAFE_INTEGER;

    if (leftPickupDistance !== rightPickupDistance) {
      return leftPickupDistance - rightPickupDistance;
    }

    if (right.fairnessScore !== left.fairnessScore) {
      return right.fairnessScore - left.fairnessScore;
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
