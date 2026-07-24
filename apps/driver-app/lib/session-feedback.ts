import {
  classifyOrbiClientError,
  type OrbiClientErrorSurface,
} from '@orbi/api';
import { orbiCopy } from '@orbi/ui';
import { router } from 'expo-router';
import { clearDriverPersistedSession } from './auth';
import { enqueueDriverMobileErrorReport } from './mobile-error-reporting';

type DriverErrorCopy = {
  expiredSession: string;
  network: string;
  fallback: string;
};

export type DriverAppErrorFeedback = {
  message: string;
  code?: string;
  surface?: OrbiClientErrorSurface;
  severity?: string;
  owner?: string;
  retryPolicy?: string;
  shouldClearSessionToken: boolean;
  reportable?: boolean;
};

const defaultDriverErrorCopy: DriverErrorCopy = {
  expiredSession:
    'Votre session chauffeur a expire. Reconnectez-vous pour reprendre le direct.',
  network: orbiCopy.driverNetworkUnavailable,
  fallback: orbiCopy.serviceUnavailable,
};

export async function resolveDriverAppError(
  error: unknown,
  copy?: Partial<DriverErrorCopy> & { surface?: OrbiClientErrorSurface },
): Promise<DriverAppErrorFeedback> {
  const messages = {
    ...defaultDriverErrorCopy,
    ...copy,
  };
  const classification = classifyOrbiClientError(error, {
    surface: copy?.surface,
    fallbackMessage: messages.fallback,
  });
  await safelyQueueDriverErrorReport(error, classification);

  if (classification.shouldClearSessionToken) {
    await clearDriverPersistedSession();
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
    message: classification.userMessage,
    code: classification.code,
    surface: classification.surface,
    severity: classification.severity,
    owner: classification.owner,
    retryPolicy: classification.retryPolicy,
    shouldClearSessionToken: false,
    reportable: classification.reportable,
  };
}

async function safelyQueueDriverErrorReport(
  error: unknown,
  classification: ReturnType<typeof classifyOrbiClientError>,
) {
  if (!classification.reportable) {
    return;
  }

  try {
    await enqueueDriverMobileErrorReport(error, { classification });
  } catch {
    // Le signalement d'erreur ne doit jamais bloquer la récupération utilisateur ou le nettoyage auth.
  }
}
