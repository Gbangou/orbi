/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import type { HealthCheckResponse } from '@orbi/api';
import {
  resolveProductionPilotDecision,
  resolveProductionReadinessState,
  resolveReadinessGroupState,
} from '../app/launch-readiness-rules';

type ProductionReadiness =
  HealthCheckResponse['operations']['productionReadiness'];

function buildProductionReadiness(
  riskLevel: 'low' | 'medium' | 'high',
): ProductionReadiness {
  return {
    environment: 'production',
    riskLevel,
    failedChecks: riskLevel === 'high' ? 2 : 0,
    warningChecks: riskLevel === 'medium' ? 3 : 0,
    checks: [],
  };
}

describe('launch readiness production decision', () => {
  it('summarizes readiness groups by worst signal first', () => {
    expect(
      resolveReadinessGroupState([{ state: 'good' }, { state: 'warn' }]),
    ).toBe('warn');
    expect(
      resolveReadinessGroupState([{ state: 'good' }, { state: 'bad' }]),
    ).toBe('bad');
    expect(resolveReadinessGroupState([{ state: 'good' }])).toBe('good');
  });

  it('blocks production pilot when runtime risk is high', () => {
    const readiness = buildProductionReadiness('high');

    expect(resolveProductionReadinessState(readiness)).toBe('bad');
    expect(resolveProductionPilotDecision(readiness)).toMatchObject({
      state: 'bad',
      label: 'production pilot bloque',
      title: 'Production pilot refuse',
    });
  });

  it('keeps production pilot limited when runtime risk is medium', () => {
    const readiness = buildProductionReadiness('medium');

    expect(resolveProductionReadinessState(readiness)).toBe('warn');
    expect(resolveProductionPilotDecision(readiness)).toMatchObject({
      state: 'warn',
      label: 'pilot limite seulement',
    });
  });

  it('allows a supervised production pilot when runtime risk is low', () => {
    const readiness = buildProductionReadiness('low');

    expect(resolveProductionReadinessState(readiness)).toBe('good');
    expect(resolveProductionPilotDecision(readiness)).toMatchObject({
      state: 'good',
      label: 'pilot autorise',
    });
  });

  it('keeps production pilot limited when ops signals are still warning', () => {
    const readiness = buildProductionReadiness('low');

    expect(resolveProductionPilotDecision(readiness, 'warn')).toMatchObject({
      state: 'warn',
      label: 'pilot limite seulement',
    });
  });

  it('blocks production pilot when an ops signal is critical', () => {
    const readiness = buildProductionReadiness('low');

    expect(resolveProductionPilotDecision(readiness, 'bad')).toMatchObject({
      state: 'bad',
      title: 'Production pilot bloque par les signaux ops',
    });
  });

  it('does not approve production pilot when backend signal is missing', () => {
    expect(resolveProductionReadinessState(undefined)).toBe('warn');
    expect(resolveProductionPilotDecision(undefined)).toMatchObject({
      state: 'warn',
      label: 'decision incomplete',
    });
  });
});
