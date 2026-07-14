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

    expect(source).toContain("ErrorBoundary, useOrbiTheme } from '@orbi/ui/native'");
    expect(source).toContain('<ErrorBoundary');
    expect(source).toContain('fallback={renderDegradedPanel()}');
    expect(source).toContain('renderDegradedPanel()');
  });
});
