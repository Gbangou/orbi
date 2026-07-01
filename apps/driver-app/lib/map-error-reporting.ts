import type { OrbiClientErrorClassification } from '@orbi/api';

const mapErrorClassification: OrbiClientErrorClassification = {
  code: 'MOB-REALTIME-DEGRADED',
  surface: 'network',
  severity: 'medium',
  owner: 'engineering',
  retryPolicy: 'manual-refresh',
  userMessage: 'La carte ne s est pas chargee correctement.',
  shouldClearSessionToken: false,
  shouldNavigateToAuth: false,
  reportable: true,
};

export function enqueueDriverMapError(
  error: unknown,
  context: Record<string, unknown>,
) {
  void import('./mobile-error-reporting')
    .then(({ enqueueDriverMobileErrorReport }) =>
      enqueueDriverMobileErrorReport(error, {
        classification: mapErrorClassification,
        context,
      }),
    )
    .catch(() => undefined);
}
