/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('rider auth feedback source', () => {
  it('uses the shared mobile auth feedback helper', () => {
    const source = readFileSync(join(process.cwd(), 'app/auth.tsx'), 'utf8');

    expect(source).toContain('resolveMobileAuthErrorMessage');
    expect(source).toContain("appRoleLabel: 'passager'");
    expect(source).not.toContain('extractApiErrorMessage');
  });

  it('keeps sign-in and sign-up on the fast auth path', () => {
    const source = readFileSync(join(process.cwd(), 'lib/auth.ts'), 'utf8');

    expect(source).toContain('const riderAuthRequestTimeoutMs = 40_000');
    expect(source).toContain('buildFastRiderAuthContext(client, session)');
    expect(source).not.toContain('const riderFieldRequestTimeoutMs = 90_000');
  });
});
