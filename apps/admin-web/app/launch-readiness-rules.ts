import type { HealthCheckResponse } from '@orbi/api';

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
    return `${productionReadiness.failedChecks} check(s) runtime bloquant(s): ${summarizeReadinessChecks(
      productionReadiness,
      'fail',
    )}. Production pilot refuse.`;
  }

  if (productionReadiness.riskLevel === 'medium') {
    return `${productionReadiness.warningChecks} warning(s) runtime a traiter: ${summarizeReadinessChecks(
      productionReadiness,
      'warn',
    )}. Extension du pilote refusee.`;
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
      detail: `${productionReadiness.failedChecks} check(s) bloquant(s): ${summarizeReadinessChecks(
        productionReadiness,
        'fail',
      )}. Corriger avant d ouvrir un pilote production.`,
    };
  }

  if (productionReadiness.riskLevel === 'medium') {
    return {
      state: 'warn',
      label: 'pilot limite seulement',
      title: 'Pilote encadre possible, extension refusee',
      detail: `${productionReadiness.warningChecks} warning(s) runtime: ${summarizeReadinessChecks(
        productionReadiness,
        'warn',
      )}. A traiter avant une montee en charge.`,
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

function summarizeReadinessChecks(
  productionReadiness: NonNullable<
    HealthCheckResponse['operations']['productionReadiness']
  >,
  state: 'fail' | 'warn',
) {
  const labels = productionReadiness.checks
    .filter((check) => check.state === state)
    .slice(0, 3)
    .map((check) => check.label);

  if (labels.length === 0) {
    return 'aucun detail disponible';
  }

  const remainingCount =
    state === 'fail'
      ? productionReadiness.failedChecks - labels.length
      : productionReadiness.warningChecks - labels.length;
  const summary = labels.join(', ');

  return remainingCount > 0
    ? `${summary}, +${remainingCount} autre(s)`
    : summary;
}
