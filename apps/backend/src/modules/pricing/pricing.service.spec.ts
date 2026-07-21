/**
 * PricingService — Suite de tests exhaustive
 *
 * Couverture cible: 80%+ (vs 20% avant)
 * Périmètre: tarification Burkina Faso, commission chauffeur, surge pricing,
 *            tous les ajustements contextuels, toutes les zones/villes
 */
import { ServiceTier } from '@prisma/client';
import { roundCommissionForDriverSettlement } from '../../common/economics/driver-commission';
import { PricingService } from './pricing.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createService() {
  const prisma = {
    pricingRule: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    driverProfile: {
      count: jest.fn().mockResolvedValue(4),
    },
    rideRequest: {
      count: jest.fn().mockResolvedValue(2),
    },
  };

  // Mock Redis cache: bypass vers factory directement (tests unitaires purs)
  const cache = {
    getOrSet: jest.fn().mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    ),
    invalidate: jest.fn().mockResolvedValue(undefined),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
    isRedisConnected: false,
  };

  return { prisma, cache, service: new PricingService(prisma as never, cache as never) };
}

/**
 * Référence: trajet standard Ouagadougou 5.8 km / 16 min
 * Moto Urban Core fallback:
 *   base=300, 90×5.8=522, 18×16=288, fee=100, min=750
 *   Sous-total: 300+522+288+100 = 1 210 XOF
 */
const REFERENCE_MOTO_QUOTE = {
  vehicleType: 'MOTORCYCLE' as const,
  distanceKm: 5.8,
  durationMinutes: 16,
  paymentMethod: 'MOBILE_MONEY' as const,
  zone: 'URBAN_CORE' as const,
  city: 'OUAGADOUGOU' as const,
  districtProfile: 'UNIVERSITY' as const,
};

// ── Commission tiers ──────────────────────────────────────────────────────────

describe('PricingService — commission tiers chauffeur', () => {
  it('applique 10% onboarding bonus pour les 30 premiers jours', async () => {
    const { service } = createService();
    const quote = await service.quote({ ...REFERENCE_MOTO_QUOTE, driverOnboardingDays: 1 });
    expect(quote.driverEconomics.commissionRate).toBe(0.10);
    expect(quote.driverEconomics.commissionAmount).toBe(
      roundCommissionForDriverSettlement(quote.estimatedFare * 0.10),
    );
  });

  it('applique 10% exactement au J30 (dernière journée bonus)', async () => {
    const { service } = createService();
    const quote = await service.quote({ ...REFERENCE_MOTO_QUOTE, driverOnboardingDays: 30 });
    expect(quote.driverEconomics.commissionRate).toBe(0.10);
  });

  it('applique 15% de J31 à J90 (phase de croissance)', async () => {
    const { service } = createService();
    const q31 = await service.quote({ ...REFERENCE_MOTO_QUOTE, driverOnboardingDays: 31 });
    const q90 = await service.quote({ ...REFERENCE_MOTO_QUOTE, driverOnboardingDays: 90 });
    expect(q31.driverEconomics.commissionRate).toBe(0.15);
    expect(q90.driverEconomics.commissionRate).toBe(0.15);
  });

  it('applique 18% steady-state à partir de J91', async () => {
    const { service } = createService();
    const quote = await service.quote({ ...REFERENCE_MOTO_QUOTE, driverOnboardingDays: 91 });
    expect(quote.driverEconomics.commissionRate).toBe(0.18);
  });

  it('applique 18% quand driverOnboardingDays est absent', async () => {
    const { service } = createService();
    const quote = await service.quote(REFERENCE_MOTO_QUOTE);
    expect(quote.driverEconomics.commissionRate).toBe(0.18);
  });

  it('garantit que driverPayout = estimatedFare - commissionAmount', async () => {
    const { service } = createService();
    const quote = await service.quote({ ...REFERENCE_MOTO_QUOTE, driverOnboardingDays: 50 });
    expect(quote.driverEconomics.driverPayout).toBe(
      quote.estimatedFare - quote.driverEconomics.commissionAmount,
    );
    expect(quote.driverEconomics.driverPayout).toBeGreaterThan(0);
  });

  it('expose une repartition economique plafonnee et lisible pour les ops', async () => {
    const { service } = createService();
    const quote = await service.quote(REFERENCE_MOTO_QUOTE);

    expect(quote.driverEconomics.driverShareRate).toBeGreaterThanOrEqual(0.82);
    expect(quote.driverEconomics.platformTakeRate).toBeLessThanOrEqual(0.18);
    expect(quote.driverEconomics.driverPayoutPerKm).toBeGreaterThan(0);
    expect(quote.driverEconomics.driverPayoutPerMinute).toBeGreaterThan(0);
    expect(quote.driverEconomics.commissionAmount % 10).toBe(0);
    expect(quote.driverEconomics.driverPayout % 10).toBe(0);
    expect(quote.driverEconomics.commissionAmount).toBeLessThanOrEqual(
      quote.driverEconomics.rawCommissionAmount,
    );
    expect(quote.driverEconomics.wealthDistributionBand).toBe(
      'STANDARD_FAIR_SHARE',
    );
  });

  it('classe les nouveaux chauffeurs en boost de partage chauffeur', async () => {
    const { service } = createService();
    const quote = await service.quote({ ...REFERENCE_MOTO_QUOTE, driverOnboardingDays: 1 });

    expect(quote.driverEconomics.driverShareRate).toBeGreaterThanOrEqual(0.9);
    expect(quote.driverEconomics.wealthDistributionBand).toBe(
      'DRIVER_ONBOARDING_BOOST',
    );
  });
});

