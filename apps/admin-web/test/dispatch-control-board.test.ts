/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDispatchSettingsFormPayload } from '../app/dispatch-control-safety';

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

  it('builds dispatch settings payloads from strict bounded integers', () => {
    expect(
      resolveDispatchSettingsFormPayload({
        lookbackHours: ' 24 ',
        halfLifeHours: '12',
        declineCooldownMinutes: '8',
        historyLimit: '50',
      }),
    ).toEqual({
      payload: {
        lookbackHours: 24,
        halfLifeHours: 12,
        declineCooldownMinutes: 8,
        historyLimit: 50,
      },
      error: null,
    });
  });

  it('rejects dirty or out-of-range dispatch settings before network calls', () => {
    expect(
      resolveDispatchSettingsFormPayload({
        lookbackHours: '24h',
        halfLifeHours: '12',
        declineCooldownMinutes: '8',
        historyLimit: '50',
      }).payload,
    ).toBeNull();

    expect(
      resolveDispatchSettingsFormPayload({
        lookbackHours: '24',
        halfLifeHours: '1e2',
        declineCooldownMinutes: '8',
        historyLimit: '50',
      }).payload,
    ).toBeNull();

    expect(
      resolveDispatchSettingsFormPayload({
        lookbackHours: '24',
        halfLifeHours: '12',
        declineCooldownMinutes: '8',
        historyLimit: '500',
      }).payload,
    ).toBeNull();
  });
});
