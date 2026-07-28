const runtimeEnvironment = globalThis as typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
  location?: {
    hostname: string;
  };
};

export const workspaceApps = ['backend', 'rider-app', 'driver-app', 'admin-web'] as const;

export const brandTokens = {
  primary: '#00B894',
  secondary: '#F2A900',
  accent: '#246BFE',
  ink: '#071311',
  surface: '#F6F8F7',
} as const;

export const orbiRuntimeConfig = {
  apiBaseUrl:
    runtimeEnvironment.process?.env?.EXPO_PUBLIC_API_BASE_URL ??
    runtimeEnvironment.process?.env?.NEXT_PUBLIC_API_BASE_URL ??
    'https://orbi-field-api.onrender.com',
  apiVersion:
    runtimeEnvironment.process?.env?.EXPO_PUBLIC_API_VERSION ??
    runtimeEnvironment.process?.env?.NEXT_PUBLIC_API_VERSION ??
    'v1',
  paymentRedirectUrl:
    runtimeEnvironment.process?.env?.EXPO_PUBLIC_PAYMENT_REDIRECT_URL ??
    runtimeEnvironment.process?.env?.NEXT_PUBLIC_PAYMENT_REDIRECT_URL ??
    'orbi-passager://payment-return',
  launchLocale: 'fr-BF',
  launchMarket: 'Burkina Faso',
} as const;

const defaultFieldApiBaseUrl = 'https://orbi-field-api.onrender.com';

export function resolveOrbiApiBaseUrlForRuntime(
  configuredBaseUrl = orbiRuntimeConfig.apiBaseUrl,
) {
  const normalizedBaseUrl = normalizeApiBaseUrl(configuredBaseUrl);
  const location = runtimeEnvironment.location;

  if (!location) {
    return isLoopbackApiBaseUrl(normalizedBaseUrl)
      ? defaultFieldApiBaseUrl
      : normalizedBaseUrl;
  }

  if (!isLocalWebHost(location.hostname)) {
    return isLoopbackApiBaseUrl(normalizedBaseUrl)
      ? defaultFieldApiBaseUrl
      : normalizedBaseUrl;
  }

  try {
    const apiUrl = new URL(normalizedBaseUrl);

    if (isPrivateLanHost(apiUrl.hostname)) {
      apiUrl.hostname = 'localhost';
      return apiUrl.toString().replace(/\/$/, '');
    }
  } catch {
    return normalizedBaseUrl;
  }

  return normalizedBaseUrl;
}

export const executionPhases = [
  {
    id: 'phase-1',
    title: 'Foundations product-grade',
    status: 'completed',
    detail: 'Packages partages, plan d execution, configuration backend et socle de donnees stabilises.',
  },
  {
    id: 'phase-2',
    title: 'Auth and identities',
    status: 'completed',
    detail: 'Compte, connexion, sessions, roles et profils rider/driver/admin poses pour les flux proteges.',
  },
  {
    id: 'phase-3',
    title: 'Real app integration',
    status: 'next',
    detail: 'Brancher rider, driver et admin a l API reelle avec pricing credibles, loading, error et empty states.',
  },
  {
    id: 'phase-4',
    title: 'Trip lifecycle and dispatch',
    status: 'planned',
    detail: 'Reservation, matching, progression chauffeur, course en direct et fin de trajet.',
  },
  {
    id: 'phase-5',
    title: 'Voice intelligence',
    status: 'planned',
    detail: 'Comprendre des lieux, guider la reservation et accelerer l usage en francais local.',
  },
] as const;

export function parseAllowedOrigins(value: string | undefined) {
  if (!value) {
    return ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8081'];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLocalWebHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function normalizeApiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function isLoopbackApiBaseUrl(value: string) {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isPrivateLanHost(hostname: string) {
  return (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}
