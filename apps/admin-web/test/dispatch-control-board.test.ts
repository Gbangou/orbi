/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('dispatch control board', () => {
  it('guards dispatch setting mutations against duplicate submits', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/dispatch-control-board.tsx'),
      'utf8',
    );

    expect(source).toContain('dispatchMutationInFlightRef');
    expect(source).toContain('dispatchMutationInFlightRef.current = true');
    expect(source).toContain('dispatchMutationInFlightRef.current = false');
  });
});