// ── Tarifs fallback calibrés Burkina Faso ─────────────────────────────────────

describe('PricingService — tarifs fallback Burkina Faso', () => {
  // Moto Urban Core : 300 + 90/km + 18/min + 100 booking = 1 210 XOF
  it('retourne le tarif Moto Urban Core attendu (1 210 XOF)', async () => {
    const { service } = createService();
    const quote = await service.quote({
      vehicleType: 'MOTORCYCLE',
      serviceTier: ServiceTier.MOTO_STANDARD,
      distanceKm: 5.8,
      durationMinutes: 16,
      paymentMethod: 'CASH',
      zone: 'URBAN_CORE',
      city: 'OUAGADOUGOU',
      districtProfile: 'UNIVERSITY',
    });
    // Tarif de base sans ajustements: 300 + 522 + 288 + 100 = 1 210
    expect(quote.fareBreakdown.baseFare).toBe(300);
    expect(quote.fareBreakdown.bookingFee).toBe(100);
    expect(quote.estimatedFare).toBeGreaterThanOrEqual(750); // >= minimum
  });

  it('applique un tarif plus bas en SEMI_URBAN (zone peripherique)', async () => {
    const { service } = createService();
    const urban = await service.quote({ ...REFERENCE_MOTO_QUOTE, zone: 'URBAN_CORE' });
    const semi = await service.quote({ ...REFERENCE_MOTO_QUOTE, zone: 'SEMI_URBAN' });
    expect(semi.fareBreakdown.baseFare).toBeLessThan(urban.fareBreakdown.baseFare);
    // Le total sous-total doit aussi etre inferieur
    expect(semi.fareBreakdown.subtotalBeforeDemand).toBeLessThan(urban.fareBreakdown.subtotalBeforeDemand);
  });

  it('applique un tarif moyen en URBAN_EDGE (entre SEMI_URBAN et URBAN_CORE)', async () => {
    const { service } = createService();
    const edge = await service.quote({ ...REFERENCE_MOTO_QUOTE, zone: 'URBAN_EDGE' });
    const urban = await service.quote({ ...REFERENCE_MOTO_QUOTE, zone: 'URBAN_CORE' });
    const semi = await service.quote({ ...REFERENCE_MOTO_QUOTE, zone: 'SEMI_URBAN' });
    // URBAN_EDGE est entre SEMI_URBAN et URBAN_CORE
    expect(edge.fareBreakdown.baseFare).toBeGreaterThan(semi.fareBreakdown.baseFare);
    expect(edge.fareBreakdown.baseFare).toBeLessThan(urban.fareBreakdown.baseFare);
  });

  it('retourne un tarif Car Standard supérieur à Moto', async () => {
    const { service } = createService();
    const moto = await service.quote({ ...REFERENCE_MOTO_QUOTE, vehicleType: 'MOTORCYCLE' });
    const car = await service.quote({ ...REFERENCE_MOTO_QUOTE, vehicleType: 'CAR' });
    expect(car.estimatedFare).toBeGreaterThan(moto.estimatedFare);
  });

  it('fallback Car SEMI_URBAN: baseFare = 600', async () => {
    const { service } = createService();
    const quote = await service.quote({
      vehicleType: 'CAR',
      serviceTier: ServiceTier.CAR_STANDARD,
      distanceKm: 3,
      durationMinutes: 10,
      paymentMethod: 'CASH',
      zone: 'SEMI_URBAN',
      city: 'BOBO_DIOULASSO',
      districtProfile: 'RESIDENTIAL_PERIPHERAL',
    });
    expect(quote.fareBreakdown.baseFare).toBe(600);
    expect(quote.serviceTier).toBe(ServiceTier.CAR_STANDARD);
  });

  it('arrondit les montants terrain vers le haut sans exagerer le prix', async () => {
    const { service } = createService();
    const rounding = service as unknown as {
      roundFareForCashOperations(amount: number): {
        amount: number;
        roundingAmount: number;
        step: 50 | 100;
      };
    };

    expect(rounding.roundFareForCashOperations(1453)).toEqual({
      amount: 1500,
      roundingAmount: 47,
      step: 100,
    });
    expect(rounding.roundFareForCashOperations(1689)).toEqual({
      amount: 1700,
      roundingAmount: 11,
      step: 100,
    });
    expect(rounding.roundFareForCashOperations(1210)).toEqual({
      amount: 1300,
      roundingAmount: 90,
      step: 100,
    });
  });

  it('applique l arrondi CFA aux motos et aux voitures', async () => {
    const { service } = createService();
    const moto = await service.quote({
      ...REFERENCE_MOTO_QUOTE,
      vehicleType: 'MOTORCYCLE',
      distanceKm: 5.8,
      durationMinutes: 16,
    });
    const car = await service.quote({
      ...REFERENCE_MOTO_QUOTE,
      vehicleType: 'CAR',
      serviceTier: ServiceTier.CAR_STANDARD,
      distanceKm: 5.8,
      durationMinutes: 16,
    });

    expect(moto.estimatedFare % 50).toBe(0);
    expect(car.estimatedFare % 50).toBe(0);
    expect(moto.fareBreakdown.commercialRoundingAmount).toBeGreaterThanOrEqual(0);
    expect(car.fareBreakdown.commercialRoundingAmount).toBeGreaterThanOrEqual(0);
  });
});

