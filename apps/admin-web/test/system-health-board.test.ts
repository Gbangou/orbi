/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('system health board', () => {
  it('guards incident and job actions against duplicate clicks', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/system-health-board.tsx'),
      'utf8',
    );

    expect(source).toContain('incidentActionInFlightRef');
    expect(source).toContain(
      'incidentActionInFlightRef.current.has(incidentId)',
    );
    expect(source).toContain(
      'incidentActionInFlightRef.current.add(incidentId)',
    );
    expect(source).toContain(
      'incidentActionInFlightRef.current.delete(incidentId)',
    );
    expect(source).toContain('jobActionInFlightRef');
    expect(source).toContain('jobActionInFlightRef.current.has(job.id)');
    expect(source).toContain('jobActionInFlightRef.current.add(job.id)');
    expect(source).toContain('jobActionInFlightRef.current.delete(job.id)');
  });
});
