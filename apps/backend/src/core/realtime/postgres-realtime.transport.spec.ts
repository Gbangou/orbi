import { firstValueFrom, take, timeout } from 'rxjs';
import { PostgresRealtimeTransport } from './postgres-realtime.transport';

const mockPoolQuery = jest.fn();
const mockPoolEnd = jest.fn();
const mockClientOn = jest.fn();
const mockClientConnect = jest.fn();
const mockClientQuery = jest.fn();
const mockClientEnd = jest.fn();
const mockClientConfigs: unknown[] = [];

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockPoolQuery,
    end: mockPoolEnd,
  })),
  Client: jest.fn().mockImplementation((config: unknown) => {
    mockClientConfigs.push(config);

    return {
      on: mockClientOn,
      connect: mockClientConnect,
      query: mockClientQuery,
      end: mockClientEnd,
    };
  }),
}));

describe('PostgresRealtimeTransport', () => {
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'database.url': 'postgresql://mobilis:secret@db.internal:5432/mobilis',
      };

      return values[key];
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientConfigs.length = 0;
    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockPoolEnd.mockResolvedValue(undefined);
    mockClientConnect.mockResolvedValue(undefined);
    mockClientQuery.mockResolvedValue({ rows: [] });
    mockClientEnd.mockResolvedValue(undefined);
  });

  it('publishes bounded events through PostgreSQL notify', () => {
    const transport = new PostgresRealtimeTransport(configService as never);

    transport.publish({
      id: 'admin:health.updated:health:2026-05-15T10:00:00.000Z:0',
      channel: 'admin',
      type: 'health.updated',
      entityId: 'health',
      createdAt: '2026-05-15T10:00:00.000Z',
      payload: { status: 'up' },
    });

    expect(mockPoolQuery).toHaveBeenCalledWith('SELECT pg_notify($1, $2)', [
      'mobilis_realtime_events',
      expect.stringContaining('"type":"health.updated"'),
    ]);
    expect(transport.snapshot()).toEqual(
      expect.objectContaining({
        adapter: 'postgres',
        sharedBackplane: true,
        degraded: false,
        publishedEvents: 1,
      }),
    );
  });

  it('rejects oversized notify payloads before they reach PostgreSQL', () => {
    const transport = new PostgresRealtimeTransport(configService as never);

    transport.publish({
      id: 'admin:health.updated:health:2026-05-15T10:00:00.000Z:0',
      channel: 'admin',
      type: 'health.updated',
      entityId: 'health',
      createdAt: '2026-05-15T10:00:00.000Z',
      payload: { details: 'x'.repeat(8_000) },
    });

    expect(mockPoolQuery).not.toHaveBeenCalledWith(
      'SELECT pg_notify($1, $2)',
      expect.anything(),
    );
    expect(transport.snapshot()).toEqual(
      expect.objectContaining({
        adapter: 'postgres',
        sharedBackplane: true,
        degraded: true,
        publishedEvents: 0,
      }),
    );
    expect(transport.snapshot().degradeReason).toContain(
      'payload exceeds 7500 bytes',
    );
  });

  it('streams PostgreSQL notifications through role-aware filters', async () => {
    const notificationHandlers: Array<
      (message: { channel: string; payload?: string }) => void
    > = [];
    mockClientOn.mockImplementation(
      (
        event: string,
        handler: (message: { channel: string; payload?: string }) => void,
      ) => {
        if (event === 'notification') {
          notificationHandlers.push(handler);
        }
      },
    );
    const transport = new PostgresRealtimeTransport(configService as never);
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

    await Promise.resolve();
    notificationHandlers[0]?.({
      channel: 'mobilis_realtime_events',
      payload: JSON.stringify({
        id: 'trip:trip.updated:trip-1:2026-05-15T10:00:00.000Z:0',
        channel: 'trip',
        type: 'trip.updated',
        entityId: 'trip-1',
        riderId: 'rider-2',
        createdAt: '2026-05-15T10:00:00.000Z',
      }),
    });
    notificationHandlers[0]?.({
      channel: 'mobilis_realtime_events',
      payload: JSON.stringify({
        id: 'trip:trip.updated:trip-2:2026-05-15T10:00:01.000Z:1',
        channel: 'trip',
        type: 'trip.updated',
        entityId: 'trip-2',
        riderId: 'rider-1',
        createdAt: '2026-05-15T10:00:01.000Z',
      }),
    });

    await expect(eventPromise).resolves.toEqual({
      type: 'trip.updated',
      data: expect.objectContaining({
        entityId: 'trip-2',
        riderId: 'rider-1',
      }),
    });
    expect(mockClientQuery).toHaveBeenCalledWith(
      'LISTEN mobilis_realtime_events',
    );
    expect(transport.snapshot()).toEqual(
      expect.objectContaining({
        activeStreams: 0,
      }),
    );
  });

  it('marks the transport degraded when a notification cannot be parsed', async () => {
    const notificationHandlers: Array<
      (message: { channel: string; payload?: string }) => void
    > = [];
    mockClientOn.mockImplementation(
      (
        event: string,
        handler: (message: { channel: string; payload?: string }) => void,
      ) => {
        if (event === 'notification') {
          notificationHandlers.push(handler);
        }
      },
    );
    const transport = new PostgresRealtimeTransport(configService as never);

    transport.stream({
      role: 'ADMIN',
      actorId: 'admin-1',
      riderId: null,
      driverId: null,
    });
    await Promise.resolve();
    notificationHandlers[0]?.({
      channel: 'mobilis_realtime_events',
      payload: '{bad-json',
    });

    expect(transport.snapshot()).toEqual(
      expect.objectContaining({
        degraded: true,
      }),
    );
    expect(transport.snapshot().degradeReason).toContain(
      'Postgres realtime parse failed',
    );
  });

  it('uses the local default database URL for the listener when config is absent', async () => {
    const transport = new PostgresRealtimeTransport({
      get: jest.fn().mockReturnValue(undefined),
    } as never);

    transport.snapshot();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockClientConfigs).toContainEqual({
      connectionString:
        'postgresql://postgres:postgres@localhost:5433/mobilis?schema=public',
    });
  });

  it('rejects structurally invalid notification events before streaming them', async () => {
    const notificationHandlers: Array<
      (message: { channel: string; payload?: string }) => void
    > = [];
    mockClientOn.mockImplementation(
      (
        event: string,
        handler: (message: { channel: string; payload?: string }) => void,
      ) => {
        if (event === 'notification') {
          notificationHandlers.push(handler);
        }
      },
    );
    const transport = new PostgresRealtimeTransport(configService as never);
    const receivedEvents: string[] = [];
    const subscription = transport
      .stream({
        role: 'ADMIN',
        actorId: 'admin-1',
        riderId: null,
        driverId: null,
      })
      .subscribe((event) => {
        receivedEvents.push(event.type ?? 'message');
      });

    await Promise.resolve();
    notificationHandlers[0]?.({
      channel: 'mobilis_realtime_events',
      payload: JSON.stringify({
        id: 'trip:trip.updated:trip-1:2026-05-15T10:00:00.000Z:0',
        channel: 'trip',
        type: 'trip.updated',
        createdAt: '2026-05-15T10:00:00.000Z',
        payload: [],
      }),
    });

    expect(receivedEvents).toEqual([]);
    expect(transport.snapshot()).toEqual(
      expect.objectContaining({
        degraded: true,
      }),
    );
    expect(transport.snapshot().degradeReason).toContain(
      'invalid realtime event payload',
    );

    subscription.unsubscribe();
  });

  it('closes listener and pool resources on module destroy', async () => {
    const transport = new PostgresRealtimeTransport(configService as never);

    transport.snapshot();
    await new Promise((resolve) => setImmediate(resolve));
    await transport.onModuleDestroy();

    expect(mockClientEnd).toHaveBeenCalledTimes(1);
    expect(mockPoolEnd).toHaveBeenCalledTimes(1);
  });
});