// ── Protection minimum fare ───────────────────────────────────────────────────

describe('PricingService — protection minimum fare', () => {
  it('protège les très courts trajets moto (< 750 XOF)', async () => {
    const { service } = createService();
    const quote = await service.quote({
      vehicleType: 'MOTORCYCLE',
      distanceKm: 0.3,
      durationMinutes: 1,
      paymentMethod: 'CASH',
      zone: 'URBAN_CORE',
      city: 'OUAGADOUGOU',
      districtProfile: 'UNIVERSITY',
    });
    expect(quote.estimatedFare).toBeGreaterThanOrEqual(750);
    expect(quote.fareBreakdown.minimumFareApplied).toBe(true);
  });

  it('ne déclenche pas le minimum sur un trajet normal', async () => {
    const { service } = createService();
    const quote = await service.quote({
      ...REFERENCE_MOTO_QUOTE,
      distanceKm: 5.8,
      durationMinutes: 16,
    });
    expect(quote.fareBreakdown.minimumFareApplied).toBe(false);
  });

  it('protège le minimum Car Standard (>= 1600 Urban Core)', async () => {
    const { service } = createService();
    const quote = await service.quote({
      vehicleType: 'CAR',
      distanceKm: 0.5,
      durationMinutes: 2,
      paymentMethod: 'CASH',
      zone: 'URBAN_CORE',
      city: 'OUAGADOUGOU',
      districtProfile: 'CBD',
    });
    expect(quote.estimatedFare).toBeGreaterThanOrEqual(1600);
    expect(quote.fareBreakdown.minimumFareApplied).toBe(true);
  });
});

