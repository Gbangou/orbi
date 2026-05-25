/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import type { HealthCheckResponse } from '@orbi/api';
import {
  resolveCombinedProductionState,
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
    checks:
      riskLevel === 'high'
        ? [
            {
              id: 'payment-provider-evidence',
              label: 'Preuves provider paiement',
              state: 'fail',
              detail: 'Aucune capture sandbox.',
            },
            {
              id: 'mobile-error-collector',
              label: 'Collector erreurs mobiles',
              state: 'fail',
              detail: 'Collector absent.',
            },
          ]
        : riskLevel === 'medium'
          ? [
              {
                id: 'provider-refunds',
                label: 'Refunds provider',
                state: 'warn',
                detail: 'Mode manual.',
              },
              {
                id: 'payment-provider-evidence',
                label: 'Preuves provider paiement',
                state: 'warn',
                detail: 'Capture sandbox absente.',
              },
              {
                id: 'mobile-error-collector',
                label: 'Collector erreurs mobiles',
                state: 'warn',
                detail: 'Collector local.',
              },
            ]
          : [],
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
      detail: expect.stringContaining('Preuves provider paiement'),
    });
  });

  it('keeps production pilot limited when runtime risk is medium', () => {
    const readiness = buildProductionReadiness('medium');

    expect(resolveProductionReadinessState(readiness)).toBe('warn');
    expect(resolveProductionPilotDecision(readiness)).toMatchObject({
      state: 'warn',
      label: 'pilot limite seulement',
      detail: expect.stringContaining('Refunds provider'),
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

  it('keeps the stricter state when backend and local ops signals disagree', () => {
    expect(resolveCombinedProductionState('warn', 'good')).toBe('warn');
    expect(resolveCombinedProductionState('good', 'bad')).toBe('bad');
    expect(resolveCombinedProductionState('good', undefined)).toBe('good');
  });

  it('does not approve production pilot when backend is approved but local ops signals warn', () => {
    const readiness = buildProductionReadiness('low');
    const combinedState = resolveCombinedProductionState('warn', 'good');

    expect(resolveProductionPilotDecision(readiness, combinedState)).toMatchObject({
      state: 'warn',
      label: 'pilot limite seulement',
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
