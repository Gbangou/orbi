import { canReceiveRealtimeEvent, parseRealtimeEvent } from './realtime.types';
import type { RealtimeEvent, RealtimeEventFilter } from './realtime.types';

/**
 * OWASP API1 (BOLA/IDOR) + API3 (Exposition excessive de données) — invariants
 * d'isolation du flux SSE.
 *
 * La gate canReceiveRealtimeEvent est l'unique frontière d'autorisation entre
 * un événement publié et un client SSE connecté. Ces tests verrouillent chaque
 * chemin d'accès pour qu'un futur refactoring ne puisse pas élargir la visibilité.
 *
 * Modèle de menace :
 * - Un rider abonné à /trips/stream ne doit JAMAIS recevoir les événements d'un autre rider,
 *   même si l'événement partage le même channel/type.
 * - Un chauffeur abonné à /trips/stream ne doit PAS recevoir les événements adressés
 *   à un autre chauffeur, ni les événements du canal admin.
 * - Les rôles Admin/OPS/SUPPORT ont une visibilité étendue intentionnelle (outils
 *   opérationnels), mais ce fait est testé explicitement pour rendre visible tout élargissement.
 * - parseRealtimeEvent valide chaque champ reçu sur le backplane partagé pour que
 *   les messages injectés ou malformés soient rejetés avant d'atteindre les abonnés.
 */

// ── Fonctions utilitaires ─────────────────────────────────────────────────

function makeEvent(overrides: Partial<RealtimeEvent> = {}): RealtimeEvent {
  return {
    id: 'evt-1',
    channel: 'trip',
    type: 'trip.updated',
    entityId: 'trip-1',
    createdAt: '2026-05-23T10:00:00.000Z',
    ...overrides,
  };
}

function makeFilter(
  overrides: Partial<RealtimeEventFilter> = {},
): RealtimeEventFilter {
  return {
    role: 'RIDER',
    actorId: 'user-1',
    riderId: 'rider-1',
    driverId: null,
    ...overrides,
  };
}

// ── RIDER isolation ──────────────────────────────────────────────────────────

describe('canReceiveRealtimeEvent — RIDER isolation (OWASP API1 BOLA)', () => {
  it('allows a rider to receive a trip event scoped to their own riderId', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({ channel: 'trip', riderId: 'rider-1' }),
        makeFilter({ role: 'RIDER', riderId: 'rider-1' }),
      ),
    ).toBe(true);
  });

  it('blocks a rider from receiving a trip event belonging to a different rider (IDOR)', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({ channel: 'trip', riderId: 'rider-2' }),
        makeFilter({ role: 'RIDER', riderId: 'rider-1' }),
      ),
    ).toBe(false);
  });

  it('blocks a rider when the event has no riderId (driver-targeted or system event)', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({ channel: 'trip', riderId: undefined }),
        makeFilter({ role: 'RIDER', riderId: 'rider-1' }),
      ),
    ).toBe(false);
  });

  it('blocks a rider from receiving admin-channel events', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({ channel: 'admin', type: 'system.health-alert' }),
        makeFilter({ role: 'RIDER', riderId: 'rider-1' }),
      ),
    ).toBe(false);
  });

  it('blocks a rider whose riderId is null from receiving any event (session without profile)', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({ channel: 'trip', riderId: 'rider-1' }),
        makeFilter({ role: 'RIDER', riderId: null }),
      ),
    ).toBe(false);
  });

  it('blocks a ride-request event for another rider from reaching the wrong subscriber', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({
          channel: 'ride-request',
          type: 'ride-request.created',
          riderId: 'rider-99',
        }),
        makeFilter({ role: 'RIDER', riderId: 'rider-1' }),
      ),
    ).toBe(false);
  });
});

// ── DRIVER isolation ─────────────────────────────────────────────────────────

describe('canReceiveRealtimeEvent — DRIVER isolation (OWASP API1 BOLA)', () => {
  it('allows a driver to receive an addressed trip event for their own driverId', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({ channel: 'trip', driverId: 'driver-1' }),
        makeFilter({ role: 'DRIVER', driverId: 'driver-1', riderId: null }),
      ),
    ).toBe(true);
  });

  it('blocks a driver from receiving a trip event addressed to another driver (IDOR)', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({ channel: 'trip', driverId: 'driver-2' }),
        makeFilter({ role: 'DRIVER', driverId: 'driver-1', riderId: null }),
      ),
    ).toBe(false);
  });

  it('allows a driver to receive a market ride-request event (no driverId — broadcast)', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({
          channel: 'ride-request',
          type: 'ride-request.created',
          riderId: 'rider-1',
        }),
        makeFilter({ role: 'DRIVER', driverId: 'driver-1', riderId: null }),
      ),
    ).toBe(true);
  });

  it('blocks a driver from receiving admin-channel events', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({ channel: 'admin', type: 'system.health-alert' }),
        makeFilter({ role: 'DRIVER', driverId: 'driver-1', riderId: null }),
      ),
    ).toBe(false);
  });

  it('blocks a driver whose driverId is null from receiving addressed events', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({ channel: 'trip', driverId: 'driver-1' }),
        makeFilter({ role: 'DRIVER', driverId: null, riderId: null }),
      ),
    ).toBe(false);
  });
});

