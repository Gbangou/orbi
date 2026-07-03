import { Injectable, Optional } from '@nestjs/common';
import { ServiceTier, VehicleType } from '@prisma/client';
import { RedisCacheService } from '../../core/cache/redis-cache.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RoutingService } from '../../core/routing/routing.service';
import { EstimatePricingQueryDto } from './dto/estimate-pricing-query.dto';

type PricingQuoteInput = {
  vehicleType: 'MOTORCYCLE' | 'CAR';
  serviceTier?: ServiceTier;
  distanceKm: number;
  durationMinutes: number;
  paymentMethod?: 'MOBILE_MONEY' | 'CASH' | 'WALLET';
  zone?: 'URBAN_CORE' | 'URBAN_EDGE' | 'SEMI_URBAN';
  city?:
    | 'OUAGADOUGOU'
    | 'BOBO_DIOULASSO'
    | 'KOUDOUGOU'
    | 'BANFORA'
    | 'OUAHIGOUYA';
  districtProfile?:
    | 'CBD'
    | 'UNIVERSITY'
    | 'GOVERNMENT'
    | 'AIRPORT'
    | 'RESIDENTIAL_STANDARD'
    | 'RESIDENTIAL_PERIPHERAL'
    | 'MARKET_DENSE'
    | 'INDUSTRIAL'
    | 'INTERCITY_GATE';
  demandLevel?: 'NORMAL' | 'HIGH' | 'PEAK';
  trafficLevel?: 'FREE_FLOW' | 'MODERATE' | 'HEAVY' | 'GRIDLOCK';
  weatherCondition?: 'CLEAR' | 'HEAT' | 'WIND' | 'DUST' | 'RAIN' | 'STORM';
  roadCondition?: 'OPEN' | 'SLOW' | 'CONGESTED' | 'BLOCKED';
  isPeakHour?: boolean;
  activeDriverCount?: number;
  openRequestCount?: number;
  driverOnboardingDays?: number;
};

type OperatingContextInput = Pick<
  PricingQuoteInput,
  | 'vehicleType'
  | 'zone'
  | 'demandLevel'
  | 'trafficLevel'
  | 'weatherCondition'
  | 'roadCondition'
  | 'isPeakHour'
  | 'activeDriverCount'
  | 'openRequestCount'
>;

