import type { HealthCheckResponse } from '@mobilis/api';

export type ReadinessState = 'good' | 'warn' | 'bad';

export type PilotDecision = {
  state: ReadinessState;
  label: string;
  title: string;
  detail: string;
};

export type ReadinessSignal = {
  state: ReadinessState;
};

export function resolveReadinessGroupState(
  checks: ReadinessSignal[],
): ReadinessState {
  if (checks.some((check) => check.state === 'bad')) {
    return 'bad';
  }

  if (checks.some((check) => check.state === 'warn')) {
    return 'warn';
  }

  return 'good';
}

export function describeReadinessState(state: ReadinessState) {
  if (state === 'good') {
    return 'pret';
  }

  if (state === 'warn') {
    return 'a stabiliser';
  }

  return 'bloque';
}

export function resolveProductionReadinessState(
  productionReadiness: HealthCheckResponse['operations']['productionReadiness'],
): ReadinessState {
  if (!productionReadiness) {
    return 'warn';
  }

  if (productionReadiness.riskLevel === 'high') {
    return 'bad';
  }

  if (productionReadiness.riskLevel === 'medium') {
    return 'warn';
  }

  return 'good';
}

export function describeProductionReadiness(
  productionReadiness: HealthCheckResponse['operations']['productionReadiness'],
) {
  if (!productionReadiness) {
    return 'Signal runtime absent: backend ancien ou fallback admin.';
  }

  if (productionReadiness.riskLevel === 'high') {
    return `${productionReadiness.failedChecks} check(s) runtime bloquant(s): production pilot refuse.`;
  }

  if (productionReadiness.riskLevel === 'medium') {
    return `${productionReadiness.warningChecks} warning(s) runtime a traiter avant extension du pilote.`;
  }

  return 'Aucun blocage runtime detecte pour un pilote production encadre.';
}

export function resolveProductionPilotDecision(
  productionReadiness: HealthCheckResponse['operations']['productionReadiness'],
  productionState: ReadinessState = resolveProductionReadinessState(
    productionReadiness,
  ),
): PilotDecision {
  if (!productionReadiness) {
    return {
      state: 'warn',
      label: 'decision incomplete',
      title: 'Pilotage production en attente du signal runtime',
      detail:
        'Le backend courant ne fournit pas encore productionReadiness. Garder le pilote en mode beta ops jusqu a resynchronisation du backend.',
    };
  }

  if (
    productionState === 'bad' &&
    productionReadiness.riskLevel !== 'high'
  ) {
    return {
      state: 'bad',
      label: 'production pilot bloque',
      title: 'Production pilot bloque par les signaux ops',
      detail:
        'Un signal operationnel critique doit etre corrige avant d ouvrir un pilote production.',
    };
  }

  if (productionReadiness.riskLevel === 'high') {
    return {
      state: 'bad',
      label: 'production pilot bloque',
      title: 'Production pilot refuse',
      detail: `${productionReadiness.failedChecks} check(s) bloquant(s) doivent etre corriges avant d ouvrir un pilote production.`,
    };
  }

  if (productionReadiness.riskLevel === 'medium') {
    return {
      state: 'warn',
      label: 'pilot limite seulement',
      title: 'Pilote encadre possible, extension refusee',
      detail: `${productionReadiness.warningChecks} warning(s) runtime restent a traiter avant une montee en charge.`,
    };
  }

  if (productionState === 'warn') {
    return {
      state: 'warn',
      label: 'pilot limite seulement',
      title: 'Pilote encadre possible, extension refusee',
      detail:
        'Les checks runtime sont bas, mais des signaux ops restent a stabiliser avant une montee en charge.',
    };
  }

  return {
    state: 'good',
    label: 'pilot autorise',
    title: 'Production pilot autorise',
    detail:
      'Les checks runtime essentiels sont au vert pour un pilote production limite avec supervision ops.',
  };
}
