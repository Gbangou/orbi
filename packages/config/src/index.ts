const runtimeEnvironment = globalThis as typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

export const workspaceApps = ['backend', 'rider-app', 'driver-app', 'admin-web'] as const;

export const brandTokens = {
  primary: '#0f766e',
  secondary: '#f59e0b',
  accent: '#38bdf8',
  ink: '#07111d',
  surface: '#f8fafc',
} as const;

export const mobilisRuntimeConfig = {
  apiBaseUrl:
    runtimeEnvironment.process?.env?.EXPO_PUBLIC_API_BASE_URL ??
    runtimeEnvironment.process?.env?.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:3000',
  apiVersion:
    runtimeEnvironment.process?.env?.EXPO_PUBLIC_API_VERSION ??
    runtimeEnvironment.process?.env?.NEXT_PUBLIC_API_VERSION ??
    'v1',
  paymentRedirectUrl:
    runtimeEnvironment.process?.env?.EXPO_PUBLIC_PAYMENT_REDIRECT_URL ??
    runtimeEnvironment.process?.env?.NEXT_PUBLIC_PAYMENT_REDIRECT_URL ??
    'http://localhost:8081/book',
  launchLocale: 'fr-BF',
  launchMarket: 'Burkina Faso',
} as const;

export const mobilisDemoAccounts = {
  rider: {
    email:
      runtimeEnvironment.process?.env?.EXPO_PUBLIC_MOBILIS_DEMO_RIDER_EMAIL ??
      runtimeEnvironment.process?.env?.NEXT_PUBLIC_MOBILIS_DEMO_RIDER_EMAIL ??
      'rider@mobilis.app',
    password:
      runtimeEnvironment.process?.env?.EXPO_PUBLIC_MOBILIS_DEMO_RIDER_PASSWORD ??
      runtimeEnvironment.process?.env?.NEXT_PUBLIC_MOBILIS_DEMO_RIDER_PASSWORD ??
      'Mobilis123!',
  },
  driver: {
    email:
      runtimeEnvironment.process?.env?.EXPO_PUBLIC_MOBILIS_DEMO_DRIVER_EMAIL ??
      runtimeEnvironment.process?.env?.NEXT_PUBLIC_MOBILIS_DEMO_DRIVER_EMAIL ??
      'driver@mobilis.app',
    password:
      runtimeEnvironment.process?.env?.EXPO_PUBLIC_MOBILIS_DEMO_DRIVER_PASSWORD ??
      runtimeEnvironment.process?.env?.NEXT_PUBLIC_MOBILIS_DEMO_DRIVER_PASSWORD ??
      'Mobilis123!',
  },
  admin: {
    email:
      runtimeEnvironment.process?.env?.EXPO_PUBLIC_MOBILIS_DEMO_ADMIN_EMAIL ??
      runtimeEnvironment.process?.env?.NEXT_PUBLIC_MOBILIS_DEMO_ADMIN_EMAIL ??
      'admin@mobilis.app',
    password:
      runtimeEnvironment.process?.env?.EXPO_PUBLIC_MOBILIS_DEMO_ADMIN_PASSWORD ??
      runtimeEnvironment.process?.env?.NEXT_PUBLIC_MOBILIS_DEMO_ADMIN_PASSWORD ??
      'Mobilis123!',
  },
} as const;

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
