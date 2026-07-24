import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(appRoot, '..', '..');

function readAppFile(relativePath: string) {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

function readWorkspaceFile(relativePath: string) {
  return readFileSync(resolve(workspaceRoot, relativePath), 'utf8');
}

describe('rider mobile UX guards', () => {
  it('keeps auth first-screen copy bounded on compact Android screens', () => {
    const source = readAppFile('app/auth.tsx');

    expect(source).toContain('styles.trustLine} numberOfLines={2}');
    expect(source).toContain('styles.legalFooter} numberOfLines={3}');
    expect(source).not.toContain('Compte de démonstration');
    expect(source).not.toContain('Accès démo');
    expect(source).not.toContain('orbiDemoAccessEnabled');
  });

  it('keeps booking bottom CTA compact', () => {
    const source = readAppFile('app/book.tsx');

    expect(source).toContain('labelStyle={styles.ctaBtnLabel}');
    expect(source).toContain('ctaBtnLabel');
    expect(source).toContain('ctaSignalTitle} numberOfLines={1}');
    expect(source).toContain('ctaSignalMeta} numberOfLines={1}');
  });

  it('keeps booking price confidence visible and rounded for the rider', () => {
    const source = readAppFile('app/book.tsx');

    expect(source).toContain('function PriceConfidenceCard');
    expect(source).toContain('Prix verrouille');
    expect(source).toContain('Arrondi CFA');
    expect(source).toContain('priceWindow.min');
  });

  it('keeps crash debug details gated to an explicit field debug flag', () => {
    const source = readWorkspaceFile('packages/ui/src/error-boundary.tsx');

    expect(source).toContain('function shouldShowDebugDetails');
    expect(source).toContain('return Boolean(enabled)');
    expect(source).not.toContain('this.props.showDebugDetails && this.state.debugMessage');
  });

  it('does not use native SVG gradients in shared mobile illustrations', () => {
    const source = readWorkspaceFile('packages/ui/src/vehicle-illustrations.tsx');

    expect(source).not.toContain("from 'react-native-svg'");
    expect(source).not.toContain('import Svg');
    expect(source).not.toContain('LinearGradient');
    expect(source).not.toContain('RadialGradient');
    expect(source).not.toContain('Stop');
    expect(source).not.toContain('Defs');
    expect(source).not.toContain('url(#');
    expect(source).not.toContain('import { Image');
    expect(source).not.toContain("require('../assets/vehicles/");
  });

  it('uses shared premium map vehicle markers for rider and driver maps', () => {
    const sharedSource = readWorkspaceFile('packages/ui/src/map-vehicle-icons.ts');
    const riderMapSource = readWorkspaceFile('apps/rider-app/lib/trip-map-view.tsx');
    const driverMapSource = readWorkspaceFile('apps/driver-app/lib/trip-map-view.tsx');

    expect(sharedSource).toContain('ORBI_MAP_VEHICLE_CSS');
    expect(sharedSource).toContain('ORBI_MAP_VEHICLE_SCRIPT');
    expect(sharedSource).toContain('car-standard');
    expect(sharedSource).toContain('moto-standard');
    expect(sharedSource).toContain('vehiclePulse');
    expect(riderMapSource).toContain('${ORBI_MAP_VEHICLE_SCRIPT}');
    expect(driverMapSource).toContain('${ORBI_MAP_VEHICLE_SCRIPT}');
    expect(riderMapSource).not.toContain("width=\"26\" height=\"58\"");
    expect(driverMapSource).not.toContain("width=\"26\" height=\"58\"");
  });

  it('keeps native SVG out of release APK dependencies', () => {
    const riderPackage = JSON.parse(readAppFile('package.json')) as {
      dependencies?: Record<string, string>;
    };
    const driverPackage = JSON.parse(readWorkspaceFile('apps/driver-app/package.json')) as {
      dependencies?: Record<string, string>;
    };
    const uiPackage = JSON.parse(readWorkspaceFile('packages/ui/package.json')) as {
      peerDependencies?: Record<string, string>;
    };

    expect(riderPackage.dependencies).not.toHaveProperty('react-native-svg');
    expect(driverPackage.dependencies).not.toHaveProperty('react-native-svg');
    expect(uiPackage.peerDependencies).not.toHaveProperty('react-native-svg');
  });

  it('keeps WebSocket realtime compatible with backend event envelopes', () => {
    const source = readWorkspaceFile('packages/ui/src/use-websocket-realtime-stream.ts');

    expect(source).toContain('const subscribeRole = subscribePayload.role.toUpperCase()');
    expect(source).toContain('role: subscribeRole');
    expect(source).toContain("if (data.type === 'event')");
    expect(source).toContain('const directEventType = String(data.type ??');
    expect(source).toContain('eventTypesRef.current.includes(directEventType)');
  });
});