// ── ADMIN / OPS / SUPPORT wide access ────────────────────────────────────────

describe('canReceiveRealtimeEvent — administrative roles have broad visibility', () => {
  const broadRoles = ['ADMIN', 'OPS', 'SUPPORT'] as const;

  for (const role of broadRoles) {
    it(`${role} receives trip events`, () => {
      expect(
        canReceiveRealtimeEvent(
          makeEvent({ channel: 'trip', riderId: 'rider-42' }),
          makeFilter({ role, riderId: null, driverId: null }),
        ),
      ).toBe(true);
    });

    it(`${role} receives admin-channel events`, () => {
      expect(
        canReceiveRealtimeEvent(
          makeEvent({ channel: 'admin', type: 'system.alert' }),
          makeFilter({ role, riderId: null, driverId: null }),
        ),
      ).toBe(true);
    });

    it(`${role} receives ride-request events`, () => {
      expect(
        canReceiveRealtimeEvent(
          makeEvent({ channel: 'ride-request', riderId: 'rider-1' }),
          makeFilter({ role, riderId: null, driverId: null }),
        ),
      ).toBe(true);
    });
  }
});

// ── Unknown / unrecognised role ───────────────────────────────────────────────

describe('canReceiveRealtimeEvent — unknown role is denied by default', () => {
  it('denies an unknown role from receiving any event', () => {
    expect(
      canReceiveRealtimeEvent(
        makeEvent({ channel: 'trip' }),
        makeFilter({ role: 'UNKNOWN_ROLE' }),
      ),
    ).toBe(false);
  });
});

// ── parseRealtimeEvent — input validation (OWASP API8 injection guard) ───────

describe('parseRealtimeEvent — rejects malformed backplane messages', () => {
  const validRaw = {
    id: 'evt-1',
    channel: 'trip',
    type: 'trip.updated',
    entityId: 'trip-1',
    createdAt: '2026-05-23T10:00:00.000Z',
  };

  it('accepts a well-formed event', () => {
    expect(parseRealtimeEvent(validRaw)).not.toBeNull();
  });

  it('rejects null', () => {
    expect(parseRealtimeEvent(null)).toBeNull();
  });

  it('rejects a non-object primitive', () => {
    expect(parseRealtimeEvent('{"id":"x"}')).toBeNull();
  });

  it('rejects an event with a missing id', () => {
    const noId: Partial<typeof validRaw> = { ...validRaw };
    delete noId.id;

    expect(parseRealtimeEvent(noId)).toBeNull();
  });

  it('rejects an event with an invalid channel', () => {
    expect(
      parseRealtimeEvent({ ...validRaw, channel: 'private-messages' }),
    ).toBeNull();
  });

  it('rejects an event with an oversized id (> 512 chars)', () => {
    expect(parseRealtimeEvent({ ...validRaw, id: 'x'.repeat(513) })).toBeNull();
  });

  it('rejects an event with an empty type string', () => {
    expect(parseRealtimeEvent({ ...validRaw, type: '' })).toBeNull();
  });

  it('rejects an event with an invalid ISO date', () => {
    expect(
      parseRealtimeEvent({ ...validRaw, createdAt: 'not-a-date' }),
    ).toBeNull();
  });

  it('rejects an event with an oversized entityId (> 256 chars)', () => {
    expect(
      parseRealtimeEvent({ ...validRaw, entityId: 'x'.repeat(257) }),
    ).toBeNull();
  });

  it('rejects an event where payload is an array instead of an object', () => {
    expect(
      parseRealtimeEvent({ ...validRaw, payload: ['injected'] }),
    ).toBeNull();
  });

  it('accepts an event with a well-formed optional payload', () => {
    expect(
      parseRealtimeEvent({
        ...validRaw,
        payload: { amount: 2400, currency: 'XOF' },
      }),
    ).not.toBeNull();
  });

  it('accepts an event without optional fields (riderId, driverId, actorRole)', () => {
    expect(parseRealtimeEvent(validRaw)).toMatchObject({
      id: 'evt-1',
      channel: 'trip',
      riderId: undefined,
      driverId: undefined,
      actorRole: undefined,
    });
  });
});
