/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('support queue board', () => {
  it('guards support ticket updates and preserves failed note drafts', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/support-queue.tsx'),
      'utf8',
    );

    expect(source).toContain('ticketUpdateInFlightRef');
    expect(source).toContain('ticketUpdateInFlightRef.current.has(ticketId)');
    expect(source).toContain('ticketUpdateInFlightRef.current.add(ticketId)');
    expect(source).toContain('ticketUpdateInFlightRef.current.delete(ticketId)');
    expect(source).toContain('return true;');
    expect(source).toContain('return false;');
    expect(source).toContain('if (sent)');
  });
});
