import {
  extractPickupCode,
  formatTripEventLabel,
  formatVehicleLabel,
  generatePickupCode,
  resolvePickupCodeChallenge,
  toAmount,
} from './trips.utils';

describe('toAmount', () => {
  it('returns 0 for null', () => {
    expect(toAmount(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(toAmount(undefined)).toBe(0);
  });

  it('converts a numeric value to a number', () => {
    expect(toAmount(1800)).toBe(1800);
  });

  it('converts a numeric string to a number', () => {
    expect(toAmount('2500')).toBe(2500);
  });
});

describe('generatePickupCode', () => {
  it('returns a 4-digit numeric string', () => {
    const code = generatePickupCode();
    expect(code).toMatch(/^\d{4}$/);
  });

  it('always returns a value between 1000 and 9999', () => {
    for (let i = 0; i < 20; i++) {
      const code = parseInt(generatePickupCode(), 10);
      expect(code).toBeGreaterThanOrEqual(1000);
      expect(code).toBeLessThanOrEqual(9999);
    }
  });
});

describe('extractPickupCode', () => {
  it('extracts the code from a PICKUP_CODE_ISSUED event', () => {
    const events = [
      {
        eventType: 'ROUTE_POSITION_RECORDED',
        payload: { sourceRole: 'DRIVER' },
      },
      {
        eventType: 'PICKUP_CODE_ISSUED',
        payload: { pickupCode: '4821' },
      },
    ];

    expect(extractPickupCode(events)).toBe('4821');
  });

  it('extracts the latest issued code when a code has been rotated', () => {
    const events = [
      {
        eventType: 'PICKUP_CODE_ISSUED',
        payload: { pickupCode: '4821' },
      },
      {
        eventType: 'PICKUP_CODE_ISSUED',
        payload: { pickupCode: '7394' },
      },
    ];

    expect(extractPickupCode(events)).toBe('7394');
  });

  it('returns null when no PICKUP_CODE_ISSUED event is present', () => {
    const events = [{ eventType: 'TRIP_STARTED', payload: {} }];

    expect(extractPickupCode(events)).toBeNull();
  });

  it('returns null when the pickup event has no pickupCode field', () => {
    const events = [{ eventType: 'PICKUP_CODE_ISSUED', payload: {} }];

    expect(extractPickupCode(events)).toBeNull();
  });

  it('handles events with no payload gracefully', () => {
    const events = [{ eventType: 'PICKUP_CODE_ISSUED' }];

    expect(extractPickupCode(events)).toBeNull();
  });
});

describe('resolvePickupCodeChallenge', () => {
  it('returns expiry and failed attempt metadata without exposing submitted codes', () => {
    const issuedAt = new Date('2026-05-01T09:00:00.000Z');
    const events = [
      {
        eventType: 'PICKUP_CODE_ISSUED',
        payload: {
          pickupCode: '4821',
          expiresAt: '2026-05-01T09:10:00.000Z',
          maxAttempts: 5,
        },
        createdAt: issuedAt,
      },
      {
        eventType: 'PICKUP_CODE_VERIFICATION_FAILED',
        payload: { reason: 'MISMATCH' },
        createdAt: new Date('2026-05-01T09:02:00.000Z'),
      },
    ];

    expect(resolvePickupCodeChallenge(events)).toEqual({
      pickupCode: '4821',
      issuedAt,
      expiresAt: new Date('2026-05-01T09:10:00.000Z'),
      maxAttempts: 5,
      failedAttempts: 1,
      latestFailedAttemptAt: new Date('2026-05-01T09:02:00.000Z'),
    });
  });
});

describe('formatTripEventLabel', () => {
  it('returns the human-readable label for known event types', () => {
    const label = formatTripEventLabel('TRIP_STARTED');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe('TRIP_STARTED');
  });

  it('falls back to the raw event type for unknown types', () => {
    expect(formatTripEventLabel('UNKNOWN_EVENT_TYPE')).toBe(
      'UNKNOWN_EVENT_TYPE',
    );
  });
});

describe('formatVehicleLabel', () => {
  it('concatenates make and model with a space', () => {
    expect(formatVehicleLabel({ make: 'Yamaha', model: 'Crypton' })).toBe(
      'Yamaha Crypton',
    );
  });
});