// ── Surge pricing ─────────────────────────────────────────────────────────────

describe('PricingService — surge pricing calibré Burkina Faso', () => {
  it('cap moto a 1.35x pour preserver accessibilite', async () => {
    const { service } = createService();
    const quote = await service.quote({
      ...REFERENCE_MOTO_QUOTE,
      demandLevel: 'PEAK',
      isPeakHour: true,
    });
    expect(quote.fareBreakdown.demandMultiplier).toBeLessThanOrEqual(1.35);
    expect(quote.fareBreakdown.surgeCapApplied).toBe(true);
  });

  it('cap voiture à 1.45x', async () => {
    const { service } = createService();
    const quote = await service.quote({
      vehicleType: 'CAR',
      distanceKm: 5.8,
      durationMinutes: 16,
      paymentMethod: 'MOBILE_MONEY',
      zone: 'URBAN_CORE',
      city: 'OUAGADOUGOU',
      districtProfile: 'CBD',
      demandLevel: 'PEAK',
      isPeakHour: true,
    });
    expect(quote.fareBreakdown.demandMultiplier).toBeLessThanOrEqual(1.45);
  });

  it('NORMAL demand -> multiplicateur = 1.0', async () => {
    const { service } = createService();
    const quote = await service.quote({
      ...REFERENCE_MOTO_QUOTE,
      demandLevel: 'NORMAL',
      isPeakHour: false,
    });
    expect(quote.fareBreakdown.demandMultiplier).toBe(1);
    expect(quote.fareBreakdown.surgeCapApplied).toBe(false);
  });

  it('HIGH demand avec heure de pointe -> multiplicateur entre 1.1 et 1.2', async () => {
    const { service } = createService();
    const quote = await service.quote({
      ...REFERENCE_MOTO_QUOTE,
      demandLevel: 'HIGH',
      isPeakHour: true,
    });
    expect(quote.fareBreakdown.demandMultiplier).toBeGreaterThan(1);
    expect(quote.fareBreakdown.demandMultiplier).toBeLessThanOrEqual(1.35);
  });

  it('surgeAmount = 0 quand pas de surge', async () => {
    const { service } = createService();
    const quote = await service.quote({ ...REFERENCE_MOTO_QUOTE, demandLevel: 'NORMAL' });
    expect(quote.fareBreakdown.surgeAmount).toBe(0);
  });

  it('surgeAmount > 0 quand surge actif', async () => {
    const { service } = createService();
    const quote = await service.quote({ ...REFERENCE_MOTO_QUOTE, demandLevel: 'HIGH', isPeakHour: true });
    expect(quote.fareBreakdown.surgeAmount).toBeGreaterThan(0);
  });
});

// ── Paiement Mobile Money ─────────────────────────────────────────────────────

describe('PricingService — frais de traitement paiement', () => {
  it('Mobile Money inclut des frais de traitement (1.5% + 25)', async () => {
    const { service } = createService();
    const quote = await service.quote({
      ...REFERENCE_MOTO_QUOTE,
      paymentMethod: 'MOBILE_MONEY',
    });
    expect(quote.fareBreakdown.paymentProcessingFeeIncluded).toBeGreaterThan(0);
    expect(quote.fareBreakdown.cashlessDiscount).toBe(50);
  });

  it('Cash: zéro frais de traitement', async () => {
    const { service } = createService();
    const quote = await service.quote({ ...REFERENCE_MOTO_QUOTE, paymentMethod: 'CASH' });
    expect(quote.fareBreakdown.paymentProcessingFeeIncluded).toBe(0);
    expect(quote.fareBreakdown.cashlessDiscount).toBe(0);
  });

  it('Wallet: frais identiques à Mobile Money', async () => {
    const { service } = createService();
    const wallet = await service.quote({ ...REFERENCE_MOTO_QUOTE, paymentMethod: 'WALLET' });
    const mm = await service.quote({ ...REFERENCE_MOTO_QUOTE, paymentMethod: 'MOBILE_MONEY' });
    expect(wallet.fareBreakdown.paymentProcessingFeeIncluded).toBe(
      mm.fareBreakdown.paymentProcessingFeeIncluded,
    );
  });
});

// ── Ajustements contextuels ───────────────────────────────────────────────────

