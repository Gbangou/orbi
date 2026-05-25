/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('promo codes board', () => {
  it('guards promo creation and deactivation against duplicate submits', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/promo-codes-board.tsx'),
      'utf8',
    );

    expect(source).toContain('promoCreateInFlightRef');
    expect(source).toContain('promoCreateInFlightRef.current = true');
    expect(source).toContain('promoCreateInFlightRef.current = false');
    expect(source).toContain('promoDeactivateInFlightRef');
    expect(source).toContain('promoDeactivateInFlightRef.current.has(id)');
    expect(source).toContain('promoDeactivateInFlightRef.current.add(id)');
    expect(source).toContain('promoDeactivateInFlightRef.current.delete(id)');
  });
});
