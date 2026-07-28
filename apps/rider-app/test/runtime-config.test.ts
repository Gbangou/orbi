import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveOrbiApiBaseUrlForRuntime } from '@orbi/config';

describe('Orbi runtime config', () => {
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
      resolveOrbiApiBaseUrlForRuntime('http://192.168.2.250:3000'),
    ).toBe('http://localhost:3000');
  });

  it('keeps LAN API URLs when the app is not running on local web', () => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { hostname: '192.168.2.250' },
    });

    expect(
      resolveOrbiApiBaseUrlForRuntime('http://192.168.2.250:3000'),
    ).toBe('http://192.168.2.250:3000');
  });

  it('falls back to the public field API when a native build has a loopback URL', () => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: undefined,
    });

    expect(resolveOrbiApiBaseUrlForRuntime('http://localhost:3000/')).toBe(
      'https://orbi-field-api.onrender.com',
    );
    expect(resolveOrbiApiBaseUrlForRuntime('http://127.0.0.1:3000')).toBe(
      'https://orbi-field-api.onrender.com',
    );
  });

  it('leaves explicit production API URLs untouched', () => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { hostname: 'localhost' },
    });

    expect(
      resolveOrbiApiBaseUrlForRuntime('https://api.orbi.app'),
    ).toBe('https://api.orbi.app');
  });

  it('does not expose demo account runtime helpers in shared config', () => {
    const source = readFileSync(
      join(process.cwd(), '../../packages/config/src/index.ts'),
      'utf8',
    );

    expect(source).not.toContain('orbiDemoAccounts');
    expect(source).not.toContain('resolveOrbiDemoAccessEnabled');
    expect(source).not.toContain('EXPO_PUBLIC_ORBI_DEMO');
    expect(source).not.toContain('NEXT_PUBLIC_ORBI_DEMO');
  });

  it('keeps public EAS build profiles free of embedded demo credentials', () => {
    const riderEas = readFileSync(join(process.cwd(), 'eas.json'), 'utf8');
    const driverEas = readFileSync(
      join(process.cwd(), '../driver-app/eas.json'),
      'utf8',
    );

    for (const source of [riderEas, driverEas]) {
      expect(source).not.toContain('EXPO_PUBLIC_ENABLE_DEMO_ACCOUNTS');
      expect(source).not.toContain('EXPO_PUBLIC_ORBI_DEMO');
      expect(source).not.toContain('TestOrbi2026!');
    }
  });

  it('pins all releasable EAS profiles to a public API URL', () => {
    const easFiles = [
      readFileSync(join(process.cwd(), 'eas.json'), 'utf8'),
      readFileSync(join(process.cwd(), '../driver-app/eas.json'), 'utf8'),
    ];

    for (const source of easFiles) {
      const config = JSON.parse(source) as {
        build: Record<string, { env?: Record<string, string> }>;
      };

      for (const profile of ['preview', 'mvp', 'field-test', 'production']) {
        const apiUrl = config.build[profile]?.env?.EXPO_PUBLIC_API_BASE_URL;

        expect(apiUrl).toBe('https://orbi-field-api.onrender.com');
        expect(apiUrl).not.toMatch(/localhost|127\.0\.0\.1|0\.0\.0\.0/);
      }
    }
  });

  it('keeps checked-in field env files free of visible demo credentials', () => {
    const envFiles = [
      join(process.cwd(), '.env'),
      join(process.cwd(), '../driver-app/.env'),
    ];

    for (const envFile of envFiles) {
      if (!existsSync(envFile)) {
        continue;
      }

      const source = readFileSync(envFile, 'utf8');
      if (!source.includes('https://orbi-field-api.onrender.com')) {
        continue;
      }

      expect(source).not.toContain('EXPO_PUBLIC_ENABLE_DEMO_ACCOUNTS=true');
      expect(source).not.toContain('EXPO_PUBLIC_ORBI_DEMO');
      expect(source).not.toContain('testpassager@orbi.test');
      expect(source).not.toContain('testchauffeur@orbi.test');
      expect(source).not.toContain('TestOrbi2026!');
    }
  });

  it('keeps mobile API clients and realtime streams on the runtime-resolved base URL', () => {
    const directRuntimeFiles = [
      'app/(tabs)/activity.tsx',
      'lib/auth.ts',
      'lib/use-rider-realtime-stream.ts',
      '../driver-app/lib/auth.ts',
      '../driver-app/lib/use-driver-realtime-stream.ts',
    ];

    for (const file of directRuntimeFiles) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');

      expect(source).toContain('resolveOrbiApiBaseUrlForRuntime');
      expect(source).not.toContain('orbiRuntimeConfig.apiBaseUrl');
    }

    for (const file of ['app/(tabs)/home.tsx', 'app/book.tsx']) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');

      expect(source).toContain('createRiderPublicClient');
      expect(source).not.toContain('orbiRuntimeConfig.apiBaseUrl');
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
