import { FeatureFlagsService } from './feature-flags.service';

describe('FeatureFlagsService', () => {
  function createService(values: Record<string, unknown>) {
    const configService = {
      get: jest.fn((key: string) => values[key]),
    };

    return new FeatureFlagsService(configService as never);
  }

  it('enables a flag when rollout mode is on', () => {
    const service = createService({
      'featureFlags.payments': 'on',
      'featureFlags.paymentsAllowlist': [],
    });

    expect(service.isEnabled('payments', { actorId: 'user-1' })).toBe(true);
  });

  it('keeps a flag off unless the actor is allowlisted', () => {
    const service = createService({
      'featureFlags.payments': 'off',
      'featureFlags.paymentsAllowlist': ['user-2'],
    });

    expect(service.isEnabled('payments', { actorId: 'user-1' })).toBe(false);
    expect(service.isEnabled('payments', { actorId: 'user-2' })).toBe(true);
  });

  it('supports deterministic canary rollout by actor id', () => {
    const service = createService({
      'featureFlags.payments': 'canary:100',
      'featureFlags.paymentsAllowlist': [],
    });

    expect(service.isEnabled('payments', { actorId: 'user-1' })).toBe(true);
  });

  it('rejects dirty canary rollout percentages instead of parsing partial numbers', () => {
    const service = createService({
      'featureFlags.payments': 'canary:50abc',
      'featureFlags.paymentsAllowlist': [],
    });

    expect(service.getMode('payments')).toBe('off');
    expect(service.isEnabled('payments', { actorId: 'user-1' })).toBe(false);
  });
});
