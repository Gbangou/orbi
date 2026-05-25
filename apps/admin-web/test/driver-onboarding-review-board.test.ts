/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('driver onboarding review board', () => {
  it('guards driver and document actions against duplicate clicks', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/driver-onboarding-review-board.tsx'),
      'utf8',
    );

    expect(source).toContain('driverActionInFlightRef');
    expect(source).toContain('driverActionInFlightRef.current.has(driverId)');
    expect(source).toContain('driverActionInFlightRef.current.add(driverId)');
    expect(source).toContain('driverActionInFlightRef.current.delete(driverId)');
    expect(source).toContain('documentActionInFlightRef');
    expect(source).toContain(
      'documentActionInFlightRef.current.has(documentId)',
    );
    expect(source).toContain(
      'documentActionInFlightRef.current.add(documentId)',
    );
    expect(source).toContain(
      'documentActionInFlightRef.current.delete(documentId)',
    );
    expect(source).toContain('exportCsvInFlightRef');
    expect(source).toContain('exportCsvInFlightRef.current = true');
    expect(source).toContain('exportCsvInFlightRef.current = false');
  });
});
