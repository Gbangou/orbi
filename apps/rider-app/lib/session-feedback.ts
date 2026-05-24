import {
  classifyOrbiClientError,
  extractApiErrorMessage,
  type OrbiClientErrorSurface,
} from '@orbi/api';
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
  shouldClearSessionToken: boolean;
  reportable?: boolean;
};

const defaultRiderErrorCopy: RiderErrorCopy = {
  expiredSession:
    'Votre session passager a expire. Reconnectez-vous pour reprendre vos reservations.',
  network:
    'Connexion API indisponible pour le moment. La vue locale reste visible en attendant la reprise reseau.',
  fallback: 'Une erreur reseau ou serveur est survenue.',
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
  await safelyQueueRiderErrorReport(error, classification);

  if (classification.shouldClearSessionToken) {
    await clearRiderPersistedSession();
    router.replace('/auth');

    return {
      message: messages.expiredSession,
      code: classification.code,
      surface: classification.surface,
      severity: classification.severity,
      owner: classification.owner,
      retryPolicy: classification.retryPolicy,
      shouldClearSessionToken: true,
      reportable: classification.reportable,
    };
  }

  if (classification.code === 'MOB-NETWORK-OFFLINE') {
    return {
      message: messages.network,
      code: classification.code,
      surface: classification.surface,
      severity: classification.severity,
      owner: classification.owner,
      retryPolicy: classification.retryPolicy,
      shouldClearSessionToken: false,
      reportable: classification.reportable,
    };
  }

  return {
    message:
      classification.code === 'MOB-GENERIC-API'
        ? extractApiErrorMessage(error, messages.fallback)
        : classification.userMessage,
    code: classification.code,
    surface: classification.surface,
    severity: classification.severity,
    owner: classification.owner,
    retryPolicy: classification.retryPolicy,
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
