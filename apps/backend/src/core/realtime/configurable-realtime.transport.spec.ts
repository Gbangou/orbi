import { Logger } from '@nestjs/common';
import { ConfigurableRealtimeTransport } from './configurable-realtime.transport';
import { InMemoryRealtimeTransport } from './in-memory-realtime.transport';
import { firstValueFrom, take, timeout } from 'rxjs';
import type { RealtimeTransport } from './realtime.types';

describe('ConfigurableRealtimeTransport', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  class TestableConfigurableRealtimeTransport extends ConfigurableRealtimeTransport {
    constructor(
      configService: { get: jest.Mock },
      inMemoryTransport: InMemoryRealtimeTransport,
      private readonly delegate: RealtimeTransport,
    ) {
      super(configService as never, inMemoryTransport);
    }

    protected override resolveDelegate(): RealtimeTransport {
      return this.delegate;
    }
  }

  it('keeps a healthy snapshot when using the in-memory adapter intentionally', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.realtime.adapter': 'in-memory',
        };

        return values[key];
      }),
    };

    const transport = new ConfigurableRealtimeTransport(
      configService as never,
      new InMemoryRealtimeTransport(),
    );

    expect(transport.snapshot()).toEqual({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      activeStreams: 0,
      publishedEvents: 0,
    });
  });

  it('reports a degraded snapshot when redis is configured but not yet wired', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.realtime.adapter': 'redis',
        };

        return values[key];
      }),
    };

    const transport = new ConfigurableRealtimeTransport(
      configService as never,
      new InMemoryRealtimeTransport(),
    );

    expect(transport.snapshot()).toEqual(
      expect.objectContaining({
        adapter: 'in-memory',
        sharedBackplane: false,
        degraded: true,
        activeStreams: 0,
        publishedEvents: 0,
      }),
    );
  });

  it('uses the postgres transport as a shared backplane when configured', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.realtime.adapter': 'postgres',
        };

        return values[key];
      }),
    };
    const postgresTransport = {
      publish: jest.fn(),
      stream: jest.fn(),
      snapshot: jest.fn(() => ({
        adapter: 'postgres',
        sharedBackplane: true,
        degraded: false,
        degradeReason: null,
        activeStreams: 2,
        publishedEvents: 8,
      })),
    };
    const transport = new ConfigurableRealtimeTransport(
      configService as never,
      new InMemoryRealtimeTransport(),
      postgresTransport as never,
    );

    expect(transport.snapshot()).toEqual({
      adapter: 'postgres',
      sharedBackplane: true,
      degraded: false,
      degradeReason: null,
      activeStreams: 2,
      publishedEvents: 8,
    });
  });

  it('normalizes configured adapter casing and whitespace before resolving postgres', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.realtime.adapter': ' PostgreSQL ',
        };

        return values[key];
      }),
    };
    const postgresTransport = {
      publish: jest.fn(),
      stream: jest.fn(),
      snapshot: jest.fn(() => ({
        adapter: 'postgres',
        sharedBackplane: true,
        degraded: false,
        degradeReason: null,
        activeStreams: 1,
        publishedEvents: 3,
      })),
    };
    const transport = new ConfigurableRealtimeTransport(
      configService as never,
      new InMemoryRealtimeTransport(),
      postgresTransport as never,
    );

    expect(transport.snapshot()).toEqual({
      adapter: 'postgres',
      sharedBackplane: true,
      degraded: false,
      degradeReason: null,
      activeStreams: 1,
      publishedEvents: 3,
    });
  });

  it('reports a degraded snapshot when an unsupported adapter is configured', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.realtime.adapter': 'nats',
        };

        return values[key];
      }),
    };
    const transport = new ConfigurableRealtimeTransport(
      configService as never,
      new InMemoryRealtimeTransport(),
    );

    expect(transport.snapshot()).toEqual(
      expect.objectContaining({
        adapter: 'in-memory',
        sharedBackplane: false,
        degraded: true,
        activeStreams: 0,
        publishedEvents: 0,
      }),
    );
    expect(transport.snapshot().degradeReason).toContain(
      'REALTIME_ADAPTER=nats n est pas supporte',
    );
  });

  it('delegates postgres publish and stream when configured', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.realtime.adapter': 'postgres',
        };

        return values[key];
      }),
    };
    const postgresTransport = new InMemoryRealtimeTransport();
    const transport = new ConfigurableRealtimeTransport(
      configService as never,
      new InMemoryRealtimeTransport(),
      postgresTransport as never,
    );

    transport.publish({
      id: 'admin:health.updated:health:2026-04-19T10:00:00.000Z:0',
      channel: 'admin',
      type: 'health.updated',
      entityId: 'health',
      createdAt: '2026-04-19T10:00:00.000Z',
    });

    expect(transport.snapshot()).toEqual(
      expect.objectContaining({
        adapter: 'in-memory',
        publishedEvents: 1,
      }),
    );
  });

  it('delegates publish and stream to the in-memory fallback transport', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.realtime.adapter': 'redis',
        };

        return values[key];
      }),
    };
    const inMemoryTransport = new InMemoryRealtimeTransport();
    const transport = new ConfigurableRealtimeTransport(
      configService as never,
      inMemoryTransport,
    );

    const eventPromise = firstValueFrom(
      transport
        .stream({
          role: 'RIDER',
          actorId: 'user-1',
          riderId: 'rider-1',
          driverId: null,
        })
        .pipe(take(1), timeout(100)),
    );

    transport.publish({
      id: 'trip:trip.updated:trip-1:2026-04-19T10:00:00.000Z:0',
      channel: 'trip',
      type: 'trip.updated',
      entityId: 'trip-1',
      riderId: 'rider-1',
      createdAt: '2026-04-19T10:00:00.000Z',
    });

    const result = await eventPromise;

    expect(result.type).toBe('trip.updated');
    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'trip:trip.updated:trip-1:2026-04-19T10:00:00.000Z:0',
        riderId: 'rider-1',
      }),
    );
  });

  it('falls back to in-memory when no adapter is configured', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const transport = new ConfigurableRealtimeTransport(
      configService as never,
      new InMemoryRealtimeTransport(),
    );

    expect(transport.snapshot()).toEqual({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      activeStreams: 0,
      publishedEvents: 0,
    });
  });

  it('falls back to the in-memory transport when the primary publish and stream fail', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.realtime.adapter': 'redis',
        };

        return values[key];
      }),
    };
    const inMemoryTransport = new InMemoryRealtimeTransport();
    const delegate = {
      publish: jest.fn(() => {
        throw new Error('redis publish unavailable');
      }),
      stream: jest.fn(() => {
        throw new Error('redis stream unavailable');
      }),
      snapshot: jest.fn(() => ({
        adapter: 'redis',
        sharedBackplane: true,
        degraded: false,
        degradeReason: null,
        activeStreams: 99,
        publishedEvents: 77,
      })),
    } satisfies RealtimeTransport;
    const transport = new TestableConfigurableRealtimeTransport(
      configService,
      inMemoryTransport,
      delegate,
    );

    const eventPromise = firstValueFrom(
      transport
        .stream({
          role: 'RIDER',
          actorId: 'user-1',
          riderId: 'rider-1',
          driverId: null,
        })
        .pipe(take(1), timeout(100)),
    );

    transport.publish({
      id: 'trip:trip.updated:trip-1:2026-04-19T10:10:00.000Z:0',
      channel: 'trip',
      type: 'trip.updated',
      entityId: 'trip-1',
      riderId: 'rider-1',
      createdAt: '2026-04-19T10:10:00.000Z',
    });

    const result = await eventPromise;

    expect(result.type).toBe('trip.updated');
    expect(delegate.stream).toHaveBeenCalledTimes(1);
    expect(delegate.publish).toHaveBeenCalledTimes(1);
    expect(transport.snapshot()).toEqual(
      expect.objectContaining({
        adapter: 'in-memory',
        degraded: true,
        activeStreams: 0,
        publishedEvents: 1,
      }),
    );
    expect(transport.snapshot().degradeReason).toContain(
      'Realtime transport stream failed: redis stream unavailable',
    );
    expect(transport.snapshot().degradeReason).toContain(
      'REALTIME_ADAPTER=redis est configure',
    );
  });

  it('returns a degraded fallback snapshot when the primary snapshot throws', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.realtime.adapter': 'in-memory',
        };

        return values[key];
      }),
    };
    const delegate = {
      publish: jest.fn(),
      stream: jest.fn(),
      snapshot: jest.fn(() => {
        throw new Error('snapshot probe failed');
      }),
    } satisfies RealtimeTransport;
    const transport = new TestableConfigurableRealtimeTransport(
      configService,
      new InMemoryRealtimeTransport(),
      delegate,
    );

    expect(transport.snapshot()).toEqual({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: true,
      degradeReason:
        'Realtime transport snapshot failed: snapshot probe failed',
      activeStreams: 0,
      publishedEvents: 0,
    });
  });
});
