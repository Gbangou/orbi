import {
  classifyOrbiClientError,
  isOrbiApiError,
  type OrbiClientErrorSurface,
} from '@orbi/api';
import {
  translateOrbiVisibleError,
  type OrbiVisibleErrorAction,
} from '@orbi/i18n';
import { orbiCopy } from '@orbi/ui';
import { router } from 'expo-router';
import { clearRiderPersistedSession } from './auth';
import { enqueueRiderMobileErrorReport } from './mobile-error-reporting';

type RiderErrorCopy = {
  expiredSession: string;
  network: string;
  fallback: string;
};

export type RiderAppErrorFeedback = {
  message: string;
  code?: string;
  surface?: OrbiClientErrorSurface;
  severity?: string;
  owner?: string;
  retryPolicy?: string;
  action?: OrbiVisibleErrorAction;
  actionLabel?: string;
  logCode?: string;
  shouldClearSessionToken: boolean;
  reportable?: boolean;
};

const defaultRiderErrorCopy: RiderErrorCopy = {
  expiredSession:
    'Votre session passager a expire. Reconnectez-vous pour reprendre vos reservations.',
  network: orbiCopy.riderNetworkUnavailable,
  fallback: orbiCopy.serviceUnavailable,
};

export async function resolveRiderAppError(
  error: unknown,
  copy?: Partial<RiderErrorCopy> & { surface?: OrbiClientErrorSurface },
): Promise<RiderAppErrorFeedback> {
  const messages = {
    ...defaultRiderErrorCopy,
    ...copy,
  };
  const classification = classifyOrbiClientError(error, {
    surface: copy?.surface,
    fallbackMessage: messages.fallback,
  });
  const fallbackMessage =
    classification.shouldClearSessionToken
      ? messages.expiredSession
      : classification.code === 'MOB-NETWORK-OFFLINE'
        ? messages.network
        : copy?.fallback;
  const visibleError = translateOrbiVisibleError({
    code: classification.code,
    message: error instanceof Error ? error.message : classification.userMessage,
    status: isOrbiApiError(error) ? error.status : undefined,
    surface: classification.surface,
    retryPolicy: classification.retryPolicy,
    fallbackMessage,
  });
  await safelyQueueRiderErrorReport(error, classification);

  if (classification.shouldClearSessionToken) {
    await clearRiderPersistedSession();
    router.replace('/auth');

    return {
      message: visibleError.message,
      code: classification.code,
      surface: classification.surface,
      severity: classification.severity,
      owner: classification.owner,
      retryPolicy: classification.retryPolicy,
      action: visibleError.action,
      actionLabel: visibleError.actionLabel,
      logCode: visibleError.logCode,
      shouldClearSessionToken: true,
      reportable: classification.reportable,
    };
  }

  if (classification.code === 'MOB-NETWORK-OFFLINE') {
    return {
      message: visibleError.message,
      code: classification.code,
      surface: classification.surface,
      severity: classification.severity,
      owner: classification.owner,
      retryPolicy: classification.retryPolicy,
      action: visibleError.action,
      actionLabel: visibleError.actionLabel,
      logCode: visibleError.logCode,
      shouldClearSessionToken: false,
      reportable: classification.reportable,
    };
  }

  return {
    message: visibleError.message,
    code: classification.code,
    surface: classification.surface,
    severity: classification.severity,
    owner: classification.owner,
    retryPolicy: classification.retryPolicy,
    action: visibleError.action,
    actionLabel: visibleError.actionLabel,
    logCode: visibleError.logCode,
    shouldClearSessionToken: false,
    reportable: classification.reportable,
  };
}

async function safelyQueueRiderErrorReport(
  error: unknown,
  classification: ReturnType<typeof classifyOrbiClientError>,
) {
  if (!classification.reportable) {
    return;
  }

  try {
    await enqueueRiderMobileErrorReport(error, { classification });
  } catch {
    // Le signalement d'erreur ne doit jamais bloquer la récupération utilisateur ou le nettoyage auth.
  }
}