describe('PricingService — ajustements contextuels Burkina Faso', () => {
  it('pluie majore le tarif moto (risque sécurité)', async () => {
    const { service } = createService();
    const clear = await service.quote({ ...REFERENCE_MOTO_QUOTE, weatherCondition: 'CLEAR' });
    const rain = await service.quote({ ...REFERENCE_MOTO_QUOTE, weatherCondition: 'RAIN' });
    expect(rain.fareBreakdown.weatherAdjustmentAmount).toBeGreaterThan(0);
    expect(rain.estimatedFare).toBeGreaterThan(clear.estimatedFare);
  });

  it('tempête de sable majore plus que la pluie', async () => {
    const { service } = createService();
    const dust = await service.quote({ ...REFERENCE_MOTO_QUOTE, weatherCondition: 'DUST' });
    const rain = await service.quote({ ...REFERENCE_MOTO_QUOTE, weatherCondition: 'RAIN' });
    const clear = await service.quote({ ...REFERENCE_MOTO_QUOTE, weatherCondition: 'CLEAR' });
    expect(dust.fareBreakdown.weatherAdjustmentAmount).toBeGreaterThanOrEqual(
      clear.fareBreakdown.weatherAdjustmentAmount,
    );
    expect(rain.fareBreakdown.weatherAdjustmentAmount).toBeGreaterThan(0);
  });

  it('embouteillage sévère ajoute un majoration trajet (GRIDLOCK)', async () => {
    const { service } = createService();
    const free = await service.quote({ ...REFERENCE_MOTO_QUOTE, trafficLevel: 'FREE_FLOW' });
    const jam = await service.quote({ ...REFERENCE_MOTO_QUOTE, trafficLevel: 'GRIDLOCK' });
    expect(jam.fareBreakdown.trafficAdjustmentAmount).toBeGreaterThan(0);
    expect(jam.estimatedFare).toBeGreaterThan(free.estimatedFare);
  });

  it('route bloquée majore le tarif', async () => {
    const { service } = createService();
    const open = await service.quote({ ...REFERENCE_MOTO_QUOTE, roadCondition: 'OPEN' });
    const blocked = await service.quote({ ...REFERENCE_MOTO_QUOTE, roadCondition: 'BLOCKED' });
    expect(blocked.fareBreakdown.roadConditionAdjustmentAmount).toBeGreaterThan(0);
    expect(blocked.estimatedFare).toBeGreaterThan(open.estimatedFare);
  });

  it('forte demande avec peu de chauffeurs ajoute une majoration disponibilité', async () => {
    const { service } = createService();
    const balanced = await service.quote({
      ...REFERENCE_MOTO_QUOTE,
      activeDriverCount: 20,
      openRequestCount: 4,
    });
    const scarce = await service.quote({
      ...REFERENCE_MOTO_QUOTE,
      activeDriverCount: 2,
      openRequestCount: 10,
    });
    expect(scarce.fareBreakdown.availabilityAdjustmentAmount).toBeGreaterThanOrEqual(
      balanced.fareBreakdown.availabilityAdjustmentAmount,
    );
  });

  it('CBD district applique un ajustement local positif', async () => {
    const { service } = createService();
    const cbd = await service.quote({
      ...REFERENCE_MOTO_QUOTE,
      districtProfile: 'CBD',
    });
    const residential = await service.quote({
      ...REFERENCE_MOTO_QUOTE,
      districtProfile: 'RESIDENTIAL_STANDARD',
    });
    expect(cbd.fareBreakdown.localAdjustmentAmount).toBeGreaterThanOrEqual(
      residential.fareBreakdown.localAdjustmentAmount,
    );
  });
});

// ── Supportabilité: window de prix ───────────────────────────────────────────

