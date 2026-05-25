import { VoiceService } from './voice.service';

describe('VoiceService', () => {
  const service = new VoiceService();

  it('detects a destination command with a strong Burkina Faso landmark match', () => {
    const result = service.resolveLocationIntent({
      transcript: 'Je vais a Ouaga 2000',
    });

    expect(result.intentType).toBe('destination');
    expect(result.suggestions[0]?.name).toBe('Ouaga 2000');
    expect(result.suggestions[0]).toEqual(
      expect.objectContaining({
        id: 'ouaga-2000',
        address: 'Ouaga 2000, Ouagadougou',
        latitude: expect.any(Number),
        longitude: expect.any(Number),
      }),
    );
    expect(result.needsClarification).toBe(false);
  });

  it('keeps clarification enabled when the transcript is weak or ambiguous', () => {
    const result = service.resolveLocationIntent({
      transcript: 'Bonjour je cherche un quartier',
    });

    expect(result.intentType).toBe('unknown');
    expect(result.needsClarification).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('detects a pickup intent when the rider describes their current location', () => {
    const result = service.resolveLocationIntent({
      transcript: 'Je suis a Zone du Bois',
    });

    expect(result.intentType).toBe('pickup');
    expect(result.suggestions[0]?.id).toBe('ouaga-zone-du-bois');
    expect(result.needsClarification).toBe(false);
  });

  it('normalizes accented characters and resolves the airport landmark', () => {
    const result = service.resolveLocationIntent({
      transcript: 'Je vais a l aeroport de Ouagadougou',
    });

    expect(result.intentType).toBe('destination');
    expect(result.suggestions[0]?.id).toBe('ouaga-aeroport-international');
    expect(result.confidence).toBeGreaterThanOrEqual(0.74);
    expect(result.needsClarification).toBe(false);
  });

  it('returns the default fallback suggestions when no landmark matches the transcript', () => {
    const result = service.resolveLocationIntent({
      transcript: 'xyzxyz blabla inconnu',
    });

    expect(result.suggestions.length).toBe(2);
    expect(result.suggestions[0]?.id).toBe('ouaga-2000');
    expect(result.suggestions[1]?.id).toBe('ouaga-universite-joseph-ki-zerbo');
    expect(result.needsClarification).toBe(true);
  });

  it('returns at most three suggestions even when many landmarks partially match', () => {
    const result = service.resolveLocationIntent({
      transcript: 'quartier secteur zone bobo ouaga sarfalao',
    });

    expect(result.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('always sets the locale to fr-BF and echoes the original transcript', () => {
    const transcript = 'Aller a Koulouba';
    const result = service.resolveLocationIntent({ transcript });

    expect(result.locale).toBe('fr-BF');
    expect(result.transcript).toBe(transcript);
  });

  it('resolves Bobo-Dioulasso landmarks by their local aliases', () => {
    const result = service.resolveLocationIntent({
      transcript: 'Je vais a la gare routiere de bobo-dioulasso',
    });

    expect(result.intentType).toBe('destination');
    expect(result.suggestions[0]?.id).toBe('bobo-gare-routiere');
    expect(result.needsClarification).toBe(false);
  });
});
