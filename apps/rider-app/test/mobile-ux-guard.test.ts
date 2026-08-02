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
    const vehicleSource = readAppFile('lib/booking/vehicle-selector.tsx');
    const paymentSource = readAppFile('lib/booking/payment-methods-manager.tsx');
    const scheduleSource = readAppFile('lib/booking/scheduled-ride-picker.tsx');

    expect(source).toContain('labelStyle={styles.ctaBtnLabel}');
    expect(source).toContain('ctaBtnLabel');
    expect(source).toContain('ctaSignalTitle} numberOfLines={1}');
    expect(source).toContain('ctaSignalMeta} numberOfLines={1}');
    expect(source).toContain('buildBookingSummaryLabel');
    expect(source).toContain('Ajoutez votre destination');
    expect(source).toContain('const hasDestination = Boolean(destinationPlace.coordinates)');
    expect(source).toContain('!hasOpenFlow &&\n    hasDestination &&\n    scheduleMode');
    expect(source).toContain("'Destination requise'");
    expect(source).toContain("'Indiquez où vous allez'");
    expect(source).toContain("label: 'Où allez-vous ?'");
    expect(source).not.toContain('Destination a renseigner');
    expect(source).toContain('formatRiderPaymentMethodLabel(selectedPaymentMethod)');
    expect(source).toContain('height: 210');
    expect(source).toContain('minHeight: 48');
    expect(source).not.toContain("selectedOption ? formatRiderMoneyAmount(selectedOption.fare) : '--'");
    expect(vehicleSource).toContain('VehicleIllustration tier={tier} width={48} height={34}');
    expect(vehicleSource).toContain('minHeight: 60');
    expect(paymentSource).toContain('width: 34');
    expect(scheduleSource).toContain('toggleBtn: { flex: 1, paddingVertical: 7');
  });

  it('keeps active rider trip actions compact and driver identity bounded', () => {
    const source = readAppFile('app/(tabs)/activity.tsx');

    expect(source).toContain('styles.driverName} numberOfLines={1}');
    expect(source).toContain('styles.driverMeta} numberOfLines={1}');
    expect(source).toContain('styles.driverPlate} numberOfLines={1}');
    expect(source).toContain("maxHeight: '64%'");
    expect(source).toContain("minHeight: 44");
    expect(source).toContain('primaryActionsRow:');
    expect(source).toContain('secondaryActionsRow:');
    expect(source).toContain('label="Partager le trajet"');
    expect(source).toContain('label="Aide"');
    expect(source).not.toContain('label="Signal"');
    expect(source).toContain('label="Annuler"');
    expect(source).toContain('label="Terminer ici"');
    expect(source).not.toContain('ETA banner');
  });

  it('keeps rider activity overview dense on compact Android screens', () => {
    const source = readAppFile('app/(tabs)/activity.tsx');

    expect(source).toContain('label="Actualiser"');
    expect(source).not.toContain('label="Actualiser le suivi"');
    expect(source).not.toContain('OrbiMetricTile');
    expect(source).toContain('styles.statValue} numberOfLines={1} adjustsFontSizeToFit');
    expect(source).toContain('supportActionButton:');
    expect(source).toContain('minHeight: 38');
    expect(source).toContain('width: 46');
  });

  it('formats rider receipt and payment labels before display', () => {
    const receiptSource = readAppFile('app/receipt.tsx');
    const activitySource = readAppFile('app/(tabs)/activity.tsx');

    expect(receiptSource).toContain('heroFare:');
    expect(receiptSource).toContain('fontSize: 34');
    expect(receiptSource).toContain('width: 44');
    expect(receiptSource).toContain('formatRiderReceiptStatus(receiptStatus)');
    expect(receiptSource).toContain('formatRiderPaymentMethodLabel(trip.paymentMethod)');
    expect(receiptSource).toContain('formatRiderReceiptProvider(paymentIntent.provider)');
    expect(receiptSource).toContain('formatRiderReceiptReference(paymentIntent.transactionRef)');
    expect(activitySource).toContain('formatRiderReceiptStatus(trip.receipt.status)');
    expect(activitySource).toContain('formatRiderReceiptReference(trip.receipt.transactionRef)');
    expect(receiptSource).not.toContain('paymentIntent.transactionRef.slice(0, 12)');
    expect(activitySource).not.toContain('formatOperationalStatus(trip.receipt.status)');
  });

  it('keeps wallet top-up failures behind mobile-safe feedback', () => {
    const source = readAppFile('app/(tabs)/account.tsx');

    expect(source).toContain("surface: 'payments'");
    expect(source).toContain('setTopUpError(feedback.message)');
    expect(source).not.toContain("error instanceof Error ? error.message : 'Rechargement échoué'");
  });

  it('keeps booking price confidence compact for the rider', () => {
    const source = readAppFile('app/book.tsx');

    expect(source).toContain('function PriceConfidenceCard');
    expect(source).toContain('Prix estime');
    expect(source).toContain('durationMinutes');
    expect(source).not.toContain('Equilibre course');
    expect(source).not.toContain('Prix transparent');
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
    expect(riderMapSource).toContain('Trajet prêt');
    expect(riderMapSource).not.toContain('Trajet pret');
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

  it('keeps Metro from scanning volatile local QA/build artifacts', () => {
    const riderMetro = readWorkspaceFile('apps/rider-app/metro.config.js');
    const driverMetro = readWorkspaceFile('apps/driver-app/metro.config.js');

    for (const source of [riderMetro, driverMetro]) {
      expect(source).toContain('[\\\\/]artifacts');
      expect(source).toContain('[\\\\/]tmp');
      expect(source).toContain('[\\\\/]\\.chrome-(cdp|headless)');
    }
  });

  it('keeps the visual QA matrix strict across compact and tall Android screens', () => {
    const source = readWorkspaceFile('scripts/testing/mobile-visual-capture.ps1');

    expect(source).toContain("slug = 'compact-android'; width = 320; height = 680");
    expect(source).toContain("slug = 'small-android'; width = 360; height = 740");
    expect(source).toContain("slug = 'standard-android'; width = 390; height = 844");
    expect(source).toContain("slug = 'tall-android'; width = 412; height = 915");
    expect(source).toContain("slug = 'mobile-web'; width = 430; height = 932");
  });
});
