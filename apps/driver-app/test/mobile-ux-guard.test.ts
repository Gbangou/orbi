import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(__dirname, '..');

function readAppFile(relativePath: string) {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

describe('driver mobile UX guards', () => {
  it('keeps onboarding copy bounded on compact Android screens', () => {
    const source = readAppFile('app/onboarding.tsx');

    expect(source).toContain('benefitTitle} numberOfLines={1}');
    expect(source).toContain('benefitDesc} numberOfLines={2}');
    expect(source).toContain('docDesc} numberOfLines={1}');
    expect(source).toContain('label="Soumettre le dossier"');
  });

  it('keeps auth first-screen copy bounded', () => {
    const source = readAppFile('app/auth.tsx');

    expect(source).toContain('styles.trustLine} numberOfLines={2}');
    expect(source).toContain('styles.legalFooter} numberOfLines={3}');
    expect(source).toContain('styles.passwordHint} numberOfLines={2}');
  });
});
