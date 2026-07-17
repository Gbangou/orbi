/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('driver auth feedback source', () => {
  it('uses the shared mobile auth feedback helper', () => {
    const source = readFileSync(join(process.cwd(), 'app/auth.tsx'), 'utf8');

    expect(source).toContain('resolveMobileAuthErrorMessage');
    expect(source).toContain("appRoleLabel: 'chauffeur'");
    expect(source).not.toContain('extractApiErrorMessage');
  });
});
