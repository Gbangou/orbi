import {
  looksLikeUnvettedEnglishMessage,
  resolveDisplayableApiErrorMessage,
  OrbiApiError,
} from '@orbi/api';

/**
 * Incident reel (2026-07) : un backend a laisse passer des messages
 * d'exception en anglais non traduits ("Trip completion is blocked by a
 * critical route monitoring alert.", "Riders can only cancel a trip from
 * the app.") qui se sont affiches tels quels dans l'app mobile en francais.
 *
 * Ce filtre est le dernier rempart cote client : quel que soit le texte
 * qu'un backend renvoie a l'avenir, un message qui ressemble a du texte
 * technique anglais non verifie ne doit jamais atteindre l'ecran — on
 * retombe sur le message generique plutot que d'exposer du texte brut.
 */
describe('mobile display safety net for backend error messages', () => {
  it('flags the exact historical English leaks', () => {
    expect(
      looksLikeUnvettedEnglishMessage(
        'Trip completion is blocked by a critical route monitoring alert.',
      ),
    ).toBe(true);
    expect(
      looksLikeUnvettedEnglishMessage(
        'Riders can only cancel a trip from the app.',
      ),
    ).toBe(true);
  });

  it('flags other plausible English technical messages', () => {
    expect(
      looksLikeUnvettedEnglishMessage('Driver profile could not be loaded.'),
    ).toBe(true);
    expect(
      looksLikeUnvettedEnglishMessage('Scheduled ride not found.'),
    ).toBe(true);
    expect(
      looksLikeUnvettedEnglishMessage(
        'Trusted contact not found for this rider.',
      ),
    ).toBe(true);
  });

  it('does not flag real French copy used across the app', () => {
    const knownGoodFrenchMessages = [
      'Le depart et la destination doivent etre differents.',
      'Code de prise en charge invalide.',
      'Seules les courses terminees peuvent etre notees.',
      'Cette course a deja ete notee.',
      'Seuls les chauffeurs approuves peuvent passer en ligne.',
      'La demande de course n a pas pu etre creee.',
      'Profil passager authentifie introuvable.',
      'Tentative de paiement introuvable.',
      'Demande de course introuvable.',
      'URL de redirection de paiement invalide.',
      'Paiements temporairement indisponibles pour ce compte pendant le deploiement progressif.',
      'Code promo invalide ou inactif.',
      'Ce code promo a expire.',
      'Ce code promo n est pas encore actif.',
      'Connexion instable. Reessayez dans un instant.',
      'La course est deja annulee.',
      'La course est deja terminee.',
    ];

    for (const message of knownGoodFrenchMessages) {
      expect(looksLikeUnvettedEnglishMessage(message)).toBe(false);
    }
  });

  it('falls back instead of displaying an unvetted English backend message', () => {
    const error = new OrbiApiError(
      'Trip completion is blocked by a critical route monitoring alert.',
      400,
    );

    expect(resolveDisplayableApiErrorMessage(error, 'Reessayez plus tard.')).toBe(
      'Reessayez plus tard.',
    );
  });

  it('passes through a well-formed French backend message unchanged', () => {
    const error = new OrbiApiError(
      'Le depart et la destination doivent etre differents.',
      400,
    );

    expect(resolveDisplayableApiErrorMessage(error, 'Reessayez plus tard.')).toBe(
      'Le depart et la destination doivent etre differents.',
    );
  });
});
