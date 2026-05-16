import { ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom, take, timeout, toArray } from 'rxjs';
import { InMemoryRealtimeTransport } from './in-memory-realtime.transport';
import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  it('filters rider events to the matching rider identity', async () => {
    const service = new RealtimeService(new InMemoryRealtimeTransport(), {
      isEnabled: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('on'),
    } as never);
    const eventPromise = firstValueFrom(
      service
        .stream({
          role: 'RIDER',
          actorId: 'user-1',
          riderId: 'rider-1',
          driverId: null,
        })
        .pipe(take(1), timeout(100)),
    );

    service.publish({
      channel: 'trip',
      type: 'trip.updated',
      entityId: 'trip-1',
      riderId: 'rider-1',
    });

    const result = await eventPromise;

    expect(result.type).toBe('trip.updated');
  });

  it('keeps admin and unrelated rider events off rider streams', () => {
    const service = new RealtimeService(new InMemoryRealtimeTransport(), {
      isEnabled: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('on'),
    } as never);
    const receivedEvents: string[] = [];
    const subscription = service
      .stream({
        role: 'RIDER',
        actorId: 'user-1',
        riderId: 'rider-1',
        driverId: null,
      })
      .subscribe((event) => {
        receivedEvents.push(event.type ?? 'message');
      });

    service.publish({
      channel: 'admin',
      type: 'system.health-alert',
      entityId: 'health-1',
    });
    service.publish({
      channel: 'ride-request',
      type: 'ride-request.created',
      entityId: 'request-1',
      riderId: 'rider-2',
    });

    expect(receivedEvents).toEqual([]);

    subscription.unsubscribe();
  });

  it('broadcasts market ride-request events to drivers but scopes addressed driver events', () => {
    const service = new RealtimeService(new InMemoryRealtimeTransport(), {
      isEnabled: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('on'),
    } as never);
    const receivedEvents: string[] = [];
    const subscription = service
      .stream({
        role: 'DRIVER',
        actorId: 'user-1',
        riderId: null,
        driverId: 'driver-1',
      })
      .subscribe((event) => {
        receivedEvents.push(event.type ?? 'message');
      });

    service.publish({
      channel: 'admin',
      type: 'system.health-alert',
      entityId: 'health-1',
    });
    service.publish({
      channel: 'ride-request',
      type: 'ride-request.created',
      entityId: 'request-1',
      riderId: 'rider-1',
    });
    service.publish({
      channel: 'ride-request',
      type: 'ride-request.reservation-assigned',
      entityId: 'request-2',
      riderId: 'rider-2',
      driverId: 'driver-2',
    });
    service.publish({
      channel: 'ride-request',
      type: 'ride-request.reservation-assigned',
      entityId: 'request-3',
      riderId: 'rider-3',
      driverId: 'driver-1',
    });

    expect(receivedEvents).toEqual([
      'ride-request.created',
      'ride-request.reservation-assigned',
    ]);

    subscription.unsubscribe();
  });

  it('tracks published events in the realtime snapshot', () => {
    const service = new RealtimeService(new InMemoryRealtimeTransport(), {
      isEnabled: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('on'),
    } as never);

    service.publish({
      channel: 'trip',
      type: 'trip.updated',
      entityId: 'trip-1',
    });

    expect(service.snapshot()).toEqual({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      activeStreams: 0,
      publishedEvents: 1,
      featureFlagMode: 'on',
      featureFlagEnabled: true,
    });
  });

  it('creates unique realtime ids even for repeated publications of the same event', async () => {
    const service = new RealtimeService(new InMemoryRealtimeTransport(), {
      isEnabled: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('on'),
    } as never);

    const eventPromise = firstValueFrom(
      service
        .stream({
          role: 'ADMIN',
          actorId: 'admin-1',
          riderId: null,
          driverId: null,
        })
        .pipe(take(2), toArray(), timeout(100)),
    );

    service.publish({
      channel: 'trip',
      type: 'trip.updated',
      entityId: 'trip-1',
      createdAt: '2026-04-18T22:00:00.000Z',
    });
    service.publish({
      channel: 'trip',
      type: 'trip.updated',
      entityId: 'trip-1',
      createdAt: '2026-04-18T22:00:00.000Z',
    });

    const events = await eventPromise;

    expect(events[0]?.data.id).not.toBe(events[1]?.data.id);
  });

  it('rejects streaming when realtime is disabled for the actor', () => {
    const service = new RealtimeService(new InMemoryRealtimeTransport(), {
      isEnabled: jest.fn().mockReturnValue(false),
      getMode: jest.fn().mockReturnValue('off'),
    } as never);

    expect(() =>
      service.stream({
        role: 'RIDER',
        actorId: 'user-1',
        riderId: 'rider-1',
        driverId: null,
      }),
    ).toThrow(ServiceUnavailableException);
  });

  it('completes streams when the authenticated session expires', async () => {
    const service = new RealtimeService(new InMemoryRealtimeTransport(), {
      isEnabled: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('on'),
    } as never);

    const events = await firstValueFrom(
      service
        .stream({
          role: 'ADMIN',
          actorId: 'admin-1',
          riderId: null,
          driverId: null,
          sessionExpiresAt: new Date(Date.now() + 10),
        })
        .pipe(toArray(), timeout(100)),
    );

    expect(events).toEqual([]);
    expect(service.snapshot().activeStreams).toBe(0);
  });

  it('includes the feature flag mode and evaluated enablement in the snapshot', () => {
    const featureFlagsService = {
      isEnabled: jest
        .fn()
        .mockImplementation(
          (flag: string, context?: { actorId?: string | null }) => {
            if (context && 'actorId' in context) {
              return false;
            }

            return false;
          },
        ),
      getMode: jest.fn().mockReturnValue('canary:25'),
    };
    const service = new RealtimeService(
      new InMemoryRealtimeTransport(),
      featureFlagsService as never,
    );

    expect(service.snapshot()).toEqual({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      activeStreams: 0,
      publishedEvents: 0,
      featureFlagMode: 'canary:25',
      featureFlagEnabled: false,
    });
    expect(featureFlagsService.isEnabled).toHaveBeenCalledWith('realtime');
    expect(featureFlagsService.getMode).toHaveBeenCalledWith('realtime');
  });

  it('tracks active streams while a subscriber is connected', async () => {
    const service = new RealtimeService(new InMemoryRealtimeTransport(), {
      isEnabled: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('on'),
    } as never);

    const subscription = service
      .stream({
        role: 'ADMIN',
        actorId: 'admin-1',
        riderId: null,
        driverId: null,
      })
      .subscribe();

    expect(service.snapshot()).toEqual({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      activeStreams: 1,
      publishedEvents: 0,
      featureFlagMode: 'on',
      featureFlagEnabled: true,
    });

    subscription.unsubscribe();

    expect(service.snapshot()).toEqual({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      activeStreams: 0,
      publishedEvents: 0,
      featureFlagMode: 'on',
      featureFlagEnabled: true,
    });
  });

  it('does not count inactive stream observables as connected clients', () => {
    const service = new RealtimeService(new InMemoryRealtimeTransport(), {
      isEnabled: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('on'),
    } as never);

    service.stream({
      role: 'ADMIN',
      actorId: 'admin-1',
      riderId: null,
      driverId: null,
    });

    expect(service.snapshot()).toEqual({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      activeStreams: 0,
      publishedEvents: 0,
      featureFlagMode: 'on',
      featureFlagEnabled: true,
    });
  });
});
