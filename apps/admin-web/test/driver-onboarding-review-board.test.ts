/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeDriverDocumentExpiryDate } from '../app/api/admin/driver-onboarding/[driverId]/review/review-normalizers';

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

  it('validates driver document expiry dates as strict real UTC instants in the review normalizer', () => {
    const normalizerSource = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/driver-onboarding/[driverId]/review/review-normalizers.ts',
      ),
      'utf8',
    );

    expect(normalizerSource).toContain('normalizeDriverDocumentExpiryDate');
    expect(normalizerSource).toContain('isoUtcDateTimePattern');
    expect(normalizerSource).not.toContain(
      'Date.parse(documentDecision.expiresAt)',
    );

    expect(
      normalizeDriverDocumentExpiryDate('2027-04-18T00:00:00.000Z'),
    ).toBe('2027-04-18T00:00:00.000Z');
    expect(normalizeDriverDocumentExpiryDate('2027-04-18T06:30:00Z')).toBe(
      '2027-04-18T06:30:00.000Z',
    );
    expect(
      normalizeDriverDocumentExpiryDate('2027-02-31T00:00:00.000Z'),
    ).toBeNull();
    expect(normalizeDriverDocumentExpiryDate('2027-04-18')).toBeNull();
    expect(normalizeDriverDocumentExpiryDate('not-a-date')).toBeNull();
  });

  it('opens signed driver documents without giving the new tab opener access', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/driver-onboarding-review-board.tsx'),
      'utf8',
    );

    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
  });
});