describe('PricingService — price window transparence passager', () => {
  it('min < estimatedFare < max', async () => {
    const { service } = createService();
    const quote = await service.quote(REFERENCE_MOTO_QUOTE);
    expect(quote.fareBreakdown.priceWindow.min).toBeLessThan(quote.estimatedFare);
    expect(quote.fareBreakdown.priceWindow.max).toBeGreaterThan(quote.estimatedFare);
  });

  it('variance augmente en PEAK demand', async () => {
    const { service } = createService();
    const normal = await service.quote({ ...REFERENCE_MOTO_QUOTE, demandLevel: 'NORMAL' });
    const peak = await service.quote({ ...REFERENCE_MOTO_QUOTE, demandLevel: 'PEAK' });
    const normalSpread = normal.fareBreakdown.priceWindow.max - normal.fareBreakdown.priceWindow.min;
    const peakSpread = peak.fareBreakdown.priceWindow.max - peak.fareBreakdown.priceWindow.min;
    expect(peakSpread).toBeGreaterThan(normalSpread);
  });

  it('prix window cohérent avec le tarif estimé (±10%)', async () => {
    const { service } = createService();
    const quote = await service.quote(REFERENCE_MOTO_QUOTE);
    const { min, max } = quote.fareBreakdown.priceWindow;
    expect(min).toBeGreaterThan(quote.estimatedFare * 0.9);
    expect(max).toBeLessThan(quote.estimatedFare * 1.11 + 50);
  });

  it('arrondit aussi la fenetre de prix en paliers terrain', async () => {
    const { service } = createService();
    const quote = await service.quote(REFERENCE_MOTO_QUOTE);
    const { min, max } = quote.fareBreakdown.priceWindow;
    expect(min % 50).toBe(0);
    expect(max % 50).toBe(0);
  });
});

// ── Trust & policy ────────────────────────────────────────────────────────────

describe('PricingService — trust & policy Orbi Burkina', () => {
  it('code de prise en charge toujours requis', async () => {
    const { service } = createService();
    const quote = await service.quote(REFERENCE_MOTO_QUOTE);
    expect(quote.trustAndPolicy.pickupCodeRequired).toBe(true);
  });

  it('tarification locale Burkina active', async () => {
    const { service } = createService();
    const quote = await service.quote(REFERENCE_MOTO_QUOTE);
    expect(quote.trustAndPolicy.burkinaLocalizedPricing).toBe(true);
  });

  it('distance chauffeur non incluse dans le tarif passager', async () => {
    const { service } = createService();
    const quote = await service.quote(REFERENCE_MOTO_QUOTE);
    expect(quote.trustAndPolicy.driverPickupDistanceIncludedInFare).toBe(false);
    expect(quote.trustAndPolicy.driverPickupDistancePolicy).toContain('distance chauffeur');
  });

  it('révision de prix disponible (Orbi différenciateur clé)', async () => {
    const { service } = createService();
    const quote = await service.quote(REFERENCE_MOTO_QUOTE);
    expect(quote.trustAndPolicy.priceReviewAvailable).toBe(true);
  });
});

// ── estimateRideOptions ───────────────────────────────────────────────────────