type RateCard = {
  serviceTier: ServiceTier;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  bookingFee: number;
  minimumFare: number;
};

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    @Optional() private readonly routingService?: RoutingService,
  ) {}

  async listRules() {
    return this.cache.getOrSet(
      'pricing:rules:active',
      () => this.fetchRulesFromDb(),
      60, // TTL 60 secondes — règles rarement modifiées
    );
  }

  async invalidatePricingCache(): Promise<void> {
    await this.cache.invalidatePattern('pricing:*');
  }

  private fetchRulesFromDb() {
    return this.prisma.pricingRule.findMany({
      where: { isActive: true },
      orderBy: [{ vehicleType: 'asc' }, { priority: 'asc' }],
    });
  }

  async estimate(query: EstimatePricingQueryDto) {
    return this.quote({
      vehicleType: query.vehicleType,
      serviceTier: query.serviceTier as ServiceTier | undefined,
      distanceKm: query.distanceKm,
      durationMinutes: query.durationMinutes,
      paymentMethod: (query.paymentMethod ??
        'MOBILE_MONEY') as PricingQuoteInput['paymentMethod'],
      zone: (query.zone ?? 'URBAN_CORE') as PricingQuoteInput['zone'],
      city: (query.city ?? 'OUAGADOUGOU') as PricingQuoteInput['city'],
      districtProfile: (query.districtProfile ??
        'RESIDENTIAL_STANDARD') as PricingQuoteInput['districtProfile'],
      demandLevel: query.demandLevel,
      trafficLevel: (query.trafficLevel ??
        'MODERATE') as PricingQuoteInput['trafficLevel'],
      weatherCondition: (query.weatherCondition ??
        'CLEAR') as PricingQuoteInput['weatherCondition'],
      roadCondition: (query.roadCondition ??
        'OPEN') as PricingQuoteInput['roadCondition'],
      isPeakHour: query.isPeakHour === 'true',
      activeDriverCount: query.activeDriverCount,
      openRequestCount: query.openRequestCount,
      driverOnboardingDays: query.driverOnboardingDays,
    });
  }

  async estimateRideOptions(query: EstimatePricingQueryDto) {
    // Calculer la demande en temps réel si le client ne la fournit pas
    let resolvedDemandLevel = query.demandLevel as 'NORMAL' | 'HIGH' | 'PEAK' | undefined;
    let resolvedActiveDriverCount = query.activeDriverCount;
    let resolvedOpenRequestCount = query.openRequestCount;
    let resolvedIsPeakHour = query.isPeakHour === 'true';

    if (!resolvedDemandLevel) {
      const realTimeDemand = await this.calculateRealTimeDemandLevel(query.city);
      resolvedDemandLevel = realTimeDemand.demandLevel;
      resolvedActiveDriverCount = resolvedActiveDriverCount ?? realTimeDemand.activeDriverCount;
      resolvedOpenRequestCount = resolvedOpenRequestCount ?? realTimeDemand.openRequestCount;
      resolvedIsPeakHour = realTimeDemand.isPeakHour;
    }

    // ── Catalogue de services Orbi Burkina Faso ─────────────────────────────
    // Ordonné par prix croissant pour guider vers le choix optimal
    const vehicleConfigurations: Array<{
      vehicleType: 'MOTORCYCLE' | 'CAR';
      serviceTier: ServiceTier;
      title: string;
      badge: string;
      capacity: string;
      accent: string;
      etaMinutes: number;
      paymentMethods: Array<'mobile-money' | 'cash' | 'wallet'>;
      vehicleExamples: string[];
    }> = [
      {
        vehicleType: 'MOTORCYCLE',
        serviceTier: ServiceTier.MOTO_STANDARD,
        title: 'Moto',
        badge: 'Le moins cher',
        capacity: '1 passager',
        accent: '#00C9A7',
        etaMinutes: this.calcDynamicEta('MOTORCYCLE', resolvedActiveDriverCount, resolvedIsPeakHour, resolvedDemandLevel),
        paymentMethods: ['mobile-money', 'cash', 'wallet'],
        vehicleExamples: ['Moto underbone urbaine', 'TVS HLX', 'Bajaj Boxer'],
      },
      {
        vehicleType: 'CAR',
        serviceTier: ServiceTier.CAR_STANDARD,
        title: 'Voiture Ville',
        badge: 'Climatisée',
        capacity: '4 places',
        accent: '#FF9500',
        etaMinutes: this.calcDynamicEta('CAR_STANDARD', resolvedActiveDriverCount, resolvedIsPeakHour, resolvedDemandLevel),
        paymentMethods: ['mobile-money', 'cash', 'wallet'],
        vehicleExamples: ['Toyota Yaris', 'Hyundai Accent', 'Suzuki Dzire'],
      },
      {
        vehicleType: 'CAR',
        serviceTier: ServiceTier.CAR_COMFORT,
        title: 'Confort Premium',
        badge: 'Haut de gamme',
        capacity: '4 places',
        accent: '#8E44AD',
        etaMinutes: this.calcDynamicEta('CAR_COMFORT', resolvedActiveDriverCount, resolvedIsPeakHour, resolvedDemandLevel),
        paymentMethods: ['mobile-money', 'wallet'],
        vehicleExamples: ['Toyota Corolla', 'Hyundai Elantra', 'Kia Cerato'],
      },
    ];

    // Enhance route metrics with OSRM when pickup/destination coordinates are available
    let resolvedDistanceKm = query.distanceKm;
    let resolvedDurationMinutes = query.durationMinutes;

    if (
      this.routingService &&
      query.pickupLatitude !== undefined && query.pickupLongitude !== undefined &&
      query.destinationLatitude !== undefined && query.destinationLongitude !== undefined
    ) {
      const route = await this.routingService.getRoute(
        { latitude: Number(query.pickupLatitude), longitude: Number(query.pickupLongitude) },
        { latitude: Number(query.destinationLatitude), longitude: Number(query.destinationLongitude) },
      ).catch(() => null);
      if (route) {
        resolvedDistanceKm = route.distanceKm;
        resolvedDurationMinutes = route.durationMinutes;
      }
    }

    const options = await Promise.all(
      vehicleConfigurations.map(async (configuration) => {
        const estimate = await this.quote({
          vehicleType: configuration.vehicleType,
          serviceTier: configuration.serviceTier,
          distanceKm: resolvedDistanceKm,
          durationMinutes: resolvedDurationMinutes,
          paymentMethod: (query.paymentMethod ??
            'MOBILE_MONEY') as PricingQuoteInput['paymentMethod'],
          zone: (query.zone ?? 'URBAN_CORE') as PricingQuoteInput['zone'],
          city: (query.city ?? 'OUAGADOUGOU') as PricingQuoteInput['city'],
          districtProfile: (query.districtProfile ??
            'RESIDENTIAL_STANDARD') as PricingQuoteInput['districtProfile'],
          // Demande en temps réel — calculée en amont de la boucle
          demandLevel: resolvedDemandLevel,
          trafficLevel: (query.trafficLevel ??
            'MODERATE') as PricingQuoteInput['trafficLevel'],
          weatherCondition: (query.weatherCondition ??
            'CLEAR') as PricingQuoteInput['weatherCondition'],
          roadCondition: (query.roadCondition ??
            'OPEN') as PricingQuoteInput['roadCondition'],
          isPeakHour: resolvedIsPeakHour,
          activeDriverCount: resolvedActiveDriverCount,
          openRequestCount: resolvedOpenRequestCount,
          driverOnboardingDays: query.driverOnboardingDays,
        });

        const demandMultiplier = estimate.fareBreakdown.demandMultiplier;
        const surgeActive = demandMultiplier > 1.005; // tolérance float
        const surgeLabel = surgeActive
          ? demandMultiplier >= 1.3 ? `${demandMultiplier.toFixed(1)}x ⚡`
          : `${demandMultiplier.toFixed(1)}x`
          : null;

        return {
          id: `${configuration.serviceTier.toLowerCase().replace(/_/g, '-')}`,
          category:
            configuration.vehicleType === 'MOTORCYCLE' ? 'motorcycle' : 'car',
          tier: configuration.serviceTier.toLowerCase().replace(/_/g, '-') as
            | 'moto-standard'
            | 'car-standard'
            | 'car-comfort'
            | 'car-xl',
          title: configuration.title,
          etaMinutes: configuration.etaMinutes,
          fare: estimate.estimatedFare,
          capacity: configuration.capacity,
          accent: configuration.accent,
          badge: surgeActive ? `${configuration.badge} · Forte demande` : configuration.badge,
          paymentMethods: configuration.paymentMethods,
          safetyNote: 'Code de prise en charge et partage de trajet inclus.',
          marketplace: this.buildRideOptionMarketplace(
            configuration.vehicleType,
            configuration.etaMinutes,
            resolvedActiveDriverCount,
            estimate.operatingContext.availabilityScore,
            configuration.vehicleExamples,
          ),
          driverPayout: estimate.driverEconomics.driverPayout,
          surgeActive,
          surgeLabel,
          fareBreakdown: {
            baseFare: estimate.fareBreakdown.baseFare,
            bookingFee: estimate.fareBreakdown.bookingFee,
            demandMultiplier: estimate.fareBreakdown.demandMultiplier,
            priceWindow: estimate.fareBreakdown.priceWindow,
            reasons: estimate.fareBreakdown.reasons,
            driverPickupDistanceIncludedInFare:
              estimate.trustAndPolicy.driverPickupDistanceIncludedInFare,
            driverPickupDistancePolicy:
              estimate.trustAndPolicy.driverPickupDistancePolicy,
          },
        };
      }),
    );

    return {
      route: {
        distanceKm: query.distanceKm,
        durationMinutes: query.durationMinutes,
      },
      options,
    };
  }

  private buildRideOptionMarketplace(
    vehicleType: 'MOTORCYCLE' | 'CAR',
    baseEtaMinutes: number,
    activeDriverCount: number | undefined,
    availabilityScore: number,
    vehicleExamples: string[],
  ) {
    const onlineDrivers = Math.max(
      vehicleType === 'MOTORCYCLE' ? 2 : 1,
      Math.round(
        (activeDriverCount ?? 6) * (vehicleType === 'MOTORCYCLE' ? 0.62 : 0.38),
      ),
    );
    const pickupRadiusKm = Number(
      Math.max(
        vehicleType === 'MOTORCYCLE' ? 0.9 : 1.4,
        baseEtaMinutes * (vehicleType === 'MOTORCYCLE' ? 0.42 : 0.5),
      ).toFixed(1),
    );
    const etaConfidence =
      availabilityScore >= 78
        ? 'HIGH'
        : availabilityScore >= 54
          ? 'MEDIUM'
          : 'LOW';

    return {
      availabilityLabel:
        etaConfidence === 'HIGH'
          ? 'Tres disponible'
          : etaConfidence === 'MEDIUM'
            ? 'Disponible'
            : 'Selection limitee',
      nearbyDrivers: onlineDrivers,
      pickupRadiusKm,
      etaConfidence,
      vehicleExamples,
      pricePromise:
        'Prix upfront affiche avant confirmation; approche chauffeur utilisee pour l ETA sans frais caches.',
    };
  }

  async quote(input: PricingQuoteInput) {
    const zone = input.zone ?? 'URBAN_CORE';
    const city = input.city ?? 'OUAGADOUGOU';
    const districtProfile = input.districtProfile ?? 'RESIDENTIAL_STANDARD';
    const paymentMethod = input.paymentMethod ?? 'MOBILE_MONEY';
    const operatingContext = this.deriveOperatingContext(input);
    const trafficLevel = operatingContext.trafficLevel;
    const weatherCondition = operatingContext.weatherCondition;
    const roadCondition = operatingContext.roadCondition;
    const demandLevel = operatingContext.demandLevel;
    const serviceTier =
      input.serviceTier ?? this.defaultServiceTierForVehicle(input.vehicleType);
    const rateCard =
      (await this.findRateCard(input.vehicleType, serviceTier)) ??
      this.fallbackRateCard(input);
    const distanceCharge = Math.round(input.distanceKm * rateCard.perKmRate);
    const timeCharge = Math.round(
      input.durationMinutes * rateCard.perMinuteRate,
    );
    const subtotalBeforeDemand =
      rateCard.baseFare + rateCard.bookingFee + distanceCharge + timeCharge;
    const { multiplier: demandMultiplier, capApplied: surgeCapApplied } =
      this.resolveDemandMultiplier(
        demandLevel,
        input.isPeakHour,
        input.vehicleType,
      );
    const surgedSubtotal = Math.round(subtotalBeforeDemand * demandMultiplier);
    const surgeAmount = surgedSubtotal - subtotalBeforeDemand;
    const localAdjustmentAmount = this.resolveLocalAdjustmentAmount(
      surgedSubtotal,
      city,
      districtProfile,
    );
    const trafficAdjustmentAmount = this.resolveTrafficAdjustmentAmount(
      surgedSubtotal,
      trafficLevel,
      input.durationMinutes,
      input.vehicleType,
    );
    const weatherAdjustmentAmount = this.resolveWeatherAdjustmentAmount(
      surgedSubtotal,
      weatherCondition,
      input.vehicleType,
      zone,
    );
    const roadConditionAdjustmentAmount =
      this.resolveRoadConditionAdjustmentAmount(
        surgedSubtotal,
        roadCondition,
        input.vehicleType,
      );
    const supplyDemandRatio = this.resolveSupplyDemandRatio(
      input.openRequestCount,
      input.activeDriverCount,
    );
    const availabilityAdjustmentAmount =
      this.resolveAvailabilityAdjustmentAmount(
        surgedSubtotal,
        supplyDemandRatio,
        input.activeDriverCount,
      );
    const paymentProcessingFeeIncluded =
      paymentMethod === 'CASH'
        ? 0
        : Math.round(
            (surgedSubtotal +
              localAdjustmentAmount +
              trafficAdjustmentAmount +
              weatherAdjustmentAmount +
              roadConditionAdjustmentAmount +
              availabilityAdjustmentAmount) *
              0.015 +
              25,
          );
    const cashlessDiscount = paymentMethod === 'CASH' ? 0 : 50;
    const affordabilitySupportAmount = this.resolveAffordabilitySupportAmount(
      surgedSubtotal +
        localAdjustmentAmount +
        trafficAdjustmentAmount +
        weatherAdjustmentAmount +
        roadConditionAdjustmentAmount +
        availabilityAdjustmentAmount,
      city,
      zone,
      input.vehicleType,
    );
    const preMinimumFare =
      surgedSubtotal +
      localAdjustmentAmount +
      trafficAdjustmentAmount +
      weatherAdjustmentAmount +
      roadConditionAdjustmentAmount +
      availabilityAdjustmentAmount +
      paymentProcessingFeeIncluded -
      cashlessDiscount -
      affordabilitySupportAmount;
    const minimumProtectedFare = Math.max(preMinimumFare, rateCard.minimumFare);
    const estimatedFare = Math.round(minimumProtectedFare);
    const minimumFareApplied = preMinimumFare < rateCard.minimumFare;
    const priceWindow = this.resolvePriceWindow(
      estimatedFare,
      demandLevel,
      input.isPeakHour,
      input.distanceKm,
      input.durationMinutes,
    );
    const reasons = this.buildPricingReasons(
      input,
      demandLevel,
      paymentMethod,
      minimumFareApplied,
      surgeCapApplied,
      supplyDemandRatio,
      trafficLevel,
      weatherCondition,
      roadCondition,
    );
    const commissionRate = this.resolveCommissionRate(
      input.driverOnboardingDays,
    );
    const commissionAmount = Math.round(estimatedFare * commissionRate);
    const driverPayout = estimatedFare - commissionAmount;

    return {
      currency: 'XOF',
      market: 'Burkina Faso',
      vehicleType: input.vehicleType,
      serviceTier,
      paymentMethod,
      zone,
      city,
      districtProfile,
      demandLevel,
      distanceKm: input.distanceKm,
      durationMinutes: input.durationMinutes,
      estimatedFare,
      fareBreakdown: {
        baseFare: rateCard.baseFare,
        distanceCharge,
        timeCharge,
        bookingFee: rateCard.bookingFee,
        subtotalBeforeDemand,
        demandMultiplier,
        surgeAmount,
        cashlessDiscount,
        paymentProcessingFeeIncluded,
        minimumFareApplied,
        localAdjustmentAmount,
        trafficAdjustmentAmount,
        weatherAdjustmentAmount,
        roadConditionAdjustmentAmount,
        availabilityAdjustmentAmount,
        affordabilitySupportAmount,
        priceWindow,
        reasons,
        surgeCapApplied,
        supplyDemandRatio,
      },
      operatingContext,
      driverEconomics: {
        commissionRate,
        commissionAmount,
        driverPayout,
      },
      trustAndPolicy: {
        upfrontPricing: true,
        pickupCodeRequired: true,
        liveTripSharingEnabled: true,
        cashEnabled: true,
        burkinaLocalizedPricing: true,
        priceReviewAvailable: true,
        priceLockWindowSeconds: 90,
        driverPickupDistanceIncludedInFare: false,
        driverPickupDistancePolicy:
          'La distance chauffeur vers le client optimise le dispatch et l ETA; le prix passager reste calcule sur le trajet demande, le temps, le trafic et le contexte operationnel.',
      },
    };
  }

  deriveOperatingContext(input: OperatingContextInput) {
    const trafficLevel = input.trafficLevel ?? 'MODERATE';
    const weatherCondition = input.weatherCondition ?? 'CLEAR';
    const roadCondition = input.roadCondition ?? 'OPEN';
    const demandLevel =
      input.demandLevel ??
      this.resolveDemandLevel(
        input.openRequestCount,
        input.activeDriverCount,
        input.isPeakHour,
      );
    const supplyDemandRatio = this.resolveSupplyDemandRatio(
      input.openRequestCount,
      input.activeDriverCount,
    );

    return {
      demandLevel,
      trafficLevel,
      weatherCondition,
      roadCondition,
      supplyPressureLevel: this.resolveSupplyPressureLevel(supplyDemandRatio),
      availabilityScore: this.resolveAvailabilityScore(
        input.activeDriverCount,
        supplyDemandRatio,
      ),
    };
  }

  private resolveDemandLevel(
    openRequestCount?: number,
    activeDriverCount?: number,
    isPeakHour?: boolean,
  ): 'NORMAL' | 'HIGH' | 'PEAK' {
    if (isPeakHour && (!activeDriverCount || activeDriverCount <= 3)) {
      return 'PEAK';
    }

    if (openRequestCount && activeDriverCount) {
      const pressureRatio = openRequestCount / Math.max(activeDriverCount, 1);

      if (pressureRatio >= 2.2) {
        return 'PEAK';
      }

      if (pressureRatio >= 1.2) {
        return 'HIGH';
      }
    }

    return isPeakHour ? 'HIGH' : 'NORMAL';
  }

  private resolveDemandMultiplier(
    demandLevel: 'NORMAL' | 'HIGH' | 'PEAK',
    isPeakHour?: boolean,
    vehicleType?: 'MOTORCYCLE' | 'CAR',
  ) {
    let multiplier = 1;

    if (demandLevel === 'PEAK') {
      multiplier = isPeakHour ? 1.4 : 1.3;
    } else if (demandLevel === 'HIGH') {
      multiplier = isPeakHour ? 1.2 : 1.12;
    }

    const cap = vehicleType === 'MOTORCYCLE' ? 1.35 : 1.45;

    return {
      multiplier: Math.min(multiplier, cap),
      capApplied: multiplier > cap,
    };
  }

  /**
   * Commission tiers calibrés pour le marché Burkina Faso.
   * Structure dégressive pour maximiser la rétention des chauffeurs.
   *
   * Rentabilité cible: 15-20 000 XOF/jour plateforme dès 80 courses/jour
   * (80 × 1 200 XOF moyen × 18% = 17 280 XOF/jour)
   */
  private resolveCommissionRate(driverOnboardingDays?: number) {
    if (driverOnboardingDays === undefined) return 0.18;
    if (driverOnboardingDays <= 30) return 0.10;  // Onboarding bonus — attirer rapidement
    if (driverOnboardingDays <= 90) return 0.15;  // Phase de croissance
    return 0.18;                                    // Taux steady-state standard
  }

  /**
   * Calcul de demande en temps réel basé sur:
   * - Rapport requêtes ouvertes / chauffeurs en ligne
   * - Heure de pointe Ouagadougou (7h-9h, 12h-14h, 17h-20h)
   */
  async calculateRealTimeDemandLevel(cityHint?: string): Promise<{
    demandLevel: 'NORMAL' | 'HIGH' | 'PEAK';
    activeDriverCount: number;
    openRequestCount: number;
    isPeakHour: boolean;
  }> {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0=Sunday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Heures de pointe Ouagadougou
    const isPeakHour =
      !isWeekend && (
        (hour >= 7 && hour < 9) ||   // Matin
        (hour >= 12 && hour < 14) ||  // Déjeuner
        (hour >= 17 && hour < 20)     // Soir
      );

    const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000);

    const [activeDriverCount, openRequestCount] = await Promise.all([
      this.prisma.driverProfile.count({
        where: { status: 'ONLINE' },
      }),
      this.prisma.rideRequest.count({
        where: {
          status: 'REQUESTED',
          createdAt: { gte: tenMinutesAgo },
        },
      }),
    ]);

    const ratio = openRequestCount / Math.max(activeDriverCount, 1);

    let demandLevel: 'NORMAL' | 'HIGH' | 'PEAK' = 'NORMAL';
    if (ratio >= 1.5 || (isPeakHour && ratio >= 0.8)) {
      demandLevel = 'PEAK';
    } else if (ratio >= 0.8 || isPeakHour) {
      demandLevel = 'HIGH';
    }

    return { demandLevel, activeDriverCount, openRequestCount, isPeakHour };
  }

  private calcDynamicEta(
    vehicleClass: 'MOTORCYCLE' | 'CAR_STANDARD' | 'CAR_COMFORT',
    activeDriverCount: number | undefined,
    isPeakHour: boolean,
    demandLevel: 'NORMAL' | 'HIGH' | 'PEAK' | undefined,
  ): number {
    const drivers = activeDriverCount ?? 5;
    const demand = demandLevel ?? 'NORMAL';

    // Base ETA by vehicle class (minutes, city conditions Ouagadougou)
    let base = vehicleClass === 'MOTORCYCLE' ? 3 : vehicleClass === 'CAR_STANDARD' ? 6 : 9;

    // Penalize for low driver supply
    if (drivers === 0) base += vehicleClass === 'MOTORCYCLE' ? 4 : 6;
    else if (drivers < 3) base += vehicleClass === 'MOTORCYCLE' ? 2 : 3;
    else if (drivers < 8) base += 1;

    // Peak hour adds congestion time
    if (isPeakHour) base += vehicleClass === 'MOTORCYCLE' ? 2 : 4;

    // High/peak demand means more competition for drivers
    if (demand === 'PEAK') base += vehicleClass === 'MOTORCYCLE' ? 3 : 5;
    else if (demand === 'HIGH') base += vehicleClass === 'MOTORCYCLE' ? 1 : 2;

    return Math.max(base, vehicleClass === 'MOTORCYCLE' ? 2 : 5);
  }

  private resolveSupplyDemandRatio(
    openRequestCount?: number,
    activeDriverCount?: number,
  ) {
    if (!openRequestCount || !activeDriverCount) {
      return null;
    }

    return Number(
      (openRequestCount / Math.max(activeDriverCount, 1)).toFixed(2),
    );
  }

  private resolvePriceWindow(
    estimatedFare: number,
    demandLevel: 'NORMAL' | 'HIGH' | 'PEAK',
    isPeakHour: boolean | undefined,
    distanceKm: number,
    durationMinutes: number,
  ) {
    let variance = 0.03;

    if (demandLevel === 'HIGH') {
      variance = 0.05;
    }

    if (demandLevel === 'PEAK') {
      variance = 0.07;
    }

    if (isPeakHour) {
      variance += 0.01;
    }

    if (distanceKm >= 10 || durationMinutes >= 25) {
      variance += 0.01;
    }

    return {
      min: Math.round(estimatedFare * (1 - variance)),
      max: Math.round(estimatedFare * (1 + variance)),
    };
  }

  private buildPricingReasons(
    input: PricingQuoteInput,
    demandLevel: 'NORMAL' | 'HIGH' | 'PEAK',
    paymentMethod: 'MOBILE_MONEY' | 'CASH' | 'WALLET',
    minimumFareApplied: boolean,
    surgeCapApplied: boolean,
    supplyDemandRatio: number | null,
    trafficLevel: NonNullable<PricingQuoteInput['trafficLevel']>,
    weatherCondition: NonNullable<PricingQuoteInput['weatherCondition']>,
    roadCondition: NonNullable<PricingQuoteInput['roadCondition']>,
  ) {
    const reasons = [
      'Prix affiche avant confirmation pour eviter les surprises.',
    ];

    reasons.push(
      `Distance trajet ${input.distanceKm.toFixed(1)} km et duree estimee ${Math.round(input.durationMinutes)} min incluses dans le calcul.`,
    );

    reasons.push(
      'La distance d approche chauffeur sert au dispatch et a l ETA, sans surfacturation cachee du client.',
    );

    reasons.push(
      `Tarification localisee pour ${this.formatCityLabel(
        input.city ?? 'OUAGADOUGOU',
      )}.`,
    );

    reasons.push(
      `Profil de zone ${this.formatDistrictProfileLabel(
        input.districtProfile ?? 'RESIDENTIAL_STANDARD',
      )}.`,
    );

    if (demandLevel !== 'NORMAL') {
      reasons.push(
        `La demande est ${demandLevel === 'PEAK' ? 'tres elevee' : 'elevee'} sur cette zone.`,
      );
    }

    if (trafficLevel !== 'FREE_FLOW') {
      reasons.push(
        `Le trafic est ${this.formatTrafficLevelLabel(trafficLevel)} sur le corridor estime.`,
      );
    }

    if (weatherCondition !== 'CLEAR') {
      reasons.push(
        `La meteo est ${this.formatWeatherConditionLabel(weatherCondition)}, ce qui influence la disponibilite et le temps de prise en charge.`,
      );
    }

    if (roadCondition !== 'OPEN') {
      reasons.push(
        `L etat de circulation est ${this.formatRoadConditionLabel(roadCondition)} sur une partie du trajet.`,
      );
    }

    if (input.isPeakHour) {
      reasons.push('Un ajustement heure de pointe est applique.');
    }

    if (paymentMethod !== 'CASH') {
      reasons.push(
        'Une remise cashless aide a garder un prix plus fluide au paiement.',
      );
    }

    if (minimumFareApplied) {
      reasons.push(
        'Le tarif minimum protege la disponibilite des chauffeurs sur les trajets courts.',
      );
    }

    if (surgeCapApplied) {
      reasons.push(
        'Le multiplicateur de demande a ete plafonne pour limiter les hausses abruptes.',
      );
    }

    if (supplyDemandRatio !== null) {
      reasons.push(
        `Le ratio demande/disponibilite observe est de ${supplyDemandRatio.toFixed(2)}.`,
      );
    }

    return reasons;
  }

  private resolveTrafficAdjustmentAmount(
    surgedSubtotal: number,
    trafficLevel: NonNullable<PricingQuoteInput['trafficLevel']>,
    durationMinutes: number,
    vehicleType: PricingQuoteInput['vehicleType'],
  ) {
    const multiplier =
      {
        FREE_FLOW: 0,
        MODERATE: 0.015,
        HEAVY: vehicleType === 'MOTORCYCLE' ? 0.035 : 0.05,
        GRIDLOCK: vehicleType === 'MOTORCYCLE' ? 0.05 : 0.075,
      }[trafficLevel] ?? 0;
    const durationWeight = Math.min(1.2, 0.75 + durationMinutes / 40);

    return Math.round(surgedSubtotal * multiplier * durationWeight);
  }

  private resolveWeatherAdjustmentAmount(
    surgedSubtotal: number,
    weatherCondition: NonNullable<PricingQuoteInput['weatherCondition']>,
    vehicleType: PricingQuoteInput['vehicleType'],
    zone: NonNullable<PricingQuoteInput['zone']>,
  ) {
    const baseMultiplier =
      {
        CLEAR: 0,
        HEAT: 0.008,
        WIND: 0.01,
        DUST: 0.015,
        RAIN: vehicleType === 'MOTORCYCLE' ? 0.045 : 0.025,
        STORM: vehicleType === 'MOTORCYCLE' ? 0.07 : 0.04,
      }[weatherCondition] ?? 0;
    const zoneWeight =
      zone === 'SEMI_URBAN' ? 1.15 : zone === 'URBAN_EDGE' ? 1.08 : 1;

    return Math.round(surgedSubtotal * baseMultiplier * zoneWeight);
  }

  private resolveRoadConditionAdjustmentAmount(
    surgedSubtotal: number,
    roadCondition: NonNullable<PricingQuoteInput['roadCondition']>,
    vehicleType: PricingQuoteInput['vehicleType'],
  ) {
    const multiplier =
      {
        OPEN: 0,
        SLOW: vehicleType === 'MOTORCYCLE' ? 0.008 : 0.015,
        CONGESTED: vehicleType === 'MOTORCYCLE' ? 0.018 : 0.03,
        BLOCKED: vehicleType === 'MOTORCYCLE' ? 0.028 : 0.045,
      }[roadCondition] ?? 0;

    return Math.round(surgedSubtotal * multiplier);
  }

  private resolveAvailabilityAdjustmentAmount(
    surgedSubtotal: number,
    supplyDemandRatio: number | null,
    activeDriverCount?: number,
  ) {
    if (activeDriverCount !== undefined && activeDriverCount <= 2) {
      return Math.round(surgedSubtotal * 0.05);
    }

    if (supplyDemandRatio === null) {
      return 0;
    }

    if (supplyDemandRatio >= 2.5) {
      return Math.round(surgedSubtotal * 0.055);
    }

    if (supplyDemandRatio >= 1.5) {
      return Math.round(surgedSubtotal * 0.03);
    }

    if (supplyDemandRatio <= 0.7) {
      return -Math.round(surgedSubtotal * 0.015);
    }

    return 0;
  }

  private resolveLocalAdjustmentAmount(
    surgedSubtotal: number,
    city: NonNullable<PricingQuoteInput['city']>,
    districtProfile: NonNullable<PricingQuoteInput['districtProfile']>,
  ) {
    const cityMultiplier =
      {
        OUAGADOUGOU: 1,
        BOBO_DIOULASSO: 0.95,
        KOUDOUGOU: 0.9,
        BANFORA: 0.93,
        OUAHIGOUYA: 0.91,
      }[city] ?? 1;

    const districtDelta =
      {
        CBD: 0.04,
        UNIVERSITY: -0.03,
        GOVERNMENT: 0.03,
        AIRPORT: 0.05,
        RESIDENTIAL_STANDARD: 0,
        RESIDENTIAL_PERIPHERAL: -0.04,
        MARKET_DENSE: 0.02,
        INDUSTRIAL: 0.01,
        INTERCITY_GATE: 0.03,
      }[districtProfile] ?? 0;

    return Math.round(surgedSubtotal * (cityMultiplier - 1 + districtDelta));
  }

  private resolveAffordabilitySupportAmount(
    subtotal: number,
    city: NonNullable<PricingQuoteInput['city']>,
    zone: NonNullable<PricingQuoteInput['zone']>,
    vehicleType: PricingQuoteInput['vehicleType'],
  ) {
    if (vehicleType === 'CAR') {
      return 0;
    }

    if (
      city === 'OUAGADOUGOU' &&
      (zone === 'URBAN_EDGE' || zone === 'SEMI_URBAN')
    ) {
      return Math.min(120, Math.round(subtotal * 0.04));
    }

    if (city !== 'OUAGADOUGOU') {
      return Math.min(100, Math.round(subtotal * 0.035));
    }

    return 0;
  }

  private formatCityLabel(city: NonNullable<PricingQuoteInput['city']>) {
    return {
      OUAGADOUGOU: 'Ouagadougou',
      BOBO_DIOULASSO: 'Bobo-Dioulasso',
      KOUDOUGOU: 'Koudougou',
      BANFORA: 'Banfora',
      OUAHIGOUYA: 'Ouahigouya',
    }[city];
  }

  private formatDistrictProfileLabel(
    districtProfile: NonNullable<PricingQuoteInput['districtProfile']>,
  ) {
    return {
      CBD: 'centre-ville',
      UNIVERSITY: 'universite',
      GOVERNMENT: 'administratif',
      AIRPORT: 'aeroport',
      RESIDENTIAL_STANDARD: 'residentiel standard',
      RESIDENTIAL_PERIPHERAL: 'residentiel peripherique',
      MARKET_DENSE: 'zone marche dense',
      INDUSTRIAL: 'zone industrielle',
      INTERCITY_GATE: 'porte interurbaine',
    }[districtProfile];
  }

  private formatTrafficLevelLabel(
    trafficLevel: NonNullable<PricingQuoteInput['trafficLevel']>,
  ) {
    return {
      FREE_FLOW: 'fluide',
      MODERATE: 'modere',
      HEAVY: 'dense',
      GRIDLOCK: 'tres congestionne',
    }[trafficLevel];
  }

  private formatWeatherConditionLabel(
    weatherCondition: NonNullable<PricingQuoteInput['weatherCondition']>,
  ) {
    return {
      CLEAR: 'stable',
      HEAT: 'chaude',
      WIND: 'venteuse',
      DUST: 'poussiereuse',
      RAIN: 'pluvieuse',
      STORM: 'orageuse',
    }[weatherCondition];
  }

  private formatRoadConditionLabel(
    roadCondition: NonNullable<PricingQuoteInput['roadCondition']>,
  ) {
    return {
      OPEN: 'ouverte',
      SLOW: 'ralentie',
      CONGESTED: 'congestionnee',
      BLOCKED: 'partiellement bloquee',
    }[roadCondition];
  }

  private resolveSupplyPressureLevel(supplyDemandRatio: number | null) {
    if (supplyDemandRatio === null) {
      return 'BALANCED' as const;
    }

    if (supplyDemandRatio >= 2.5) {
      return 'CRITICAL' as const;
    }

    if (supplyDemandRatio >= 1.4) {
      return 'TIGHT' as const;
    }

    if (supplyDemandRatio <= 0.7) {
      return 'LOW' as const;
    }

    return 'BALANCED' as const;
  }

  private resolveAvailabilityScore(
    activeDriverCount?: number,
    supplyDemandRatio: number | null = null,
  ) {
    const drivers = activeDriverCount ?? 6;
    const ratioPenalty =
      supplyDemandRatio === null
        ? 0
        : Math.min(55, Math.round(supplyDemandRatio * 18));
    const driverBoost = Math.min(22, drivers * 2);

    return Math.max(18, Math.min(100, 68 + driverBoost - ratioPenalty));
  }

  private defaultServiceTierForVehicle(vehicleType: 'MOTORCYCLE' | 'CAR') {
    return vehicleType === 'MOTORCYCLE'
      ? ServiceTier.MOTO_STANDARD
      : ServiceTier.CAR_STANDARD;
  }

  private async findRateCard(
    vehicleType: 'MOTORCYCLE' | 'CAR',
    serviceTier: ServiceTier,
  ) {
    // Use the cached rules list instead of a separate DB query
    const allRules = await this.listRules();
    const rule = allRules.find(
      (r) => r.vehicleType === (vehicleType as VehicleType) && r.serviceTier === serviceTier,
    ) ?? null;

    if (!rule) {
      return null;
    }

    return {
      serviceTier,
      baseFare: Number(rule.baseFare),
      perKmRate: Number(rule.perKmRate),
      perMinuteRate: Number(rule.perMinuteRate),
      bookingFee: Number(rule.bookingFee),
      minimumFare: Number(rule.minimumFare),
    };
  }

  private fallbackRateCard(
    input: Pick<PricingQuoteInput, 'vehicleType' | 'zone' | 'serviceTier'>,
  ): RateCard {
    const zone = input.zone ?? 'URBAN_CORE';

    // ── Tarifs Burkina Faso calibrés — compétitifs ET rentables ─────────────
    //
    // Objectif: 1 200-1 500 XOF pour un trajet moyen 5.8km/16min Ouagadougou
    // Comparable à: Bolt/Yango moto ~800-1500 XOF, Zémidjan premium ~500-1000 XOF
    // Commission 18% → ~215-270 XOF/trajet → rentable dès 80 courses/jour
    //
    // Formule: baseFare + (distanceKm × perKmRate) + (durationMin × perMinuteRate) + bookingFee
    // Test: 5.8km / 16min URBAN_CORE moto → 300 + 522 + 288 + 100 = 1 210 XOF ✅

    if (input.vehicleType === 'MOTORCYCLE') {
      // Moto — tarif d'entrée, accessible quotidiennement
      if (zone === 'SEMI_URBAN') {
        return { serviceTier: ServiceTier.MOTO_STANDARD, baseFare: 200, perKmRate: 75, perMinuteRate: 15, bookingFee: 75, minimumFare: 550 };
      }
      if (zone === 'URBAN_EDGE') {
        return { serviceTier: ServiceTier.MOTO_STANDARD, baseFare: 250, perKmRate: 85, perMinuteRate: 17, bookingFee: 85, minimumFare: 650 };
      }
      // Urban Core — cœur de marché Ouagadougou
      return { serviceTier: ServiceTier.MOTO_STANDARD, baseFare: 300, perKmRate: 90, perMinuteRate: 18, bookingFee: 100, minimumFare: 750 };
    }

    // ── Voitures ──────────────────────────────────────────────────────────────

    if (input.serviceTier === ServiceTier.CAR_COMFORT) {
      // Car Comfort — climatisée, cuir, segment premium
      if (zone === 'SEMI_URBAN') {
        return { serviceTier: ServiceTier.CAR_COMFORT, baseFare: 900, perKmRate: 165, perMinuteRate: 38, bookingFee: 275, minimumFare: 1600 };
      }
      if (zone === 'URBAN_EDGE') {
        return { serviceTier: ServiceTier.CAR_COMFORT, baseFare: 1100, perKmRate: 195, perMinuteRate: 45, bookingFee: 325, minimumFare: 2000 };
      }
      return { serviceTier: ServiceTier.CAR_COMFORT, baseFare: 1200, perKmRate: 210, perMinuteRate: 50, bookingFee: 350, minimumFare: 2300 };
    }

    if (input.serviceTier === ServiceTier.CAR_XL) {
      // Car XL — minivan, famille, groupe jusqu'à 6 places
      if (zone === 'SEMI_URBAN') {
        return { serviceTier: ServiceTier.CAR_XL, baseFare: 1000, perKmRate: 175, perMinuteRate: 40, bookingFee: 300, minimumFare: 1800 };
      }
      if (zone === 'URBAN_EDGE') {
        return { serviceTier: ServiceTier.CAR_XL, baseFare: 1200, perKmRate: 200, perMinuteRate: 48, bookingFee: 350, minimumFare: 2200 };
      }
      return { serviceTier: ServiceTier.CAR_XL, baseFare: 1400, perKmRate: 220, perMinuteRate: 55, bookingFee: 400, minimumFare: 2600 };
    }

    // Car Standard — berline climatisée, segment principal
    if (zone === 'SEMI_URBAN') {
      return { serviceTier: ServiceTier.CAR_STANDARD, baseFare: 600, perKmRate: 120, perMinuteRate: 25, bookingFee: 175, minimumFare: 1100 };
    }
    if (zone === 'URBAN_EDGE') {
      return { serviceTier: ServiceTier.CAR_STANDARD, baseFare: 750, perKmRate: 140, perMinuteRate: 30, bookingFee: 200, minimumFare: 1350 };
    }
    // Urban Core
    return { serviceTier: ServiceTier.CAR_STANDARD, baseFare: 900, perKmRate: 160, perMinuteRate: 35, bookingFee: 225, minimumFare: 1600 };
  }
}
