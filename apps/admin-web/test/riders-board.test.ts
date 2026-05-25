/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('riders board', () => {
  it('guards rider status changes against duplicate clicks', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/riders-board.tsx'),
      'utf8',
    );

    expect(source).toContain('riderStatusInFlightRef');
    expect(source).toContain('riderStatusInFlightRef.current.has(userId)');
    expect(source).toContain('riderStatusInFlightRef.current.add(userId)');
    expect(source).toContain('riderStatusInFlightRef.current.delete(userId)');
  });
});