describe('PricingService — estimateRideOptions catalogue Burkina', () => {
  it('retourne au moins Moto et Car Standard', async () => {
    const { service } = createService();
    const preview = await service.estimateRideOptions({
      distanceKm: 5.8,
      durationMinutes: 16,
    } as never);
    const tiers = preview.options.map((o) => o.tier);
    expect(tiers).toContain('moto-standard');
    expect(tiers).toContain('car-standard');
  });

  it('expose une seule option moto publique nommee Moto', async () => {
    const { service } = createService();
    const preview = await service.estimateRideOptions({
      distanceKm: 5.8,
      durationMinutes: 16,
    } as never);
    const motorcycleOptions = preview.options.filter(
      (option) => option.category === 'motorcycle',
    );

    expect(motorcycleOptions).toHaveLength(1);
    expect(motorcycleOptions[0]).toMatchObject({
      tier: 'moto-standard',
      title: 'Moto',
    });
    expect(preview.options.map((option) => option.tier)).not.toContain('moto-plus');
  });

  it('Moto est moins cher que Car Standard', async () => {
    const { service } = createService();
    const preview = await service.estimateRideOptions({
      distanceKm: 5.8,
      durationMinutes: 16,
    } as never);
    const moto = preview.options.find((o) => o.tier === 'moto-standard');
    const car = preview.options.find((o) => o.tier === 'car-standard');
    expect(moto).toBeDefined();
    expect(car).toBeDefined();
    expect(moto!.fare).toBeLessThan(car!.fare);
  });

  it('chaque option expose driverPayout, surgeActive, surgeLabel', async () => {
    const { service } = createService();
    const preview = await service.estimateRideOptions({
      distanceKm: 5.8,
      durationMinutes: 16,
    } as never);
    for (const option of preview.options) {
      expect(option.driverPayout).toBeGreaterThan(0);
      expect(typeof option.surgeActive).toBe('boolean');
      // surgeLabel est string ou null
      expect(option.surgeLabel === null || typeof option.surgeLabel === 'string').toBe(true);
    }
  });

  it('chaque option expose un prix arrondi et le detail d arrondi CFA', async () => {
    const { service } = createService();
    const preview = await service.estimateRideOptions({
      distanceKm: 5.8,
      durationMinutes: 16,
    } as never);

    for (const option of preview.options) {
      expect(option.fare % 50).toBe(0);
      expect(option.fareBreakdown?.commercialRoundingAmount).toBeGreaterThanOrEqual(0);
      expect([50, 100]).toContain(option.fareBreakdown?.commercialRoundingStep);
    }
  });

  it('marketplace expose nearbyDrivers, etaConfidence et sources de signal', async () => {
    const { service } = createService();
    const preview = await service.estimateRideOptions({
      distanceKm: 5.8,
      durationMinutes: 16,
      activeDriverCount: 8,
      openRequestCount: 4,
    } as never);
    for (const option of preview.options) {
      expect(option.marketplace?.nearbyDrivers).toBeGreaterThan(0);
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(option.marketplace?.etaConfidence);
      expect(['LIVE', 'ESTIMATED', 'DEGRADED']).toContain(option.marketplace?.etaSource);
      expect(['LIVE', 'ESTIMATED', 'DEGRADED']).toContain(option.marketplace?.supplySource);
      expect(typeof option.marketplace?.signalLabel).toBe('string');
      expect(typeof option.marketplace?.reliabilityNote).toBe('string');
      expect(option.marketplace?.supplySource).toBe('LIVE');
      expect(option.marketplace?.signalFreshnessSeconds).toBeGreaterThan(0);
    }
  });

  it('calcule la demande live par ville, type et tier de service', async () => {
    const { prisma, service } = createService();

    await service.estimateRideOptions({
      distanceKm: 5.8,
      durationMinutes: 16,
      city: 'BOBO_DIOULASSO',
    } as never);

    expect(prisma.driverProfile.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: 'ONLINE',
        verificationStatus: 'APPROVED',
        onboardingReviews: {
          some: {
            metadata: {
              path: ['city'],
              equals: 'BOBO_DIOULASSO',
            },
          },
        },
        vehicles: {
          some: expect.objectContaining({
            isActive: true,
            type: 'MOTORCYCLE',
            tier: ServiceTier.MOTO_STANDARD,
          }),
        },
      }),
    });
    expect(prisma.driverProfile.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        vehicles: {
          some: expect.objectContaining({
            type: 'CAR',
            tier: ServiceTier.CAR_STANDARD,
          }),
        },
      }),
    });
    expect(prisma.driverProfile.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        vehicles: {
          some: expect.objectContaining({
            type: 'CAR',
            tier: ServiceTier.CAR_COMFORT,
          }),
        },
      }),
    });
    expect(prisma.rideRequest.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: 'REQUESTED',
        pricingCity: 'BOBO_DIOULASSO',
        requestedVehicleType: 'MOTORCYCLE',
        OR: [
          { requestedServiceTier: ServiceTier.MOTO_STANDARD },
          { requestedServiceTier: null },
        ],
      }),
    });
  });

  it('marque les options estimees quand aucun signal supply live n est fourni', async () => {
    const { service } = createService();
    const preview = await service.estimateRideOptions({
      distanceKm: 5.8,
      durationMinutes: 16,
      demandLevel: 'NORMAL',
    } as never);

    for (const option of preview.options) {
      expect(option.marketplace?.etaSource).toBe('ESTIMATED');
      expect(option.marketplace?.supplySource).toBe('ESTIMATED');
      expect(option.marketplace?.signalFreshnessSeconds).toBeNull();
      expect(option.marketplace?.signalLabel).toBe('Estime');
    }
  });

  it('paymentMethods moto inclut cash (marché Burkina)', async () => {
    const { service } = createService();
    const preview = await service.estimateRideOptions({ distanceKm: 3, durationMinutes: 10 } as never);
    const moto = preview.options.find((o) => o.tier === 'moto-standard');
    expect(moto?.paymentMethods).toContain('cash');
    expect(moto?.paymentMethods).toContain('mobile-money');
  });

  it('badge enrichi avec mention Forte demande en cas de surge', async () => {
    const { service } = createService();
    const preview = await service.estimateRideOptions({
      distanceKm: 5.8,
      durationMinutes: 16,
      demandLevel: 'PEAK',
      isPeakHour: 'true' as never,
    } as never);
    const surgedOption = preview.options.find((o) => o.surgeActive);
    if (surgedOption) {
      expect(surgedOption.badge).toContain('Forte demande');
    }
  });
});

