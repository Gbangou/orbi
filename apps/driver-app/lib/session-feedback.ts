import {
  extractApiErrorMessage,
  isMobilisApiError,
} from '@mobilis/api';
import { router } from 'expo-router';
import { clearDriverPersistedSession } from './auth';

type DriverErrorCopy = {
  expiredSession: string;
  network: string;
  fallback: string;
};

const defaultDriverErrorCopy: DriverErrorCopy = {
  expiredSession:
    'Votre session chauffeur a expire. Reconnectez-vous pour reprendre le direct.',
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

function isDriverSessionError(error: unknown) {
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

export async function resolveDriverAppError(
  error: unknown,
  copy?: Partial<DriverErrorCopy>,
) {
  const messages = {
    ...defaultDriverErrorCopy,
    ...copy,
  };

  if (isDriverSessionError(error)) {
    await clearDriverPersistedSession();
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
