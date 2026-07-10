import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(__dirname, '..');

function readAppFile(relativePath: string) {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

describe('driver sensitive screen capture protection', () => {
  const protectedScreens = [
    'app/auth.tsx',
    'app/onboarding.tsx',
    'app/(tabs)/accueil.tsx',
    'app/(tabs)/offres.tsx',
    'app/(tabs)/profil.tsx',
    'app/(tabs)/revenus.tsx',
  ];

  it.each(protectedScreens)('%s prevents and restores screen capture', (relativePath) => {
    const source = readAppFile(relativePath);

    expect(source).toContain('preventSensitiveScreenCapture');
    expect(source).toContain('restoreSensitiveScreenCapture');
  });
});