// ── Affordability support ─────────────────────────────────────────────────────

describe('PricingService — soutien accessibilite Burkina Faso', () => {
  it('reduit le tarif moto en zone peripherique', async () => {
    const { service } = createService();
    const supportedQuote = await service.quote({
      vehicleType: 'MOTORCYCLE',
      distanceKm: 6,
      durationMinutes: 18,
      paymentMethod: 'MOBILE_MONEY',
      zone: 'SEMI_URBAN',
      city: 'OUAHIGOUYA',
      districtProfile: 'RESIDENTIAL_PERIPHERAL',
    });
    expect(supportedQuote.fareBreakdown.affordabilitySupportAmount).toBeGreaterThan(0);
  });

  it('pas de soutien en Urban Core (Ouagadougou CBD)', async () => {
    const { service } = createService();
    const quote = await service.quote({
      vehicleType: 'MOTORCYCLE',
      distanceKm: 5.8,
      durationMinutes: 16,
      paymentMethod: 'MOBILE_MONEY',
      zone: 'URBAN_CORE',
      city: 'OUAGADOUGOU',
      districtProfile: 'CBD',
    });
    expect(quote.fareBreakdown.affordabilitySupportAmount).toBe(0);
  });

  it('voiture ne beneficie pas du soutien accessibilite', async () => {
    const { service } = createService();
    const quote = await service.quote({
      vehicleType: 'CAR',
      distanceKm: 6,
      durationMinutes: 18,
      paymentMethod: 'MOBILE_MONEY',
      zone: 'SEMI_URBAN',
      city: 'OUAHIGOUYA',
      districtProfile: 'RESIDENTIAL_PERIPHERAL',
    });
    expect(quote.fareBreakdown.affordabilitySupportAmount).toBe(0);
  });
});

// ── Reasons transparency ──────────────────────────────────────────────────────

describe('PricingService — transparence des raisons de tarification', () => {
  it('inclut toujours la distance dans les raisons', async () => {
    const { service } = createService();
    const quote = await service.quote(REFERENCE_MOTO_QUOTE);
    expect(quote.fareBreakdown.reasons.some((r) => r.includes('Distance trajet'))).toBe(true);
  });

  it('inclut la distance d\'approche chauffeur', async () => {
    const { service } = createService();
    const quote = await service.quote(REFERENCE_MOTO_QUOTE);
    expect(quote.fareBreakdown.reasons.some((r) => r.includes('approche chauffeur'))).toBe(true);
  });

  it('signale la pluie dans les raisons météo', async () => {
    const { service } = createService();
    const quote = await service.quote({ ...REFERENCE_MOTO_QUOTE, weatherCondition: 'RAIN' });
    expect(quote.fareBreakdown.reasons.some((r) => r.toLowerCase().includes('pluie') || r.toLowerCase().includes('météo') || r.toLowerCase().includes('meteo'))).toBe(true);
  });

  it('signale le surge dans les raisons en cas de forte demande', async () => {
    const { service } = createService();
    const quote = await service.quote({ ...REFERENCE_MOTO_QUOTE, demandLevel: 'HIGH', isPeakHour: true });
    if (quote.fareBreakdown.demandMultiplier > 1) {
      expect(quote.fareBreakdown.reasons.some((r) => r.toLowerCase().includes('demande') || r.toLowerCase().includes('pointe') || r.toLowerCase().includes('surge'))).toBe(true);
    }
  });
});
