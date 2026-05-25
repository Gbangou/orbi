/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('payment webhook journal board', () => {
  it('guards event money actions against duplicate clicks', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/payment-webhook-journal-board.tsx'),
      'utf8',
    );

    expect(source).toContain('eventActionInFlightRef');
    expect(source).toContain('eventActionInFlightRef.current.has(eventId)');
    expect(source).toContain('eventActionInFlightRef.current.add(eventId)');
    expect(source).toContain('eventActionInFlightRef.current.delete(eventId)');
    expect(source).toContain('if (!beginEventAction(eventId))');
  });
});
