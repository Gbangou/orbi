import {
  extractApiErrorMessage,
  isMobilisApiError,
} from '@mobilis/api';
import { router } from 'expo-router';
import { clearRiderPersistedSession } from './auth';

type RiderErrorCopy = {
  expiredSession: string;
  network: string;
  fallback: string;
};

const defaultRiderErrorCopy: RiderErrorCopy = {
  expiredSession:
    'Votre session passager a expire. Reconnectez-vous pour reprendre vos reservations.',
  network:
    'Connexion API indisponible pour le moment. La vue locale reste visible en attendant la reprise reseau.',
  fallback: 'Une erreur reseau ou serveur est survenue.',
};

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  return '';
}

function isRiderSessionError(error: unknown) {
  if (isMobilisApiError(error) && [401, 403].includes(error.status)) {
    return true;
  }

  const message = normalizeErrorMessage(error);

  return (
    message.includes('aucune session enregistree') ||
    message.includes('valid session token') ||
    message.includes('currently inactive')
  );
}

function isLikelyNetworkError(error: unknown) {
  if (error instanceof TypeError) {
    return true;
  }

  const message = normalizeErrorMessage(error);

  return (
    message.includes('network request failed') ||
    message.includes('fetch failed') ||
    message.includes('load failed') ||
    message.includes('networkerror')
  );
}

export async function resolveRiderAppError(
  error: unknown,
  copy?: Partial<RiderErrorCopy>,
) {
  const messages = {
    ...defaultRiderErrorCopy,
    ...copy,
  };

  if (isRiderSessionError(error)) {
    await clearRiderPersistedSession();
    router.replace('/auth');

    return {
      message: messages.expiredSession,
      shouldClearSessionToken: true,
    };
  }

  if (isLikelyNetworkError(error)) {
    return {
      message: messages.network,
      shouldClearSessionToken: false,
    };
  }

  return {
    message: extractApiErrorMessage(error, messages.fallback),
    shouldClearSessionToken: false,
  };
}
