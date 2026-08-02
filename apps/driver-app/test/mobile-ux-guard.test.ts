import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(__dirname, '..');

function readAppFile(relativePath: string) {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

describe('driver mobile UX guards', () => {
  it('keeps onboarding copy bounded on compact Android screens', () => {
    const source = readAppFile('app/onboarding.tsx');

    expect(source).toContain('benefitTitle} numberOfLines={1}');
    expect(source).toContain('benefitDesc} numberOfLines={2} ellipsizeMode="tail"');
    expect(source).toContain('docDesc} numberOfLines={1}');
    expect(source).toContain('label="Soumettre le profil"');
  });

  it('keeps auth first-screen copy bounded', () => {
    const source = readAppFile('app/auth.tsx');

    expect(source).toContain('styles.trustLine} numberOfLines={2}');
    expect(source).toContain('styles.legalFooter} numberOfLines={3}');
    expect(source).toContain('styles.passwordHint} numberOfLines={2}');
  });

  it('keeps active mission maps and secondary actions balanced on compact screens', () => {
    const source = readAppFile('app/(tabs)/offres.tsx');

    expect(source).toContain('missionMap: { height: 340');
    expect(source).toContain('numberOfLines={2}>{missionStageCopy.title}</Text>');
    expect(source).toContain('styles.missionPaymentValue} numberOfLines={1}');
    expect(source).toContain('minHeight: 44');
    expect(source).toContain('A confirmer');
    expect(source).toContain('headerTitle: { fontSize: 20');
    expect(source).toContain('emptyTitle:');
    expect(source).toContain('fontSize: 17');
    expect(source).toContain('width: 54');
    expect(source).not.toContain('formatDriverOfferDistance(incomingOffer.pickupDistanceKm, "-")');
    expect(source).not.toContain('formatDriverOfferDistance(incomingOffer.distanceKm, "-")');
  });
});
