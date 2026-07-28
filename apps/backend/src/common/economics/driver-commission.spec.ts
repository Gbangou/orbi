import {
  calculateDriverEconomics,
  roundCommissionForDriverSettlement,
} from './driver-commission';

describe('driver commission economics', () => {
  it('arrondit la commission sur un palier CFA sans depasser le taux affiche', () => {
    const economics = calculateDriverEconomics(1500);

    expect(economics.rawCommissionAmount).toBe(180);
    expect(economics.commissionAmount).toBe(180);
    expect(economics.driverPayout).toBe(1320);
    expect(economics.commissionRoundingDiscount).toBe(0);
    expect(economics.settlementRoundingStep).toBe(10);
  });

  it('evite les commissions impraticables comme 261 XOF', () => {
    const economics = calculateDriverEconomics(1450);

    expect(economics.rawCommissionAmount).toBe(174);
    expect(economics.commissionAmount).toBe(170);
    expect(economics.driverPayout).toBe(1280);
  });

  it('garde aussi les paliers propres pendant l onboarding chauffeur', () => {
    const economics = calculateDriverEconomics(1500, {
      driverOnboardingDays: 1,
    });

    expect(economics.rawCommissionAmount).toBe(150);
    expect(economics.commissionAmount).toBe(150);
    expect(economics.driverPayout).toBe(1350);
  });

  it('protege les entrees invalides', () => {
    expect(roundCommissionForDriverSettlement(Number.NaN)).toBe(0);
    expect(roundCommissionForDriverSettlement(-20)).toBe(0);
  });
});
