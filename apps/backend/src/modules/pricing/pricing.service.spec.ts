import { ServiceTier } from '@prisma/client';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  function createService() {
    const prisma = {
      pricingRule: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    return {
      prisma,
      service: new PricingService(prisma as never),
    };
  }

  it('computes a lower onboarding commission for new drivers', async () => {
    const { service } = createService();

    const quote = await service.quote({
      vehicleType: 'MOTORCYCLE',
      serviceTier: ServiceTier.MOTO_STANDARD,
      distanceKm: 5.8,
      durationMinutes: 16,
      paymentMethod: 'MOBILE_MONEY',
      zone: 'URBAN_CORE',
      city: 'OUAGADOUGOU',
      districtProfile: 'UNIVERSITY',
      driverOnboardingDays: 12,
      openRequestCount: 10,
      activeDriverCount: 4,
      isPeakHour: true,
    });

    expect(quote.driverEconomics.commissionRate).toBe(0.1);
    expect(quote.estimatedFare).toBeGreaterThan(0);
    expect(quote.fareBreakdown.demandMultiplier).toBeGreaterThan(1);
    expect(quote.fareBreakdown.priceWindow.min).toBeLessThan(
      quote.estimatedFare,
    );
    expect(quote.fareBreakdown.reasons.length).toBeGreaterThan(0);
    expect(quote.fareBreakdown.localAdjustmentAmount).toBeLessThanOrEqual(0);
    expect(quote.trustAndPolicy.pickupCodeRequired).toBe(true);
    expect(quote.trustAndPolicy.burkinaLocalizedPricing).toBe(true);
    expect(quote.trustAndPolicy.priceReviewAvailable).toBe(true);
  });

  it('uses fallback rate cards when no pricing rule is found', async () => {
    const { service } = createService();

    const quote = await service.quote({
      vehicleType: 'CAR',
      distanceKm: 3,
      durationMinutes: 10,
      paymentMethod: 'CASH',
      zone: 'SEMI_URBAN',
      city: 'BOBO_DIOULASSO',
      districtProfile: 'RESIDENTIAL_PERIPHERAL',
    });

    expect(quote.serviceTier).toBe(ServiceTier.CAR_STANDARD);
    expect(quote.fareBreakdown.baseFare).toBe(850);
    expect(quote.fareBreakdown.paymentProcessingFeeIncluded).toBe(0);
    expect(quote.fareBreakdown.minimumFareApplied).toBe(false);
    expect(quote.fareBreakdown.localAdjustmentAmount).toBeLessThan(0);
    expect(quote.driverEconomics.commissionRate).toBe(0.18);
  });

  it('marks minimum fare as applied only when protection lifts a low fare', async () => {
    const { service } = createService();

    const quote = await service.quote({
      vehicleType: 'CAR',
      distanceKm: 0.5,
      durationMinutes: 2,
      paymentMethod: 'CASH',
      zone: 'SEMI_URBAN',
      city: 'BOBO_DIOULASSO',
      districtProfile: 'RESIDENTIAL_PERIPHERAL',
    });

    expect(quote.estimatedFare).toBe(1300);
    expect(quote.fareBreakdown.minimumFareApplied).toBe(true);
  });

  it('does not mark minimum fare as applied when local adjustments drive the fare', async () => {
    const { service } = createService();

    const quote = await service.quote({
      vehicleType: 'CAR',
      distanceKm: 10,
      durationMinutes: 20,
      paymentMethod: 'CASH',
      zone: 'URBAN_CORE',
      city: 'OUAGADOUGOU',
      districtProfile: 'CBD',
    });

    expect(quote.estimatedFare).toBeGreaterThan(1800);
    expect(quote.fareBreakdown.localAdjustmentAmount).toBeGreaterThan(0);
    expect(quote.fareBreakdown.minimumFareApplied).toBe(false);
  });

  it('caps demand multipliers to avoid abrupt surge pricing', async () => {
    const { service } = createService();

    const quote = await service.quote({
      vehicleType: 'MOTORCYCLE',
      distanceKm: 2.4,
      durationMinutes: 8,
      paymentMethod: 'MOBILE_MONEY',
      zone: 'URBAN_CORE',
      demandLevel: 'PEAK',
      isPeakHour: true,
      city: 'OUAGADOUGOU',
      districtProfile: 'CBD',
    });

    expect(quote.fareBreakdown.demandMultiplier).toBe(1.35);
    expect(quote.fareBreakdown.surgeCapApplied).toBe(true);
  });

  it('applies affordability support for motorcycle rides in peripheral Burkina zones', async () => {
    const { service } = createService();

    const quote = await service.quote({
      vehicleType: 'MOTORCYCLE',
      distanceKm: 6,
      durationMinutes: 18,
      paymentMethod: 'MOBILE_MONEY',
      zone: 'SEMI_URBAN',
      city: 'OUAHIGOUYA',
      districtProfile: 'RESIDENTIAL_PERIPHERAL',
    });

    expect(quote.fareBreakdown.affordabilitySupportAmount).toBeGreaterThan(0);
  });

  it('adds contextual pricing signals for traffic, weather, road pressure and availability', async () => {
    const { service } = createService();

    const quote = await service.quote({
      vehicleType: 'CAR',
      distanceKm: 9.5,
      durationMinutes: 28,
      paymentMethod: 'MOBILE_MONEY',
      zone: 'URBAN_CORE',
      city: 'OUAGADOUGOU',
      districtProfile: 'CBD',
      isPeakHour: true,
      trafficLevel: 'GRIDLOCK',
      weatherCondition: 'RAIN',
      roadCondition: 'BLOCKED',
      activeDriverCount: 2,
      openRequestCount: 8,
    });

    expect(quote.fareBreakdown.trafficAdjustmentAmount).toBeGreaterThan(0);
    expect(quote.fareBreakdown.weatherAdjustmentAmount).toBeGreaterThan(0);
    expect(quote.fareBreakdown.roadConditionAdjustmentAmount).toBeGreaterThan(
      0,
    );
    expect(quote.fareBreakdown.availabilityAdjustmentAmount).toBeGreaterThan(0);
    expect(quote.operatingContext.trafficLevel).toBe('GRIDLOCK');
    expect(quote.operatingContext.weatherCondition).toBe('RAIN');
    expect(quote.operatingContext.roadCondition).toBe('BLOCKED');
    expect(quote.operatingContext.supplyPressureLevel).toBe('CRITICAL');
    expect(quote.operatingContext.availabilityScore).toBeLessThan(70);
    expect(
      quote.fareBreakdown.reasons.some((reason) => reason.includes('trafic')),
    ).toBe(true);
  });
});
