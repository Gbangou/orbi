import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(__dirname, '..');

function readAppFile(relativePath: string) {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

describe('rider sensitive screen capture protection', () => {
  const protectedScreens = [
    'app/auth.tsx',
    'app/book.tsx',
    'app/voice.tsx',
    'app/receipt.tsx',
    'app/(tabs)/activity.tsx',
    'app/(tabs)/account.tsx',
  ];

  it.each(protectedScreens)('%s prevents and restores screen capture', (relativePath) => {
    const source = readAppFile(relativePath);

    expect(source).toContain('preventSensitiveScreenCapture');
    expect(source).toContain('restoreSensitiveScreenCapture');
  });
});
