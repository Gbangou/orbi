import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(__dirname, '..');

function readAppFile(relativePath: string) {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

describe('rider screenshot policy', () => {
  const formerlySensitiveScreens = [
    'app/auth.tsx',
    'app/receipt.tsx',
    'app/(tabs)/account.tsx',
  ];

  it('keeps the shared privacy hook screenshot-friendly for field support', () => {
    const source = readAppFile('lib/privacy/screen-capture.ts');

    expect(source).toContain('Screenshots are allowed by default');
    expect(source).not.toContain('preventScreenCaptureAsync');
    expect(source).not.toContain('allowScreenCaptureAsync');
  });

  it.each(formerlySensitiveScreens)('%s uses the central screenshot policy', (relativePath) => {
    const source = readAppFile(relativePath);

    expect(source).toContain('preventSensitiveScreenCapture');
    expect(source).toContain('restoreSensitiveScreenCapture');
  });

  it.each(['app/book.tsx', 'app/(tabs)/activity.tsx'])(
    '%s keeps booking and trip screenshots available for support',
    (relativePath) => {
      const source = readAppFile(relativePath);

      expect(source).not.toContain('preventSensitiveScreenCapture');
    },
  );
});
