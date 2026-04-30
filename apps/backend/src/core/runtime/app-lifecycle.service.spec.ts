import { AppLifecycleService } from './app-lifecycle.service';

describe('AppLifecycleService', () => {
  it('tracks readiness and draining transitions', () => {
    const service = new AppLifecycleService();

    expect(service.isReady()).toBe(false);
    expect(service.snapshot().state).toBe('starting');

    service.markReady();
    expect(service.isReady()).toBe(true);
    expect(service.snapshot().state).toBe('ready');

    service.startDraining('deploy');
    expect(service.isReady()).toBe(false);
    expect(service.snapshot()).toEqual(
      expect.objectContaining({
        state: 'draining',
        drainReason: 'deploy',
      }),
    );
  });
});
