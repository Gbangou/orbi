import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(__dirname, '..');

function readAppFile(relativePath: string) {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

// Meme garde que cote rider: un crash de rendu dans une carte WebView native
// prenait autrefois tout l'ecran chauffeur au lieu de degrader localement.
// Verifie que chaque carte enveloppe desormais son WebView natif dans
// ErrorBoundary avec le panneau degrade deja concu pour Platform.OS==='web'.
describe('driver map view resilience', () => {
  it.each([
    'lib/driver-home-map-view.tsx',
    'lib/trip-map-view.tsx',
    'lib/approach-map-view.tsx',
  ])('wraps the native WebView in %s with a local ErrorBoundary', (relativePath) => {
    const source = readAppFile(relativePath);

    expect(source).toContain("ErrorBoundary, useOrbiTheme } from '@orbi/ui/native'");
    expect(source).toContain('<ErrorBoundary');
    expect(source).toContain('fallback={renderDegradedPanel()}');
    expect(source).toContain('renderDegradedPanel()');
  });
});
