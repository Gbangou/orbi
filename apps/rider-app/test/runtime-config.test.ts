import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resolveMobilisApiBaseUrlForRuntime,
  resolveMobilisDemoAccessEnabled,
} from '@mobilis/config';

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

  it('disables demo account affordances by default in production runtime config', () => {
    expect(resolveMobilisDemoAccessEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(
      resolveMobilisDemoAccessEnabled({
        NODE_ENV: 'production',
        EXPO_PUBLIC_ENABLE_DEMO_ACCOUNTS: 'true',
      }),
    ).toBe(true);
  });

  it('keeps mobile API clients and realtime streams on the runtime-resolved base URL', () => {
    const files = [
      'app/home.tsx',
      'app/book.tsx',
      'app/voice.tsx',
      'app/activity.tsx',
      'lib/auth.ts',
      'lib/use-rider-realtime-stream.ts',
      '../driver-app/lib/auth.ts',
      '../driver-app/lib/use-driver-realtime-stream.ts',
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');

      expect(source).toContain('resolveMobilisApiBaseUrlForRuntime');
      expect(source).not.toContain('mobilisRuntimeConfig.apiBaseUrl');
    }
  });

  it('keeps realtime EventSource stable across render-only callback changes', () => {
    const source = readFileSync(
      join(process.cwd(), '../../packages/ui/src/use-realtime-event-stream.ts'),
      'utf8',
    );

    expect(source).toContain('buildStreamUrlRef');
    expect(source).toContain('eventTypesRef');
    expect(source).not.toContain('options.buildStreamUrl(sessionToken)');
    expect(source).not.toContain('options.eventTypes) {');
  });
});
