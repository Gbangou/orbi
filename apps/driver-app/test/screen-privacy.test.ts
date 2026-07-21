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
    'app/(tabs)/profil.tsx',
    'app/(tabs)/revenus.tsx',
  ];

  it.each(protectedScreens)('%s prevents and restores screen capture', (relativePath) => {
    const source = readAppFile(relativePath);

    expect(source).toContain('preventSensitiveScreenCapture');
    expect(source).toContain('restoreSensitiveScreenCapture');
  });

  it.each(['app/(tabs)/accueil.tsx', 'app/(tabs)/offres.tsx'])(
    '%s keeps live mission screenshots available for support',
    (relativePath) => {
      const source = readAppFile(relativePath);

      expect(source).not.toContain('preventSensitiveScreenCapture');
    },
  );
});
