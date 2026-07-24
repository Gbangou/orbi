import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(__dirname, '..');

function readAppFile(relativePath: string) {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

// Chaque carte native est un WebView (react-native-webview): un crash de rendu
// a cet endroit prenait autrefois tout l'ecran (ErrorBoundary global), au lieu
// de degrader localement vers le panneau deja concu pour Platform.OS==='web'.
// Verifie que chaque carte enveloppe desormais son WebView natif dans
// ErrorBoundary avec ce meme panneau en fallback.
describe('rider map view resilience', () => {
  it.each([
    'lib/home-map-view.tsx',
    'lib/trip-map-view.tsx',
    'lib/saved-places-map.tsx',
  ])('wraps the native WebView in %s with a local ErrorBoundary', (relativePath) => {
    const source = readAppFile(relativePath);
    const nativeUiImportLine = source
      .split('\n')
      .find((line) => line.includes("from '@orbi/ui/native'"));

    expect(nativeUiImportLine).toContain('ErrorBoundary');
    expect(nativeUiImportLine).toContain('useOrbiTheme');
    expect(source).toContain('<ErrorBoundary');
    expect(source).toContain('fallback={renderDegradedPanel()}');
    expect(source).toContain('renderDegradedPanel()');
  });

  it.each([
    'lib/home-map-view.tsx',
    'lib/trip-map-view.tsx',
    'lib/saved-places-map.tsx',
  ])('uses the shared restricted map origin whitelist in %s', (relativePath) => {
    const source = readAppFile(relativePath);

    expect(source).toContain('localMapWebViewOriginWhitelist');
    expect(source).toContain('originWhitelist={localMapWebViewOriginWhitelist}');
    expect(source).not.toContain("originWhitelist={['about:blank', 'https://*']}");
  });

  it('renders nearby and active drivers as vehicle markers instead of plain dots', () => {
    const homeMap = readAppFile('lib/home-map-view.tsx');
    const tripMap = readAppFile('lib/trip-map-view.tsx');

    expect(homeMap).toContain('MOTO_SVG');
    expect(homeMap).toContain('CAR_SVG');
    expect(homeMap).toContain('FallbackMiniVehicleGlyph');
    expect(homeMap).toContain('driverBearing');

    expect(tripMap).toContain('VEHICLE_ICONS');
    expect(tripMap).toContain('FallbackVehicleGlyph');
    expect(tripMap).toContain('driverBearing');
    expect(tripMap).not.toContain('driverMarkerText');
  });
});
