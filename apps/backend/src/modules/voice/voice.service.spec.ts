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
});
