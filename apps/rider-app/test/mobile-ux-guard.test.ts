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
    expect(source).toContain('label="Compte de démonstration"');
  });

  it('keeps booking bottom CTA compact', () => {
    const source = readAppFile('app/book.tsx');

    expect(source).toContain('labelStyle={styles.ctaBtnLabel}');
    expect(source).toContain('ctaBtnLabel');
    expect(source).toContain('ctaSignalTitle} numberOfLines={1}');
    expect(source).toContain('ctaSignalMeta} numberOfLines={1}');
  });

  it('keeps crash debug details gated to development builds', () => {
    const source = readWorkspaceFile('packages/ui/src/error-boundary.tsx');

    expect(source).toContain('function shouldShowDebugDetails');
    expect(source).toContain("typeof __DEV__ !== 'undefined' && __DEV__");
    expect(source).not.toContain('this.props.showDebugDetails && this.state.debugMessage');
  });
});
