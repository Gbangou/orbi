import {
  classifyOrbiClientError,
  type OrbiClientErrorSurface,
} from '@orbi/api';
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
  shouldClearSessionToken: boolean;
  reportable?: boolean;
};

const defaultRiderErrorCopy: RiderErrorCopy = {
  expiredSession:
    'Votre session passager a expire. Reconnectez-vous pour reprendre vos reservations.',
  network: orbiCopy.riderNetworkUnavailable,
  fallback: orbiCopy.serviceUnavailable,
};

function toPremiumRiderMessage(message: string, fallback: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return fallback;
  }

  if (/\b(api|backend|server|serveur|stack|exception|token|json|sql|prisma|debug|trace)\b/i.test(trimmed)) {
    return fallback;
  }

  return trimmed
    .replace(/\bconnexion live\b/gi, 'connexion')
    .replace(/\ben direct\b/gi, 'a jour')
    .slice(0, 180);
}

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
    message: toPremiumRiderMessage(classification.userMessage, messages.fallback),
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
