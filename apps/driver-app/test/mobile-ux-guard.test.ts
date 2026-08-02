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
    expect(source).toContain('label="Envoyer le profil"');
  });

  it('keeps auth first-screen copy bounded', () => {
    const source = readAppFile('app/auth.tsx');

    expect(source).toContain('styles.trustLine} numberOfLines={2}');
    expect(source).toContain('styles.legalFooter} numberOfLines={3}');
    expect(source).toContain('styles.passwordHint} numberOfLines={2}');
  });

  it('keeps active mission maps and secondary actions balanced on compact screens', () => {
    const source = readAppFile('app/(tabs)/offres.tsx');
    const offerCardSource = readAppFile('lib/offer-card.tsx');
    const realtimeWidgetSource = readAppFile('lib/realtime-widgets.tsx');

    expect(source).toContain('missionMap: { height: 300');
    expect(source).toContain('numberOfLines={2}>{missionStageCopy.title}</Text>');
    expect(source).toContain('styles.missionPaymentValue} numberOfLines={1}');
    expect(source).toContain('minHeight: 44');
    expect(source).toContain('Arrivee');
    expect(source).not.toContain('>ETA</Text>');
    expect(source).toContain('Course mise à jour');
    expect(source).not.toContain('Trajet mis a jour');
    expect(source).toContain('incomingPulse:');
    expect(source).toContain('width: 38');
    expect(source).toContain('minHeight: 54');
    expect(source).toContain('À confirmer');
    expect(source).toContain('headerTitle: { fontSize: 20');
    expect(source).toContain('emptyTitle:');
    expect(source).toContain('fontSize: 17');
    expect(source).toContain('width: 54');
    expect(source).not.toContain('formatDriverOfferDistance(incomingOffer.pickupDistanceKm, "-")');
    expect(source).not.toContain('formatDriverOfferDistance(incomingOffer.distanceKm, "-")');
    expect(offerCardSource).toContain('Arrivée');
    expect(offerCardSource).not.toContain('>ETA</Text>');
    expect(realtimeWidgetSource).toContain('Arrivee');
    expect(realtimeWidgetSource).not.toContain('>ETA</Text>');
  });

  it('keeps driver mission actions clear and premium', () => {
    const source = readAppFile('app/(tabs)/offres.tsx');
    const flowSource = readAppFile('lib/driver-active-flow.ts');
    const offerCardSource = readAppFile('lib/offer-card.tsx');

    expect(source).toContain('Départ sécurisé');
    expect(source).toContain('Passager à bord, prêt à partir');
    expect(source).toContain('Démarrer la course');
    expect(source).toContain('Espèces');
    expect(source).not.toContain('Checklist depart');
    expect(source).not.toContain('Demarrer la course');
    expect(source).not.toContain('A confirmer');
    expect(source).not.toContain('Pickup</Text>');
    expect(flowSource).toContain('Prise en charge');
    expect(flowSource).not.toContain('Pickup ~');
    expect(flowSource).not.toContain('ETA en attente');
    expect(offerCardSource).toContain('Prise en charge');
  });

  it('keeps profile support and onboarding copy production-ready', () => {
    const source = readAppFile('app/(tabs)/profil.tsx');

    expect(source).toContain('Validation chauffeur');
    expect(source).toContain('label="Préparer les justificatifs"');
    expect(source).toContain('placeholder="Expliquez la situation"');
    expect(source).toContain('borderRadius: 4');
    expect(source).not.toContain('Soumettre le profil');
    expect(source).not.toContain('Preparer les liens documentaires');
    expect(source).not.toContain('Onboarding securise');
    expect(source).not.toContain('demande(s) ouverte(s)');
    expect(source).not.toContain('borderRadius: 999');
    expect(source).not.toContain('borderRadius: 22');
    expect(source).not.toContain('borderRadius: 18');
    expect(source).not.toContain('borderRadius: 16');
    expect(source).not.toContain('borderRadius: 14');
  });

  it('keeps earnings finance surfaces concise and production-ready', () => {
    const source = readAppFile('app/(tabs)/revenus.tsx');
    const signalSource = readAppFile('lib/driver-earnings-signal.ts');
    const flowSource = readAppFile('lib/driver-active-flow.ts');

    expect(source).toContain('formatDriverTripCountLabel');
    expect(source).not.toContain('course(s)');
    expect(source).not.toContain('actualises des que');
    expect(source).not.toContain('borderRadius: 16');
    expect(source).not.toContain('borderRadius: 14');
    expect(source).not.toContain('borderRadius: 12');
    expect(source).not.toContain('borderRadius: 10');
    expect(source).not.toContain('borderRadius: 8');
    expect(signalSource).toContain('Montant à confirmer');
    expect(signalSource).not.toContain('Montant a confirmer');
    expect(signalSource).not.toContain('pickups courts');
    expect(flowSource).toContain('Revenus à jour');
    expect(flowSource).not.toContain('Revenus a jour');
  });
});
