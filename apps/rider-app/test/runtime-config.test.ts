import { resolveMobilisApiBaseUrlForRuntime } from '@mobilis/config';

describe('Mobilis runtime config', () => {
  const originalLocation = globalThis.location;

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('uses localhost for local Expo web when the mobile API URL points to a LAN host', () => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { hostname: 'localhost' },
    });

    expect(
      resolveMobilisApiBaseUrlForRuntime('http://192.168.2.250:3000'),
    ).toBe('http://localhost:3000');
  });

  it('keeps LAN API URLs when the app is not running on local web', () => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { hostname: '192.168.2.250' },
    });

    expect(
      resolveMobilisApiBaseUrlForRuntime('http://192.168.2.250:3000'),
    ).toBe('http://192.168.2.250:3000');
  });

  it('leaves explicit production API URLs untouched', () => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { hostname: 'localhost' },
    });

    expect(
      resolveMobilisApiBaseUrlForRuntime('https://api.mobilis.app'),
    ).toBe('https://api.mobilis.app');
  });
});
