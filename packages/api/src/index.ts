import type {
  AdminMetric,
  ApiDemandLevel,
  ApiDistrictProfile,
  ApiMarketZone,
  ApiPaymentMethod,
  ApiPricingCity,
  ApiServiceTier,
  ApiUserRole,
  ApiVehicleType,
  DriverOffer,
  PaymentMethod,
  PricingEstimate,
  RideOption,
  RideRequestLifecycleStatus,
  ServiceTier,
  TripLifecycleStatus,
  VehicleCategory,
  VoiceSuggestion,
} from '@mobilis/domain';
export type {
  AdminMetric,
  ApiDemandLevel,
  ApiDistrictProfile,
  ApiMarketZone,
  ApiPaymentMethod,
  ApiPricingCity,
  ApiRoadCondition,
  ApiServiceTier,
  ApiTrafficLevel,
  ApiUserRole,
  ApiVehicleType,
  ApiWeatherCondition,
  BookingDraft,
  BurkinaPricingCityPreset,
  CoordinatePoint,
  Coordinates,
  DemandLevel,
  DriverOffer,
  MarketZone,
  Money,
  PaymentMethod,
  Place,
  PricingEstimate,
  RideOption,
  RideRequestLifecycleStatus,
  RideStatus,
  ServiceTier,
  TripLifecycleStatus,
  UserRole,
  VehicleCategory,
  VoiceSuggestion,
} from '@mobilis/domain';
export {
  activeRideRequestLifecycleStatuses,
  activeTripLifecycleStatuses,
  allowedTripLifecycleTransitions,
  apiDemandLevels,
  apiDistrictProfiles,
  apiMarketZones,
  apiPaymentMethods,
  apiPricingCities,
  apiRoadConditions,
  apiServiceTiers,
  apiTrafficLevels,
  apiVehicleTypes,
  apiWeatherConditions,
  canTransitionTripLifecycleStatus,
  calculateDistanceKm,
  defaultBookingDraft,
  burkinaPricingCityPresets,
  demandLevels,
  estimateDurationMinutes,
  hasDefinedCoordinates,
  isActiveRideRequestLifecycleStatus,
  isActiveTripLifecycleStatus,
  isPickupCodeVisibleTripLifecycleStatus,
  marketZones,
  mobilisBrand,
  paymentMethods,
  pickupCodeVisibleTripLifecycleStatuses,
  roundDistanceKm,
  resolveBurkinaPricingPresetForPlace,
  rideRequestLifecycleStatuses,
  rideStatuses,
  serviceTiers,
  tripLifecycleStatuses,
  userRoles,
  vehicleCategories,
} from '@mobilis/domain';

export const apiConfig = {
  versionPrefix: 'v1',
  defaultPort: 3000,
  apiPrefix: '/api',
  swaggerPath: '/docs',
} as const;

export const apiRoutes = {
  health: '/health',
  auth: {
    signUp: '/auth/sign-up',
    signIn: '/auth/sign-in',
    me: '/auth/me',
    sessions: '/auth/sessions',
    signOut: '/auth/sign-out',
  },
  mobile: {
    errorReports: '/mobile/error-reports',
  },
  admin: {
    preview: '/admin/preview',
    overview: '/admin/overview',
    liveOps: '/admin/live-ops',
    launchReadiness: '/admin/launch-readiness',
    jobQueue: '/admin/job-queue',
    stream: '/admin/stream',
    healthIncidents: '/admin/health-incidents',
    supportTickets: '/admin/support-tickets',
    driverWallets: '/admin/driver-wallets',
    driverPayouts: '/admin/driver-payouts',
    driverPayoutSettlementCsv: '/admin/driver-payouts/settlement.csv',
    driverPayoutSettlementPdf: '/admin/driver-payouts/settlement.pdf',
    featureFlags: '/admin/feature-flags',
    dispatchSettings: '/admin/dispatch-settings',
    pricingCalibration: '/admin/pricing-calibration',
    paymentWebhookEvents: '/admin/payment-webhook-events',
    paymentAttempts: '/admin/payment-attempts',
    driverOnboarding: '/admin/driver-onboarding',
    driverOnboardingQueue: '/admin/driver-onboarding-queue',
    driverOnboardingExportHistory: '/admin/driver-onboarding/export-history',
    driverOnboardingExportCsv: '/admin/driver-onboarding/export.csv',
  },
  riders: {
    me: '/riders/me',
    overview: '/riders/overview',
    savedPlaces: '/riders/saved-places',
    trustedContact: '/riders/trusted-contact',
  },
  drivers: {
    root: '/drivers',
    previewOffers: '/drivers/preview-offers',
    me: '/drivers/me',
    earnings: '/drivers/earnings',
    overview: '/drivers/overview',
    offers: '/drivers/offers',
    declineOffer: '/drivers/offers',
    availability: '/drivers/availability',
    presence: '/drivers/presence',
    onboarding: '/drivers/onboarding',
    onboardingDocumentUploadLinks: '/drivers/onboarding/document-upload-links',
  },
  vehicles: '/vehicles',
  rideRequests: {
    root: '/ride-requests',
    active: '/ride-requests/active',
  },
  trips: {
    root: '/trips',
    dashboard: '/trips/dashboard',
    mine: '/trips/mine',
    stream: '/trips/stream',
    shared: '/trips/shared',
    acceptRideRequest: '/trips/accept',
    verifyPickupCode: '/trips',
    shareLink: '/trips',
    reportIncident: '/trips',
    safetySos: '/trips',
  },
  pricing: {
    rules: '/pricing/rules',
    estimate: '/pricing/estimate',
    rideOptions: '/pricing/ride-options',
  },
  payments: {
    checkoutIntents: '/payments/checkout-intents',
    webhooks: '/payments/webhooks',
  },
  voice: {
    locationIntent: '/voice/location-intent',
  },
} as const;

export type ApiClientOptions = {
  baseUrl: string;
  version?: string;
  defaultHeaders?: Record<string, string>;
  fetcher?: typeof fetch;
};

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
};

export class MobilisApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'MobilisApiError';
  }
}

export function isMobilisApiError(error: unknown): error is MobilisApiError {
  return error instanceof MobilisApiError;
}

export function extractApiErrorMessage(
  error: unknown,
  fallback = 'Une erreur reseau ou serveur est survenue.',
) {
  if (isMobilisApiError(error)) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export type MobilisClientErrorSurface =
  | 'auth'
  | 'booking'
  | 'payments'
  | 'active-trip'
  | 'safety'
  | 'profile'
  | 'driver-availability'
  | 'network'
  | 'unknown';

export type MobilisClientErrorClassification = {
  code:
    | 'MOB-AUTH-SESSION'
    | 'MOB-BOOKING-DISPATCH'
    | 'MOB-PAYMENT-PROVIDER'
    | 'MOB-REALTIME-DEGRADED'
    | 'MOB-SAFETY-INCIDENT'
    | 'MOB-NETWORK-OFFLINE'
    | 'MOB-VALIDATION-INPUT'
    | 'MOB-GENERIC-API';
  surface: MobilisClientErrorSurface;
  severity: 'low' | 'medium' | 'high' | 'critical';
  owner: 'engineering' | 'ops' | 'support' | 'finance';
  retryPolicy:
    | 'silent-refresh-once-then-relogin'
    | 'idempotent-retry-with-visible-status'
    | 'server-reconcile-before-client-retry'
    | 'fallback-polling-with-last-known-state'
    | 'store-local-and-escalate-to-support'
    | 'retry-when-network-recovers'
    | 'fix-input-before-retry'
    | 'manual-refresh';
  userMessage: string;
  shouldClearSessionToken: boolean;
  shouldNavigateToAuth: boolean;
  reportable: boolean;
};

export type MobilisClientAppRole = 'rider' | 'driver';

const mobilisClientErrorCodes = [
  'MOB-AUTH-SESSION',
  'MOB-BOOKING-DISPATCH',
  'MOB-PAYMENT-PROVIDER',
  'MOB-REALTIME-DEGRADED',
  'MOB-SAFETY-INCIDENT',
  'MOB-NETWORK-OFFLINE',
  'MOB-VALIDATION-INPUT',
  'MOB-GENERIC-API',
] as const;

const mobilisClientErrorSurfaces = [
  'auth',
  'booking',
  'payments',
  'active-trip',
  'safety',
  'profile',
  'driver-availability',
  'network',
  'unknown',
] as const;

const mobilisClientErrorSeverities = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

const mobilisClientErrorOwners = [
  'engineering',
  'ops',
  'support',
  'finance',
] as const;

const mobilisClientErrorRetryPolicies = [
  'silent-refresh-once-then-relogin',
  'idempotent-retry-with-visible-status',
  'server-reconcile-before-client-retry',
  'fallback-polling-with-last-known-state',
  'store-local-and-escalate-to-support',
  'retry-when-network-recovers',
  'fix-input-before-retry',
  'manual-refresh',
] as const;

export type MobilisClientErrorReport = {
  id: string;
  occurredAt: string;
  appRole: MobilisClientAppRole;
  appVersion?: string;
  classification: MobilisClientErrorClassification;
  fingerprint: string;
  errorName: string;
  errorMessage: string;
  context: Record<string, string | number | boolean | null>;
};

export type SubmitMobileErrorReportsPayload = {
  reports: MobilisClientErrorReport[];
};

export type SubmitMobileErrorReportsResponse = {
  acceptedReports: number;
  ignoredReports: number;
  duplicateReports: number;
  supportTicketCount: number;
};

export function normalizeMobilisClientErrorReportQueue(
  value: unknown,
  options: {
    appRole?: MobilisClientAppRole;
    maxReports?: number;
  } = {},
): MobilisClientErrorReport[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const maxReports = options.maxReports ?? 20;
  const reports: MobilisClientErrorReport[] = [];

  for (const item of value) {
    const report = normalizeMobilisClientErrorReport(item, options.appRole);

    if (report) {
      reports.push(report);
    }

    if (reports.length >= maxReports) {
      break;
    }
  }

  return reports;
}

export function classifyMobilisClientError(
  error: unknown,
  input: {
    surface?: MobilisClientErrorSurface;
    fallbackMessage?: string;
  } = {},
): MobilisClientErrorClassification {
  const surface = input.surface ?? inferMobilisErrorSurface(error);
  const normalizedMessage = normalizeMobilisErrorMessage(error);

  if (isMobilisApiError(error) && [401, 403].includes(error.status)) {
    return {
      code: 'MOB-AUTH-SESSION',
      surface: 'auth',
      severity: 'high',
      owner: 'engineering',
      retryPolicy: 'silent-refresh-once-then-relogin',
      userMessage:
        'Session expiree. Reconnecte-toi pour continuer sans melanger les actions.',
      shouldClearSessionToken: true,
      shouldNavigateToAuth: true,
      reportable: true,
    };
  }

  if (isLikelyMobilisNetworkError(error)) {
    return {
      code: 'MOB-NETWORK-OFFLINE',
      surface: 'network',
      severity: 'medium',
      owner: 'engineering',
      retryPolicy: 'retry-when-network-recovers',
      userMessage:
        'Connexion instable. Mobilis garde le dernier etat connu pendant la reprise reseau.',
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: false,
    };
  }

  if (isMobilisApiError(error) && error.status === 400) {
    return {
      code: 'MOB-VALIDATION-INPUT',
      surface,
      severity: 'low',
      owner: surface === 'payments' ? 'finance' : 'ops',
      retryPolicy: 'fix-input-before-retry',
      userMessage: extractApiErrorMessage(
        error,
        input.fallbackMessage ?? 'Certaines informations doivent etre corrigees.',
      ),
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: false,
    };
  }

  if (surface === 'booking') {
    return {
      code: 'MOB-BOOKING-DISPATCH',
      surface,
      severity: 'critical',
      owner: 'ops',
      retryPolicy: 'idempotent-retry-with-visible-status',
      userMessage:
        input.fallbackMessage ??
        'La demande est en verification. Aucun double trajet ne sera cree.',
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: true,
    };
  }

  if (surface === 'payments') {
    return {
      code: 'MOB-PAYMENT-PROVIDER',
      surface,
      severity: 'critical',
      owner: 'finance',
      retryPolicy: 'server-reconcile-before-client-retry',
      userMessage:
        input.fallbackMessage ??
        'Paiement en verification. Le support voit deja la transaction.',
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: true,
    };
  }

  if (surface === 'safety' || normalizedMessage.includes('sos')) {
    return {
      code: 'MOB-SAFETY-INCIDENT',
      surface: 'safety',
      severity: 'critical',
      owner: 'support',
      retryPolicy: 'store-local-and-escalate-to-support',
      userMessage:
        input.fallbackMessage ??
        'Alerte securite en reprise. Garde le telephone disponible et reessaie si besoin.',
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: true,
    };
  }

  if (surface === 'active-trip' || normalizedMessage.includes('realtime')) {
    return {
      code: 'MOB-REALTIME-DEGRADED',
      surface: 'active-trip',
      severity: 'medium',
      owner: 'engineering',
      retryPolicy: 'fallback-polling-with-last-known-state',
      userMessage:
        input.fallbackMessage ??
        'Connexion live instable. Le trajet reste suivi par Mobilis.',
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: true,
    };
  }

  return {
    code: 'MOB-GENERIC-API',
    surface,
    severity: 'medium',
    owner: 'engineering',
    retryPolicy: 'manual-refresh',
    userMessage: extractApiErrorMessage(
      error,
      input.fallbackMessage ?? 'Une erreur reseau ou serveur est survenue.',
    ),
    shouldClearSessionToken: false,
    shouldNavigateToAuth: false,
    reportable: true,
  };
}

export function createMobilisClientErrorReport(
  error: unknown,
  input: {
    appRole: MobilisClientAppRole;
    appVersion?: string;
    surface?: MobilisClientErrorSurface;
    fallbackMessage?: string;
    occurredAt?: string;
    context?: Record<string, unknown>;
  },
): MobilisClientErrorReport | null {
  const classification = classifyMobilisClientError(error, {
    surface: input.surface,
    fallbackMessage: input.fallbackMessage,
  });

  return createMobilisClientErrorReportFromClassification(error, {
    appRole: input.appRole,
    appVersion: input.appVersion,
    classification,
    occurredAt: input.occurredAt,
    context: input.context,
  });
}

export function createMobilisClientErrorReportFromClassification(
  error: unknown,
  input: {
    appRole: MobilisClientAppRole;
    appVersion?: string;
    classification: MobilisClientErrorClassification;
    occurredAt?: string;
    context?: Record<string, unknown>;
  },
): MobilisClientErrorReport | null {
  if (!input.classification.reportable) {
    return null;
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const errorName = error instanceof Error ? error.name : typeof error;
  const errorMessage = sanitizeMobilisErrorReportValue(
    extractApiErrorMessage(error, input.classification.userMessage),
    220,
  );
  const fingerprint = buildMobilisClientErrorFingerprint({
    appRole: input.appRole,
    code: input.classification.code,
    surface: input.classification.surface,
    message: errorMessage,
  });

  return {
    id: `moberr_${occurredAt.replace(/[^0-9]/g, '').slice(0, 14)}_${fingerprint}`,
    occurredAt,
    appRole: input.appRole,
    appVersion: input.appVersion,
    classification: input.classification,
    fingerprint,
    errorName: sanitizeMobilisErrorReportValue(errorName, 80),
    errorMessage,
    context: sanitizeMobilisErrorReportContext(input.context),
  };
}

function sanitizeMobilisErrorReportContext(context?: Record<string, unknown>) {
  const sanitized: Record<string, string | number | boolean | null> = {};

  if (!context) {
    return sanitized;
  }

  for (const [key, value] of Object.entries(context).slice(0, 16)) {
    const cleanKey = sanitizeMobilisErrorReportValue(key, 48);

    if (!cleanKey) {
      continue;
    }

    if (typeof value === 'string') {
      sanitized[cleanKey] = sanitizeMobilisErrorReportValue(value, 160);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[cleanKey] = value;
    } else if (typeof value === 'boolean' || value === null) {
      sanitized[cleanKey] = value;
    }
  }

  return sanitized;
}

function sanitizeMobilisErrorReportValue(value: string, maxLength: number) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]')
    .replace(
      /\b(sessiontoken|session|token|authorization|password|secret)\s*[=:]\s*(?:bearer\s+)?["']?[^"'&\s,;)]+["']?/gi,
      '$1=[redacted]',
    )
    .replace(/bearer\s+["']?[a-z0-9._~+/=-]+["']?/gi, 'Bearer [token]')
    .slice(0, maxLength);
}

function normalizeMobilisClientErrorReport(
  value: unknown,
  expectedAppRole?: MobilisClientAppRole,
): MobilisClientErrorReport | null {
  if (!isRecord(value)) {
    return null;
  }

  const appRole = parseEnumValue(value.appRole, ['rider', 'driver'] as const);
  const classification = normalizeMobilisClientErrorClassification(
    value.classification,
  );

  if (!appRole || !classification || classification.reportable !== true) {
    return null;
  }

  if (expectedAppRole && appRole !== expectedAppRole) {
    return null;
  }

  const id = normalizeErrorReportIdentifier(value.id, 96);
  const occurredAt = normalizeIsoDate(value.occurredAt);
  const fingerprint = normalizeErrorReportIdentifier(value.fingerprint, 80);
  const errorName = normalizeErrorReportText(value.errorName, 80);
  const errorMessage = normalizeErrorReportText(value.errorMessage, 220);

  if (!id || !occurredAt || !fingerprint || !errorName || !errorMessage) {
    return null;
  }

  return {
    id,
    occurredAt,
    appRole,
    appVersion: normalizeOptionalErrorReportText(value.appVersion, 48),
    classification,
    fingerprint,
    errorName,
    errorMessage,
    context: normalizeMobilisErrorReportContext(value.context),
  };
}

function normalizeMobilisClientErrorClassification(
  value: unknown,
): MobilisClientErrorClassification | null {
  if (!isRecord(value)) {
    return null;
  }

  const code = parseEnumValue(value.code, mobilisClientErrorCodes);
  const surface = parseEnumValue(value.surface, mobilisClientErrorSurfaces);
  const severity = parseEnumValue(value.severity, mobilisClientErrorSeverities);
  const owner = parseEnumValue(value.owner, mobilisClientErrorOwners);
  const retryPolicy = parseEnumValue(
    value.retryPolicy,
    mobilisClientErrorRetryPolicies,
  );

  if (!code || !surface || !severity || !owner || !retryPolicy) {
    return null;
  }

  if (
    typeof value.shouldClearSessionToken !== 'boolean' ||
    typeof value.shouldNavigateToAuth !== 'boolean' ||
    typeof value.reportable !== 'boolean'
  ) {
    return null;
  }

  return {
    code,
    surface,
    severity,
    owner,
    retryPolicy,
    userMessage: normalizeErrorReportText(value.userMessage, 240),
    shouldClearSessionToken: value.shouldClearSessionToken,
    shouldNavigateToAuth: value.shouldNavigateToAuth,
    reportable: value.reportable,
  };
}

function normalizeMobilisErrorReportContext(value: unknown) {
  const normalized: MobilisClientErrorReport['context'] = {};

  if (!isRecord(value)) {
    return normalized;
  }

  for (const [key, entry] of Object.entries(value).slice(0, 16)) {
    const cleanKey = normalizeErrorReportText(key, 48);

    if (!cleanKey) {
      continue;
    }

    if (typeof entry === 'string') {
      normalized[cleanKey] = normalizeErrorReportText(entry, 160);
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      normalized[cleanKey] = entry;
    } else if (typeof entry === 'boolean' || entry === null) {
      normalized[cleanKey] = entry;
    }
  }

  return normalized;
}

function normalizeIsoDate(value: unknown) {
  if (typeof value !== 'string' || value.length > 40) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeOptionalErrorReportText(value: unknown, maxLength: number) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = normalizeErrorReportText(value, maxLength);
  return normalized || undefined;
}

function normalizeErrorReportText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return '';
  }

  return sanitizeMobilisErrorReportValue(
    value.replace(/[\u0000-\u001f\u007f]/g, '').trim(),
    maxLength,
  );
}

function normalizeErrorReportIdentifier(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/[^a-z0-9._:-]/gi, '')
    .slice(0, maxLength);
}

function parseEnumValue<const T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number] | null {
  if (typeof value !== 'string') {
    return null;
  }

  return values.includes(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildMobilisClientErrorFingerprint(input: {
  appRole: MobilisClientAppRole;
  code: MobilisClientErrorClassification['code'];
  surface: MobilisClientErrorSurface;
  message: string;
}) {
  const seed = `${input.appRole}|${input.code}|${input.surface}|${input.message
    .toLowerCase()
    .slice(0, 80)}`;
  let hash = 5381;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33) ^ seed.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

export class MobilisApiClient {
  private readonly version: string;
  private readonly headers: Record<string, string>;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: ApiClientOptions) {
    this.version = options.version ?? apiConfig.versionPrefix;
    this.headers = options.defaultHeaders ?? {};
    this.fetcher = options.fetcher ?? fetch;
  }

  endpoint(path: string, query?: RequestOptions['query']) {
    const url = new URL(`${apiConfig.apiPrefix}/${this.version}${path}`, this.options.baseUrl);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  async request<T>(path: string, options: RequestOptions = {}) {
    const response = await this.fetcher(this.endpoint(path, options.query), {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      let errorPayload: unknown;

      try {
        errorPayload = await response.json();
      } catch {
        errorPayload = undefined;
      }

      const message =
        resolveApiErrorMessage(errorPayload) ??
        `Mobilis API request failed with status ${response.status}`;

      throw new MobilisApiError(message, response.status, errorPayload);
    }

    return (await response.json()) as T;
  }

  async requestText(path: string, options: RequestOptions = {}) {
    const response = await this.fetcher(this.endpoint(path, options.query), {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      let errorPayload: unknown;

      try {
        errorPayload = await response.json();
      } catch {
        errorPayload = undefined;
      }

      const message =
        resolveApiErrorMessage(errorPayload) ??
        `Mobilis API request failed with status ${response.status}`;

      throw new MobilisApiError(message, response.status, errorPayload);
    }

    return response.text();
  }

  withAuthToken(token: string) {
    return new MobilisApiClient({
      ...this.options,
      version: this.version,
      defaultHeaders: {
        ...this.headers,
        Authorization: `Bearer ${token}`,
      },
      fetcher: this.fetcher,
    });
  }
}

function normalizeMobilisErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  return '';
}

function isLikelyMobilisNetworkError(error: unknown) {
  if (error instanceof TypeError) {
    return true;
  }

  const message = normalizeMobilisErrorMessage(error);

  return (
    message.includes('network request failed') ||
    message.includes('fetch failed') ||
    message.includes('load failed') ||
    message.includes('networkerror')
  );
}

function inferMobilisErrorSurface(error: unknown): MobilisClientErrorSurface {
  const message = normalizeMobilisErrorMessage(error);

  if (
    message.includes('session') ||
    message.includes('token') ||
    message.includes('unauthorized')
  ) {
    return 'auth';
  }

  if (
    message.includes('payment') ||
    message.includes('paiement') ||
    message.includes('webhook') ||
    message.includes('refund')
  ) {
    return 'payments';
  }

  if (
    message.includes('ride request') ||
    message.includes('reservation') ||
    message.includes('booking') ||
    message.includes('dispatch')
  ) {
    return 'booking';
  }

  if (
    message.includes('trip') ||
    message.includes('trajet') ||
    message.includes('realtime')
  ) {
    return 'active-trip';
  }

  if (
    message.includes('sos') ||
    message.includes('incident') ||
    message.includes('safety')
  ) {
    return 'safety';
  }

  if (isLikelyMobilisNetworkError(error)) {
    return 'network';
  }

  return 'unknown';
}

export function createMobilisApiClient(baseUrl: string, init?: Omit<ApiClientOptions, 'baseUrl'>) {
  return new MobilisApiClient({
    baseUrl,
    ...init,
  });
}

export function buildRealtimeStreamUrl(
  client: MobilisApiClient,
  sessionToken: string,
) {
  return client.endpoint(apiRoutes.trips.stream, {
    sessionToken,
  });
}

export const riderRideOptions: RideOption[] = [
  {
    id: 'moto-standard',
    category: 'motorcycle',
    tier: 'moto-standard',
    title: 'Moto Express',
    etaMinutes: 3,
    fare: 1200,
    capacity: '1 place',
    accent: '#2dd4bf',
    badge: 'Le plus rapide',
    paymentMethods: ['mobile-money', 'cash', 'wallet'],
    safetyNote: 'Code de prise en charge et partage du trajet actifs.',
    fareBreakdown: {
      baseFare: 600,
      bookingFee: 150,
      demandMultiplier: 1,
    },
  },
  {
    id: 'car-standard',
    category: 'car',
    tier: 'car-standard',
    title: 'Voiture Ville',
    etaMinutes: 6,
    fare: 2400,
    capacity: '4 places',
    accent: '#f59e0b',
    badge: 'Le plus populaire',
    paymentMethods: ['mobile-money', 'cash', 'wallet'],
    safetyNote: 'Tarif transparent avant confirmation et suivi partageable.',
    fareBreakdown: {
      baseFare: 1200,
      bookingFee: 250,
      demandMultiplier: 1.1,
    },
  },
  {
    id: 'car-confort',
    category: 'car',
    tier: 'car-comfort',
    title: 'Confort',
    etaMinutes: 8,
    fare: 3500,
    capacity: '4 places',
    accent: '#38bdf8',
    badge: 'Premium',
    paymentMethods: ['mobile-money', 'wallet'],
    safetyNote: 'Verification chauffeur renforcee et experience plus calme.',
    fareBreakdown: {
      baseFare: 1500,
      bookingFee: 300,
      demandMultiplier: 1.15,
    },
  },
];

export const driverOffers: DriverOffer[] = [
  {
    id: 'offer-001',
    riderName: 'Awa Ouedraogo',
    pickup: 'Universite Joseph Ki-Zerbo',
    destination: 'Ouaga 2000',
    category: 'motorcycle',
    fare: 1600,
    distanceKm: 5.8,
    etaToPickupMinutes: 4,
    driverPayout: 1440,
    pickupCodeRequired: true,
    pickupDistanceKm: 1.2,
    pickupDistanceSource: 'DRIVER_AND_PICKUP_COORDINATES',
    reservationExpiresAt: new Date('2026-04-18T08:00:30.000Z').toISOString(),
    serviceRadiusKm: 8,
    dispatchScore: 86,
    matchedTier: 'MOTO_STANDARD',
    dispatchContextSummary: 'HIGH - HEAVY - dispo 74/100',
    offerConfidenceScore: 91,
    offerConfidenceLabel: 'PRIORITY',
    reservationWindowSeconds: 45,
    dispatchLearningSummary:
      'Memoire dispatch solide: acceptations recentes elevees. Signal recent.',
  },
  {
    id: 'offer-002',
    riderName: 'Moussa Traore',
    pickup: 'Zone du Bois',
    destination: 'Koulouba',
    category: 'car',
    fare: 2900,
    distanceKm: 7.2,
    etaToPickupMinutes: 6,
    driverPayout: 2378,
    pickupCodeRequired: true,
    pickupDistanceKm: 2.8,
    pickupDistanceSource: 'DRIVER_AND_PICKUP_COORDINATES',
    reservationExpiresAt: new Date('2026-04-18T08:00:30.000Z').toISOString(),
    serviceRadiusKm: 8,
    dispatchScore: 71,
    matchedTier: 'CAR_STANDARD',
    dispatchContextSummary: 'BALANCED - MODERATE - dispo 81/100',
    offerConfidenceScore: 68,
    offerConfidenceLabel: 'HIGH',
    reservationWindowSeconds: 35,
    dispatchLearningSummary:
      'Memoire dispatch correcte: quelques expirations recentes a surveiller. Signal recent.',
  },
];

export const adminMetrics: AdminMetric[] = [
  { label: 'Reservations brutes', value: 'XOF 3,2M', trend: '+14% cette semaine' },
  { label: 'Taux de completion', value: '94,8%', trend: '+2,1 pts' },
  { label: 'Temps moyen pickup', value: '3 min 12 s', trend: '-28 s' },
  { label: 'Incidents en direct', value: '3', trend: '2 a revoir' },
];

export const voiceSuggestions: VoiceSuggestion[] = [
  { id: 'loc-1', name: 'Ouaga 2000', district: 'Ouagadougou', confidence: 0.98 },
  { id: 'loc-2', name: 'Universite Joseph Ki-Zerbo', district: 'Ouagadougou', confidence: 0.96 },
  { id: 'loc-3', name: 'Aeroport de Ouagadougou', district: 'Ouagadougou', confidence: 0.91 },
];

export type SignUpPayload = {
  fullName: string;
  email: string;
  password: string;
  role: ApiUserRole;
};

export type SignInPayload = {
  email: string;
  password: string;
};

export type SignUpApiPayload = {
  fullName: string;
  email: string;
  password: string;
  role: 'RIDER' | 'DRIVER';
};

export type AuthSessionResponse = {
  message: string;
  sessionToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: ApiUserRole;
  };
  session: {
    id: string;
    expiresAt: string;
  };
};

export type CurrentUserResponse = {
  user: {
    id: string;
    email: string;
    fullName: string;
    phoneNumber: string | null;
    role: ApiUserRole;
    riderProfile: {
      id: string;
      preferredTier?: ApiServiceTier | null;
    } | null;
    driverProfile: {
      id: string;
      status?: string | null;
    } | null;
  };
  session: {
    id: string;
    expiresAt: string;
  };
};

export type AuthenticatedApiContext = {
  session: AuthSessionResponse;
  authClient: MobilisApiClient;
  me: CurrentUserResponse;
};

export type SessionStorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type AdminPreviewResponse = {
  metrics: AdminMetric[];
  operations: Array<{
    title: string;
    value: string;
    note: string;
  }>;
  incidents: string[];
};

export type AdminOverviewResponse = {
  users: number;
  riders: number;
  drivers: number;
  vehicles: number;
  openRequests: number;
  activeTrips: number;
};

export type AdminLiveOpsResponse = {
  summary: {
    activeTrips: number;
    openRequests: number;
    urgentSupportTickets: number;
    tripsByStatus: {
      matched: number;
      arriving: number;
      inProgress: number;
    };
    payments: {
      lookbackHours: number;
      attempts: number;
      succeeded: number;
      failed: number;
      refundPending: number;
      refunded: number;
      reconciled: number;
      webhookEvents: number;
      webhookConflicts: number;
      webhookUnknownReferences: number;
      successRate: number;
      reconciliationRate: number;
    };
  };
  trips: Array<{
    id: string;
    status: string;
    riderName: string;
    driverName: string;
    route: string;
    fare: number;
    currency: string;
    vehicleLabel: string;
    pickupCodeIssued: boolean;
    hasIncident: boolean;
    incidentCount: number;
    routeMonitoring: {
      state: 'clear' | 'warning' | 'critical' | 'unknown';
      alertCount: number;
      lastAlertType: string | null;
      lastAlertAt: string | null;
      lastPositionAt: string | null;
    };
    lastEvent: {
      label: string;
      createdAt: string;
    } | null;
    timeline: Array<{
      id: string;
      label: string;
      createdAt: string;
    }>;
  }>;
  alerts: string[];
};

export type AdminLaunchReadinessResponse = {
  generatedAt: string;
  environment: string;
  decision: {
    state: 'approved' | 'limited' | 'blocked';
    label: string;
    detail: string;
  };
  summary: {
    failedChecks: number;
    warningChecks: number;
    passedChecks: number;
    totalChecks: number;
  };
  checks: Array<{
    id: string;
    label: string;
    state: 'pass' | 'warn' | 'fail';
    detail: string;
  }>;
  nextActions?: Array<{
    checkId: string;
    severity: 'warning' | 'blocking';
    owner: 'ops' | 'engineering' | 'support' | 'finance';
    action: string;
    runbookAnchor: string;
  }>;
  acknowledgements?: Array<{
    checkId: string;
    owner: 'ops' | 'engineering' | 'support' | 'finance';
    severity: 'warning' | 'blocking';
    acknowledgedAt: string;
    actor: {
      id: string;
      name: string | null;
      role: string | null;
    };
    notes: string | null;
  }>;
  actionSummary?: {
    totalActions: number;
    acknowledgedActions: number;
    remainingActions: number;
    blockingActions: number;
    acknowledgedBlockingActions: number;
    remainingBlockingActions: number;
    completionRate: number;
  };
  safetyBenchmark?: {
    summary: {
      totalCapabilities: number;
      activeCapabilities: number;
      partialCapabilities: number;
      plannedCapabilities: number;
      criticalGaps: number;
      competitorParityRate: number;
    };
    capabilities: Array<{
      id: string;
      label: string;
      status: 'active' | 'partial' | 'planned';
      priority: 'critical' | 'high' | 'medium';
      mobilisSignal: string;
      competitorSignal: string;
      nextStep: string;
    }>;
  };
  fieldQuality?: {
    score: number;
    state: 'excellent' | 'watch' | 'blocked';
    blockedSignals: number;
    watchSignals: number;
    signals: Array<{
      id: string;
      label: string;
      score: number;
      state: 'excellent' | 'watch' | 'blocked';
      owner: 'ops' | 'engineering' | 'support' | 'finance';
      competitorReference: string;
      mobilisSignal: string;
      nextStep: string;
    }>;
  };
  productionReadiness: NonNullable<
    HealthCheckResponse['operations']['productionReadiness']
  >;
};

export type AdminLaunchReadinessActionAcknowledgementResponse = {
  acknowledgement: {
    checkId: string;
    owner: 'ops' | 'engineering' | 'support' | 'finance';
    severity: 'warning' | 'blocking';
    acknowledgedAt: string;
  };
};

export type SupportTicketQueueResponse = {
  tickets: Array<{
    id: string;
    subject: string;
    description: string;
    status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';
    priority: number;
    requesterName: string;
    requesterRole: string;
    tripId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type SupportTicketUpdateResponse = {
  ticket: {
    id: string;
    status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';
    priority: number;
    updatedAt: string;
  };
};

export type AdminDriverWalletsResponse = {
  summary: {
    walletCount: number;
    totalBalance: number;
    totalPayouts: number;
    totalCommission: number;
    recoveryWalletCount: number;
    totalRecoveryDue: number;
  };
  wallets: Array<{
    id: string;
    driverUserId: string;
    driverName: string;
    driverStatus: string | null;
    verificationStatus: string | null;
    currency: string;
    balance: number;
    recoveryDue: number;
    isLocked: boolean;
    payoutTotal: number;
    commissionTotal: number;
    lastActivityAt: string;
    preparedPayout: {
      id: string;
      amount: number;
      currency: string;
      status: 'PREPARED' | 'PAID' | 'CANCELLED';
      reference: string;
      notes: string | null;
      preparedAt: string;
    } | null;
    recentPayouts: Array<{
      id: string;
      amount: number;
      currency: string;
      status: 'PREPARED' | 'PAID' | 'CANCELLED';
      reference: string;
      notes: string | null;
      preparedAt: string;
      paidAt: string | null;
    }>;
    recentTransactions: Array<{
      id: string;
      type: 'CREDIT' | 'DEBIT' | 'ADJUSTMENT' | 'PAYOUT' | 'REFUND';
      amount: number;
      reference: string | null;
      description: string | null;
      createdAt: string;
      paymentAttemptId: string | null;
      provider: string | null;
      commissionAmount: number;
    }>;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

export type AdminDriverPayoutResponse = {
  action: 'prepared' | 'existing_prepared_payout' | 'paid' | 'already_paid' | 'already_finalized';
  payout: {
    id: string;
    walletId: string;
    amount: number;
    currency: string;
    status: 'PREPARED' | 'PAID' | 'CANCELLED';
    reference: string;
    notes: string | null;
    preparedAt: string;
    paidAt: string | null;
  };
};

export type AdminDriverWalletRecoveryAdjustmentResponse = {
  action: 'recorded' | 'already_recorded';
  wallet: {
    id: string;
    balance: number;
    currency: string;
    recoveryDue: number;
  };
  transaction: {
    id: string;
    type: 'ADJUSTMENT';
    amount: number;
    reference: string | null;
    description: string | null;
    createdAt: string;
  };
};

export type AdminPaymentWebhookEventsResponse = {
  events: Array<{
    id: string;
    provider: 'FLUTTERWAVE' | 'CINETPAY';
    eventType: string;
    transactionRef: string | null;
    providerReference: string | null;
    action: string;
    reconciledAttemptCount: number;
    signatureVerified: boolean;
    rawBodyHash: string | null;
    payloadPreview: Record<string, unknown>;
    paymentAttemptId: string | null;
    paymentAttempt: {
      status:
        | 'INITIATED'
        | 'PENDING'
        | 'SUCCEEDED'
        | 'FAILED'
        | 'CANCELLED'
        | 'REFUND_PENDING'
        | 'REFUNDED';
      amount: number;
      currency: string;
      rideRequestId: string;
      failureReason: string | null;
      updatedAt: string;
    } | null;
    userId: string | null;
    createdAt: string;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
  summary: {
    paymentEvents: number;
    refundEvents: number;
    ignoredEvents: number;
  };
};

export type AdminPaymentWebhookEventDetailResponse = {
  event: AdminPaymentWebhookEventsResponse['events'][number] & {
    payload: unknown;
    paymentAttempt: {
      status: string;
      amount: number;
      currency: string;
      rideRequestId: string;
      failureReason: string | null;
      updatedAt: string;
    } | null;
  };
};

export type AdminPaymentWebhookInvestigationResponse = {
  investigation: {
    eventId: string;
    status: 'STARTED';
    supportTicket: {
      id: string;
      status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';
      priority: number;
    } | null;
  };
};

export type AdminPaymentWebhookReplayResponse = {
  replay: {
    replayed: true;
    sourceEventId: string;
    result: {
      received: true;
      event: string;
      transactionRef: string | null;
      provider: 'flutterwave' | 'cinetpay';
      providerReference?: string;
      reconciledAttemptCount: number;
      nextAction: string;
    };
  };
};

export type AdminPaymentAttemptProviderVerificationResponse = {
  verification: {
    verified: true;
    paymentAttemptId: string;
    provider: 'flutterwave' | 'cinetpay';
    transactionRef: string;
    result: {
      received: true;
      event: string;
      transactionRef: string | null;
      provider: 'flutterwave' | 'cinetpay';
      providerReference?: string;
      reconciledAttemptCount: number;
      nextAction: string;
    };
  };
};

export type AdminPaymentAttemptRefundResponse = {
  refund: {
    action: 'refunded' | 'refund_pending' | 'already_refunded';
    providerRefundReference: string;
    paymentAttempt: {
      id: string;
      provider: 'FLUTTERWAVE' | 'CINETPAY';
      status: 'REFUND_PENDING' | 'REFUNDED';
      amount: number;
      currency: string;
      transactionRef: string;
      providerReference: string | null;
      updatedAt: string;
    };
    walletReversal: {
      applied: boolean;
      reason?: string;
      walletId?: string;
      amount?: number;
      currency?: string;
    };
  };
};

export type AdminJobQueueKind =
  | 'PAYMENT_WEBHOOK'
  | 'DRIVER_DOCUMENT'
  | 'NOTIFICATION'
  | 'DRIVER_RESERVATION_EXPIRY';

export type DriverOnboardingQueueResponse = {
  drivers: Array<{
    id: string;
    driverName: string;
    email: string;
    phoneNumber: string | null;
    verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
    reviewStatus:
      | 'SUBMITTED'
      | 'UNDER_REVIEW'
      | 'APPROVED'
      | 'REJECTED'
      | 'CHANGES_REQUESTED';
    latestReviewAt: string | null;
    latestReviewActor: string | null;
    latestDecisionReason: string | null;
    serviceRadiusKm: number;
    activeVehicleCount: number;
    documentSummary: {
      total: number;
      approved: number;
      pending: number;
      rejected: number;
      integrityWarnings: number;
      averageIntegrityScore: number;
      missingRequired: number;
    };
    decisionGuidance: {
      level: 'approve' | 'review' | 'resubmit';
      recommendedStatus: 'APPROVED' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED';
      label: string;
      detail: string;
      blockers: string[];
    };
    reviewHistory: Array<{
      id: string;
      status:
        | 'SUBMITTED'
        | 'UNDER_REVIEW'
        | 'APPROVED'
        | 'REJECTED'
        | 'CHANGES_REQUESTED';
      actorName: string;
      decisionReason: string | null;
      createdAt: string;
      decisionGuidance: {
        level: 'approve' | 'review' | 'resubmit';
        recommendedStatus: 'APPROVED' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED';
        label: string;
        detail: string;
        blockers: string[];
      } | null;
      documentSummary: {
        total: number;
        approved: number;
        pending: number;
        rejected: number;
        missingRequired: number;
        integrityWarnings: number;
      } | null;
    }>;
    documents: Array<{
      id: string;
      type:
        | 'IDENTITY_DOCUMENT'
        | 'DRIVER_LICENSE'
        | 'VEHICLE_REGISTRATION'
        | 'INSURANCE_PROOF'
        | 'SELFIE_VERIFICATION';
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
      fileName: string;
      uploadedAt: string;
      expiresAt: string | null;
      rejectionReason: string | null;
      integrity: {
        state: 'complete' | 'partial' | 'missing';
        score: number;
        sizeBytes: number | null;
        sha256: string | null;
        uploadSource: string | null;
        capturedAt: string | null;
        objectVerification: {
          state: 'confirmed' | 'pending' | 'failed' | 'missing';
          provider: string | null;
          objectId: string | null;
          verifiedAt: string | null;
          sizeBytes: number | null;
          sha256: string | null;
          failureReason: string | null;
        };
        safetyScan: {
          state: 'clear' | 'pending' | 'quarantined';
          engine: string | null;
          scannedAt: string | null;
          findings: string[];
          quarantineReason: string | null;
        };
        guidance: {
          level: 'clear' | 'review' | 'resubmit';
          label: string;
          detail: string;
        };
        checks: Array<{
          id: string;
          label: string;
          state: 'pass' | 'warn';
        }>;
      };
    }>;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

export type DriverOnboardingExportHistoryResponse = {
  exports: Array<{
    id: string;
    createdAt: string;
    actor: {
      id: string;
      name: string;
      role: 'ADMIN' | 'OPS' | 'SUPPORT' | 'RIDER' | 'DRIVER';
    };
    guidanceFilter: 'all' | 'approve' | 'review' | 'resubmit';
    searchQuery: string | null;
    exportedCount: number;
    scannedCount: number;
    limit: number | null;
    format: 'csv' | 'unknown';
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

export type DriverOnboardingReviewUpdateResponse = {
  review: {
    id: string;
    driverId: string;
    verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
    status:
      | 'UNDER_REVIEW'
      | 'APPROVED'
      | 'REJECTED'
      | 'CHANGES_REQUESTED';
    decisionReason: string | null;
    createdAt: string;
  };
};

export type AdminFeatureFlagsResponse = {
  flags: Array<{
    flag: 'payments' | 'pricing' | 'realtime' | 'driverOnboarding' | 'voice';
    mode: string;
    allowlist: string[];
    effectiveForAnonymous: boolean;
  }>;
  infrastructure: {
    realtime: {
      adapter: string;
      sharedBackplane: boolean;
      degraded: boolean;
      degradeReason: string | null;
      activeStreams: number;
      publishedEvents: number;
      featureFlagMode: string;
      featureFlagEnabled: boolean;
    };
  };
};

export type AdminDispatchSettingsResponse = {
  settings: {
    lookbackHours: number;
    halfLifeHours: number;
    declineCooldownMinutes: number;
    historyLimit: number;
    source: 'DEFAULT' | 'DATABASE_OVERRIDE';
    updatedAt: string | null;
    updatedBy: {
      id: string;
      name: string | null;
      role: string | null;
    } | null;
  };
  history: Array<{
    id: string;
    createdAt: string;
    resetToDefaults: boolean;
    source: 'DEFAULT' | 'DATABASE_OVERRIDE';
    actor: {
      id: string;
      name: string | null;
      role: string | null;
    };
    before: {
      lookbackHours: number;
      halfLifeHours: number;
      declineCooldownMinutes: number;
      historyLimit: number;
    } | null;
    after: {
      lookbackHours: number;
      halfLifeHours: number;
      declineCooldownMinutes: number;
      historyLimit: number;
    } | null;
  }>;
};

export type AdminPricingCalibrationResponse = {
  window: {
    lookbackDays: number;
    since: string;
  };
  summary: {
    totalRequests: number;
    matchedRequests: number;
    completedTrips: number;
    cancelledRequests: number;
    expiredRequests: number;
    paidRequests: number;
    acceptanceRate: number;
    completionRate: number;
    cancellationRate: number;
    paymentConversionRate: number;
    paymentAttemptCount: number;
    failedPaymentAttemptCount: number;
    reconciledPaymentAttemptCount: number;
    paymentSuccessRate: number;
    paymentReconciliationRate: number;
    averageFare: number;
    averageDriverPayout: number;
    averageFarePerKm: number;
    averagePickupWaitMinutes: number;
  };
  paymentSignals: {
    attempts: number;
    succeeded: number;
    failed: number;
    reconciled: number;
    unresolved: number;
    webhookEvents: number;
    webhookIgnored: number;
    webhookSignatureVerified: number;
    failureReasons: Array<{
      reason: string;
      count: number;
    }>;
  };
  segments: Array<{
    vehicleType: string;
    serviceTier: string;
    requests: number;
    completionRate: number;
    cancellationRate: number;
    averageFare: number;
  }>;
  timeWindows: Array<{
    key: string;
    label: string;
    requests: number;
    matchedRequests: number;
    completedTrips: number;
    acceptanceRate: number;
    completionRate: number;
    cancellationRate: number;
    averageFare: number;
    averageFarePerKm: number;
    averagePickupWaitMinutes: number;
    targetAcceptanceRate: number;
    targetCancellationRate: number;
  }>;
  geographySegments: Array<{
    city: string;
    districtProfile: string;
    requests: number;
    matchedRequests: number;
    completedTrips: number;
    acceptanceRate: number;
    completionRate: number;
    cancellationRate: number;
    averageFare: number;
    averageFarePerKm: number;
  }>;
  recommendations: Array<{
    scope: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    action: string;
    rationale: string;
  }>;
  alerts: string[];
};

export type HealthCheckResponse = {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  runtime: {
    nodeVersion: string;
    pid: number;
    memory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
  };
  dependencies: {
    database: 'up' | 'down';
    rateLimit: 'up' | 'degraded';
    realtime: 'up' | 'degraded';
    driverReservationExpiry: 'up' | 'degraded' | 'disabled';
  };
  lifecycle: {
    state: string;
    drainReason: string | null;
    lastTransitionAt: string | null;
  };
  infrastructure: {
    rateLimit: {
      configuredAdapter: string;
      strict: boolean;
      adapter: string;
      sharedBackplane: boolean;
      degraded: boolean;
      degradeReason: string | null;
      trackedKeys: number;
    };
    realtime: {
      configuredAdapter: string;
      strict: boolean;
      adapter: string;
      sharedBackplane: boolean;
      degraded: boolean;
      degradeReason: string | null;
      activeStreams: number;
      publishedEvents: number;
      featureFlagMode?: string;
      featureFlagEnabled?: boolean;
    };
    jobQueue?: {
      durable: boolean;
      families: AdminJobQueueKind[];
      counts: Array<{
        kind: AdminJobQueueKind;
        status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'DEAD_LETTER';
        count: number;
      }>;
    };
  };
  operations: {
    productionReadiness?: {
      environment: string;
      riskLevel: 'low' | 'medium' | 'high';
      failedChecks: number;
      warningChecks: number;
      checks: Array<{
        id: string;
        label: string;
        state: 'pass' | 'warn' | 'fail';
        detail: string;
      }>;
    };
    serviceLevelObjectives?: {
      posture: 'healthy' | 'watch' | 'breached';
      failingObjectives: number;
      warningObjectives: number;
      objectives: Array<{
        id: string;
        label: string;
        target: string;
        window: string;
        owner: 'engineering' | 'ops' | 'support' | 'finance';
        state: 'pass' | 'warn' | 'fail';
        currentSignal: string;
        burnRate: 'normal' | 'elevated' | 'critical';
      }>;
      mobileErrorTaxonomy: Array<{
        code: string;
        surface: string;
        severity: 'medium' | 'high' | 'critical';
        owner: 'engineering' | 'ops' | 'support' | 'finance';
        retryPolicy: string;
        userMessage: string;
      }>;
    };
    driverReservationExpiry: {
      enabled: boolean;
      intervalMs: number;
      inFlight: boolean;
      totalSweeps: number;
      consecutiveFailures: number;
      lastExpiredReservations: number;
      lastStartedAt: string | null;
      lastCompletedAt: string | null;
      lastSucceededAt: string | null;
      lastFailedAt: string | null;
      lastFailureMessage: string | null;
      lastDurationMs: number | null;
    };
    healthHistory: Array<{
      id: string;
      tone: 'alert' | 'recovered';
      status: 'ok' | 'degraded';
      createdAt: string;
      title: string;
      detail: string;
      acknowledgedAt: string | null;
      acknowledgedBy: {
        id: string;
        fullName: string;
        role: string;
      } | null;
      mutedAt: string | null;
      mutedBy: {
        id: string;
        fullName: string;
        role: string;
      } | null;
    }>;
  };
};

export type AdminJobQueueResponse = {
  jobs: Array<{
    id: string;
    kind: AdminJobQueueKind;
    status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'DEAD_LETTER';
    dedupeKey: string | null;
    entityType: string | null;
    entityId: string | null;
    attempts: number;
    maxAttempts: number;
    nextRunAt: string;
    lockedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    lastError: string | null;
    deadLetterReason: string | null;
    diagnostics: {
      attemptPressure: number;
      canRequeueSafely: boolean;
      owner: 'ops' | 'engineering' | 'finance' | 'trust-and-safety';
      riskSignals: string[];
      recommendedAction: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
    };
    createdAt: string;
    updatedAt: string;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
  snapshot: NonNullable<HealthCheckResponse['infrastructure']['jobQueue']>;
};

export type AdminJobQueueRequeueResponse = {
  job: {
    id: string;
    kind: AdminJobQueueKind;
    status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'DEAD_LETTER';
    attempts: number;
    nextRunAt: string;
  };
};

export type DriverDocumentUploadLinksResponse = {
  links: Array<{
    storageKey: string;
    expiresAt: string;
    uploadUrl: string;
    method: 'PUT';
    headers: {
      'content-type': string;
    };
    constraints: {
      allowedMimeTypes: string[];
      allowedExtensions: string[];
      maxBytes: number;
    };
  }>;
};

export type DriverDocumentViewLinkResponse = {
  documentId: string;
  type:
    | 'IDENTITY_DOCUMENT'
    | 'DRIVER_LICENSE'
    | 'VEHICLE_REGISTRATION'
    | 'INSURANCE_PROOF'
    | 'SELFIE_VERIFICATION';
  expiresAt: string;
  signedUrl: string;
};

export type DriverDocumentObjectVerificationResponse = {
  document: {
    id: string;
    driverId: string;
    type:
      | 'IDENTITY_DOCUMENT'
      | 'DRIVER_LICENSE'
      | 'VEHICLE_REGISTRATION'
      | 'INSURANCE_PROOF'
      | 'SELFIE_VERIFICATION';
    objectVerification: {
      state: 'confirmed' | 'failed';
      provider: string;
      objectId: string | null;
      verifiedAt: string;
      sizeBytes: number | null;
      sha256: string | null;
      failureReason: string | null;
      actor: {
        id: string;
        role: string;
      };
    };
    safetyScan: {
      state: 'clear' | 'pending' | 'quarantined';
      engine: string | null;
      scannedAt: string | null;
      findings: string[];
      quarantineReason: string | null;
    };
  };
};

export type TripIncidentResponse = {
  incident: {
    tripId: string;
    ticketId: string;
    priority: number;
    incidentType: string;
    reportedByRole: string;
    status: string;
    voluntaryEvidence: {
      declared: boolean;
      type: 'AUDIO' | 'PHOTO' | 'VIDEO' | 'TEXT_NOTE' | null;
      retentionHours: number | null;
      storagePolicy: string | null;
    };
  };
};

export type TripSafetySosResponse = {
  sos: {
    tripId: string;
    ticketId: string;
    priority: number;
    incidentType: 'SOS_TRIGGERED';
    reportedByRole: string;
    status: string;
    localEmergencyNumber: string;
    locationCaptured: boolean;
  };
};

export type RideOptionsPreviewResponse = {
  route: {
    distanceKm: number;
    durationMinutes: number;
  };
  options: RideOption[];
};

export type RiderProfileResponse = {
  profile: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string | null;
    preferredTier: ApiServiceTier | null;
    emergencyPhone: string | null;
    trustedContact: {
      phoneNumber: string | null;
      shareMode: 'DISABLED' | 'MANUAL' | 'NIGHT' | 'ALL_TRIPS';
      status: 'MISSING' | 'READY';
      safetyNote: string;
    };
    savedPlaces: Array<{
      id: string;
      label: string;
      address: string;
      latitude?: number | null;
      longitude?: number | null;
    }>;
    stats: {
      totalRideRequests: number;
      totalTrips: number;
      completedTrips: number;
      savedPlaces: number;
    };
  };
};

export type SavedPlaceMutationResponse = {
  savedPlace: RiderProfileResponse['profile']['savedPlaces'][number];
};

export type TrustedContactMutationResponse = {
  trustedContact: {
    riderProfileId: string;
    phoneNumber: string | null;
    shareMode: 'DISABLED' | 'MANUAL' | 'NIGHT' | 'ALL_TRIPS';
    status: 'MISSING' | 'READY';
    safetyNote: string;
  };
};

export type SavedPlaceDeleteResponse = {
  deleted: boolean;
  savedPlaceId: string;
};

export type DriverProfileResponse = {
  profile: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string | null;
    status: string;
    verificationStatus: string;
    serviceRadiusKm: number | null;
    currentLatitude?: number | null;
    currentLongitude?: number | null;
    averageRating: number | null;
    completedTripsCount: number;
    fatigue: DriverFatigueStatus;
    onboarding: {
      verificationStatus: string;
      reviewStatus:
        | 'SUBMITTED'
        | 'UNDER_REVIEW'
        | 'APPROVED'
        | 'REJECTED'
        | 'CHANGES_REQUESTED';
      completedItems: number;
      totalItems: number;
      readinessPercent: number;
      serviceRadiusKm: number | null;
      city: string | null;
      submittedAt: string | null;
      latestReviewAt: string | null;
      latestDecisionReason: string | null;
      reviewActorName: string | null;
      notes: string;
      checklist: Array<{
        id: string;
        label: string;
        completed: boolean;
      }>;
      documents: Array<{
        type:
          | 'IDENTITY_DOCUMENT'
          | 'DRIVER_LICENSE'
          | 'VEHICLE_REGISTRATION'
          | 'INSURANCE_PROOF'
          | 'SELFIE_VERIFICATION';
        status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
        fileName: string | null;
        uploadedAt: string | null;
        expiresAt: string | null;
        reviewedAt: string | null;
        rejectionReason: string | null;
      }>;
      reviewTimeline: Array<{
        id: string;
        status:
          | 'SUBMITTED'
          | 'UNDER_REVIEW'
          | 'APPROVED'
          | 'REJECTED'
          | 'CHANGES_REQUESTED';
        actorName: string;
        decisionReason: string | null;
        createdAt: string;
      }>;
    };
    vehicles: Array<{
      id: string;
      plateNumber: string;
      make: string;
      model: string;
      color: string;
      type: 'MOTORCYCLE' | 'CAR';
      tier: ApiServiceTier;
      isActive: boolean;
    }>;
  };
};

export type DriverAvailabilityResponse = {
  availability: {
    driverId: string;
    status: 'ONLINE' | 'OFFLINE';
    fatigue: DriverFatigueStatus;
  };
};

export type DriverFatigueStatus = {
  state: 'clear' | 'warning' | 'blocked';
  completedTrips: number;
  drivingMinutes: number;
  windowHours: number;
  maxCompletedTrips: number;
  maxDrivingMinutes: number;
  restMinutes: number;
  restUntil: string | null;
  reason: string;
};

export type DriverPresenceResponse = {
  presence: {
    driverId: string;
    status: string;
    latitude: number | null;
    longitude: number | null;
  };
};

export type DriverOnboardingResponse = {
  onboarding: DriverProfileResponse['profile']['onboarding'];
};

export type DriverEarningsResponse = {
  summary: {
    currency: string;
    today: number;
    week: number;
    month: number;
    completedTrips: number;
    averagePayout: number;
  };
  recentTrips: Array<{
    id: string;
    route: string;
    payout: number;
    status: string;
    completedAt: string | null;
  }>;
};

export type MyTripsResponse = {
  role: ApiUserRole;
  stats: {
    activeTrips: number;
    completedTrips: number;
    cancelledTrips: number;
    totalAmount: number;
    currency: string;
  };
  pendingRequests: Array<{
    id: string;
    pickupAddress: string;
    destinationAddress: string;
    estimatedFare: number;
    status: string;
    createdAt: string;
  }>;
  recentTrips: Array<{
    id: string;
    pickupAddress: string;
    destinationAddress: string;
    status: string;
    amount: number;
    currency: string;
    counterpartyName: string | null;
    vehicleLabel: string | null;
    pickupCode?: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
};

export type TripLifecycleResponse = {
  trip: {
    id: string;
    rideRequestId: string;
    status: string;
    pickupAddress?: string;
    destinationAddress?: string;
    riderName?: string;
    vehicleLabel?: string;
    pickupCode?: string | null;
    actualFare: number;
    currency: string;
    createdAt?: string;
    startedAt?: string | null;
    completedAt?: string | null;
  };
};

export type DriverOfferDeclineResponse = {
  offer: {
    rideRequestId: string;
    status: 'DECLINED';
  };
};

export type TripDetailResponse = {
  trip: {
    id: string;
    rideRequestId: string;
    status: string;
    pickupAddress: string;
    destinationAddress: string;
    riderName: string;
    driverName: string;
    vehicleLabel: string;
    driverVerification: {
      verificationStatus: string;
      phoneVerified: boolean;
      averageRating: number | null;
      completedTripsCount: number;
      vehicle: {
        plateNumber: string;
        color: string;
        make: string;
        model: string;
      };
    };
    routeMonitoring: {
      state: 'unknown' | 'clear' | 'warning' | 'critical';
      alertCount: number;
      lastAlertType: 'LONG_STOP' | 'ROUTE_DEVIATION' | 'NO_PROGRESS' | null;
      lastAlertAt: string | null;
      lastPositionAt: string | null;
    };
    pickupCode?: string | null;
    actualFare: number;
    currency: string;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    timeline: Array<{
      id: string;
      eventType: string;
      label: string;
      createdAt: string;
    }>;
  };
};

export type TripShareLinkResponse = {
  share: {
    tripId: string;
    token: string;
    path: string;
    expiresAt: string;
    ttlMinutes: number;
  };
};

export type TripRoutePositionResponse = {
  routeMonitoring: {
    tripId: string;
    state: 'clear' | 'alert';
    checkedAt: string;
    alerts: Array<{
      alertType: 'LONG_STOP' | 'ROUTE_DEVIATION' | 'NO_PROGRESS';
      severity: 'warning' | 'critical';
      priority: 2 | 3;
      message: string;
      measuredValue: number;
      threshold: number;
    }>;
    ticketIds: string[];
  };
};

export type SharedTripResponse = {
  sharedTrip: {
    tripId: string;
    status: string;
    pickupAddress: string;
    destinationAddress: string;
    riderName: string;
    driverName: string;
    vehicleLabel: string;
    lastEvent: {
      label: string;
      createdAt: string;
    } | null;
    expiresAt: string | null;
    safetyNote: string;
  };
};

export type CreateRideRequestPayload = {
  pickupAddress: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  destinationAddress: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  requestedVehicleType: 'MOTORCYCLE' | 'CAR';
  requestedServiceTier?: 'MOTO_STANDARD' | 'MOTO_PLUS' | 'CAR_STANDARD' | 'CAR_COMFORT' | 'CAR_XL';
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  paymentMethod?: 'MOBILE_MONEY' | 'CASH' | 'WALLET';
  pickupAreaType?: 'URBAN_CORE' | 'URBAN_EDGE' | 'SEMI_URBAN';
  city?: 'OUAGADOUGOU' | 'BOBO_DIOULASSO' | 'KOUDOUGOU' | 'BANFORA' | 'OUAHIGOUYA';
  districtProfile?:
    | 'CBD'
    | 'UNIVERSITY'
    | 'GOVERNMENT'
    | 'AIRPORT'
    | 'RESIDENTIAL_STANDARD'
    | 'RESIDENTIAL_PERIPHERAL'
    | 'MARKET_DENSE'
    | 'INDUSTRIAL'
    | 'INTERCITY_GATE';
  notes?: string;
};

export type RideRequestResponse = {
  id: string;
  status: string;
  pickupAddress: string;
  destinationAddress: string;
  estimatedFare?: number | string | null;
  estimatedDistanceKm?: number | string | null;
  estimatedDurationMinutes?: number | null;
  routeMetricsSource?: 'SERVER_COORDINATES' | 'CLIENT_ESTIMATE';
  requestedVehicleType: 'MOTORCYCLE' | 'CAR';
  requestedServiceTier?: string | null;
  city?: string | null;
  districtProfile?: string | null;
  createdAt?: string;
  pricingContextSummary?: string | null;
  bookingReadinessSummary?: string | null;
  pricingReason?: string | null;
};

export type RideRequestLifecycleResponse = {
  rideRequest: {
    id: string;
    status: string;
    pickupAddress: string;
    destinationAddress: string;
    updatedAt: string;
  };
};

export type VoiceLocationIntentResponse = {
  locale: string;
  transcript: string;
  normalizedTranscript: string;
  interpretation: string;
  intentType: 'pickup' | 'destination' | 'unknown';
  confidence: number;
  needsClarification: boolean;
  suggestions: Array<{
    id: string;
    name: string;
    address: string;
    district: string;
    latitude: number;
    longitude: number;
    confidence: number;
  }>;
};

export type CheckoutIntentPayload = {
  rideRequestId: string;
  channel: 'MOBILE_MONEY' | 'CARD' | 'WALLET';
  amount?: number;
  mobileMoneyNetwork?: 'ORANGE_MONEY' | 'MOBICASH' | 'MOOV' | 'WAVE' | 'FREE_MONEY';
  customerPhoneNumber?: string;
  redirectUrl?: string;
};

export type SignOutResponse = {
  message: string;
  revokedSessionId: string;
};

export type CheckoutIntentResponse = {
  provider: 'FLUTTERWAVE' | 'CINETPAY';
  transactionRef: string;
  checkoutMode: 'REDIRECT_OR_INLINE' | 'REDIRECT_OR_WIDGET';
  amount: number;
  currency: string;
  channel: 'MOBILE_MONEY' | 'CARD' | 'WALLET';
  supportedMobileMoneyNetworks: Array<
    'ORANGE_MONEY' | 'MOBICASH' | 'MOOV' | 'WAVE' | 'FREE_MONEY'
  >;
  providerMetadata: {
    publicKeyPresent?: boolean;
    callbackUrl?: string | null;
    siteIdPresent?: boolean;
    notifyUrl?: string | null;
  };
  trustNotes: {
    providerAbstractionEnabled: boolean;
    webhookVerificationRequired: boolean;
    settlementModel: 'aggregator';
  };
};

export type PricingEstimateQuery = {
  vehicleType: ApiVehicleType;
  serviceTier?: ApiServiceTier;
  distanceKm: number;
  durationMinutes: number;
  paymentMethod?: ApiPaymentMethod;
  zone?: ApiMarketZone;
  city?: ApiPricingCity;
  districtProfile?: ApiDistrictProfile;
  demandLevel?: ApiDemandLevel;
  trafficLevel?: 'FREE_FLOW' | 'MODERATE' | 'HEAVY' | 'GRIDLOCK';
  weatherCondition?: 'CLEAR' | 'HEAT' | 'WIND' | 'DUST' | 'RAIN' | 'STORM';
  roadCondition?: 'OPEN' | 'SLOW' | 'CONGESTED' | 'BLOCKED';
  isPeakHour?: boolean;
  activeDriverCount?: number;
  openRequestCount?: number;
  driverOnboardingDays?: number;
};

export function toApiVehicleType(category: VehicleCategory): CreateRideRequestPayload['requestedVehicleType'] {
  return category === 'motorcycle' ? 'MOTORCYCLE' : 'CAR';
}

export function toApiServiceTier(
  tier: ServiceTier,
): NonNullable<CreateRideRequestPayload['requestedServiceTier']> {
  return tier.replace(/-/g, '_').toUpperCase() as NonNullable<
    CreateRideRequestPayload['requestedServiceTier']
  >;
}

export function toApiPaymentMethod(
  method: PaymentMethod,
): NonNullable<CreateRideRequestPayload['paymentMethod']> {
  return method.replace(/-/g, '_').toUpperCase() as NonNullable<
    CreateRideRequestPayload['paymentMethod']
  >;
}

export async function signInWithApi(
  client: MobilisApiClient,
  payload: SignInPayload,
) {
  return client.request<AuthSessionResponse>(apiRoutes.auth.signIn, {
    method: 'POST',
    body: payload,
  });
}

export async function signUpWithApi(
  client: MobilisApiClient,
  payload: SignUpApiPayload,
) {
  return client.request<AuthSessionResponse>(apiRoutes.auth.signUp, {
    method: 'POST',
    body: payload,
  });
}

export async function fetchCurrentUser(client: MobilisApiClient) {
  return client.request<CurrentUserResponse>(apiRoutes.auth.me);
}

export async function authenticateAndFetchCurrentUser(
  client: MobilisApiClient,
  payload: SignInPayload,
): Promise<AuthenticatedApiContext> {
  const session = await signInWithApi(client, payload);
  const authClient = client.withAuthToken(session.sessionToken);
  const me = await fetchCurrentUser(authClient);

  return {
    session,
    authClient,
    me,
  };
}

export async function restoreOrAuthenticateSession(
  client: MobilisApiClient,
  storage: SessionStorageAdapter,
  storageKey: string,
  credentials: SignInPayload,
): Promise<AuthenticatedApiContext> {
  const existingToken = await storage.getItem(storageKey);

  if (existingToken) {
    try {
      const authClient = client.withAuthToken(existingToken);
      const me = await fetchCurrentUser(authClient);

      return {
        session: {
          message: 'Restored existing session.',
          sessionToken: existingToken,
          user: {
            id: me.user.id,
            email: me.user.email,
            fullName: me.user.fullName,
            role: me.user.role,
          },
          session: {
            id: me.session.id,
            expiresAt: me.session.expiresAt,
          },
        },
        authClient,
        me,
      };
    } catch {
      await storage.removeItem(storageKey);
    }
  }

  const context = await authenticateAndFetchCurrentUser(client, credentials);
  await storage.setItem(storageKey, context.session.sessionToken);

  return context;
}

export async function restorePersistedSession(
  client: MobilisApiClient,
  storage: SessionStorageAdapter,
  storageKey: string,
): Promise<AuthenticatedApiContext> {
  const existingToken = await storage.getItem(storageKey);

  if (!existingToken) {
    throw new Error('Aucune session enregistree sur cet appareil.');
  }

  try {
    const authClient = client.withAuthToken(existingToken);
    const me = await fetchCurrentUser(authClient);

    return {
      session: {
        message: 'Restored existing session.',
        sessionToken: existingToken,
        user: {
          id: me.user.id,
          email: me.user.email,
          fullName: me.user.fullName,
          role: me.user.role,
        },
        session: {
          id: me.session.id,
          expiresAt: me.session.expiresAt,
        },
      },
      authClient,
      me,
    };
  } catch (error) {
    await storage.removeItem(storageKey);
    throw error;
  }
}

export async function persistSessionToken(
  storage: SessionStorageAdapter,
  storageKey: string,
  sessionToken: string,
) {
  await storage.setItem(storageKey, sessionToken);
}

export async function clearPersistedSession(storage: SessionStorageAdapter, storageKey: string) {
  await storage.removeItem(storageKey);
}

export async function signOutWithApi(
  client: MobilisApiClient,
  payload?: {
    sessionId?: string;
  },
) {
  return client.request<SignOutResponse>(apiRoutes.auth.signOut, {
    method: 'POST',
    body: payload,
  });
}

export async function submitMobileErrorReportsWithApi(
  client: MobilisApiClient,
  payload: SubmitMobileErrorReportsPayload,
) {
  return client.request<SubmitMobileErrorReportsResponse>(
    apiRoutes.mobile.errorReports,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function fetchAdminPreview(client: MobilisApiClient) {
  return client.request<AdminPreviewResponse>(apiRoutes.admin.preview);
}

export async function fetchAdminOverview(client: MobilisApiClient) {
  return client.request<AdminOverviewResponse>(apiRoutes.admin.overview);
}

export async function fetchAdminLiveOps(client: MobilisApiClient) {
  return client.request<AdminLiveOpsResponse>(apiRoutes.admin.liveOps);
}

export async function fetchAdminJobQueue(
  client: MobilisApiClient,
  query?: {
    page?: number;
    pageSize?: number;
    kind?: AdminJobQueueKind;
    status?: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'DEAD_LETTER';
  },
) {
  return client.request<AdminJobQueueResponse>(apiRoutes.admin.jobQueue, {
    query,
  });
}

export async function requeueAdminJobQueueEntry(
  client: MobilisApiClient,
  jobId: string,
) {
  return client.request<AdminJobQueueRequeueResponse>(
    `${apiRoutes.admin.jobQueue}/${jobId}/requeue`,
    {
      method: 'POST',
    },
  );
}

export async function fetchAdminLaunchReadiness(client: MobilisApiClient) {
  return client.request<AdminLaunchReadinessResponse>(
    apiRoutes.admin.launchReadiness,
  );
}

export async function acknowledgeAdminLaunchReadinessAction(
  client: MobilisApiClient,
  checkId: string,
  payload: {
    owner: 'ops' | 'engineering' | 'support' | 'finance';
    notes: string;
    idempotencyKey?: string;
  },
) {
  return client.request<AdminLaunchReadinessActionAcknowledgementResponse>(
    `${apiRoutes.admin.launchReadiness}/actions/${checkId}/acknowledge`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function fetchAdminSupportTickets(client: MobilisApiClient) {
  return client.request<SupportTicketQueueResponse>(apiRoutes.admin.supportTickets);
}

export async function fetchAdminDriverWallets(client: MobilisApiClient) {
  return client.request<AdminDriverWalletsResponse>(
    apiRoutes.admin.driverWallets,
  );
}

export async function prepareAdminDriverWalletPayout(
  client: MobilisApiClient,
  walletId: string,
  payload: { notes?: string } = {},
) {
  return client.request<AdminDriverPayoutResponse>(
    `${apiRoutes.admin.driverWallets}/${walletId}/payouts/prepare`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function recordAdminDriverWalletRecoveryAdjustment(
  client: MobilisApiClient,
  walletId: string,
  payload: { amount: number; notes: string; idempotencyKey: string },
) {
  return client.request<AdminDriverWalletRecoveryAdjustmentResponse>(
    `${apiRoutes.admin.driverWallets}/${walletId}/recovery-adjustments`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function markAdminDriverPayoutPaid(
  client: MobilisApiClient,
  payoutId: string,
  payload: { notes?: string } = {},
) {
  return client.request<AdminDriverPayoutResponse>(
    `${apiRoutes.admin.driverPayouts}/${payoutId}/paid`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export function buildAdminDriverPayoutSettlementCsvUrl(
  status: 'PREPARED' | 'PAID' | 'CANCELLED' = 'PREPARED',
) {
  return `${apiRoutes.admin.driverPayoutSettlementCsv}?status=${status}`;
}

export function buildAdminDriverPayoutSettlementPdfUrl(
  status: 'PREPARED' | 'PAID' | 'CANCELLED' = 'PREPARED',
) {
  return `${apiRoutes.admin.driverPayoutSettlementPdf}?status=${status}`;
}

export async function updateAdminSupportTicket(
  client: MobilisApiClient,
  ticketId: string,
  payload: {
    status?: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';
    priority?: number;
  },
) {
  return client.request<SupportTicketUpdateResponse>(`${apiRoutes.admin.supportTickets}/${ticketId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export async function fetchAdminDriverOnboardingQueue(
  client: MobilisApiClient,
  query?: {
    page?: number;
    pageSize?: number;
  },
) {
  return client.request<DriverOnboardingQueueResponse>(
    apiRoutes.admin.driverOnboardingQueue,
    {
      query,
    },
  );
}

export async function fetchAdminDriverOnboardingExportCsv(
  client: MobilisApiClient,
  query?: {
    guidanceFilter?: 'all' | 'approve' | 'review' | 'resubmit';
    searchQuery?: string;
    limit?: number;
  },
) {
  return client.requestText(apiRoutes.admin.driverOnboardingExportCsv, {
    query,
  });
}

export async function fetchAdminDriverOnboardingExportHistory(
  client: MobilisApiClient,
  query?: {
    page?: number;
    pageSize?: number;
  },
) {
  return client.request<DriverOnboardingExportHistoryResponse>(
    apiRoutes.admin.driverOnboardingExportHistory,
    {
      query,
    },
  );
}

export async function fetchAdminFeatureFlags(client: MobilisApiClient) {
  return client.request<AdminFeatureFlagsResponse>(apiRoutes.admin.featureFlags);
}

export async function fetchAdminDispatchSettings(client: MobilisApiClient) {
  return client.request<AdminDispatchSettingsResponse>(
    apiRoutes.admin.dispatchSettings,
  );
}

export async function fetchAdminPricingCalibration(client: MobilisApiClient) {
  return client.request<AdminPricingCalibrationResponse>(
    apiRoutes.admin.pricingCalibration,
  );
}

export async function fetchAdminPaymentWebhookEvents(
  client: MobilisApiClient,
  query?: {
    page?: number;
    pageSize?: number;
    provider?: 'FLUTTERWAVE' | 'CINETPAY';
    action?: string;
    kind?: 'payment' | 'refund' | 'ignored';
    transactionRef?: string;
    providerReference?: string;
  },
) {
  return client.request<AdminPaymentWebhookEventsResponse>(
    apiRoutes.admin.paymentWebhookEvents,
    {
      query,
    },
  );
}

export async function fetchAdminPaymentWebhookEventDetail(
  client: MobilisApiClient,
  eventId: string,
) {
  return client.request<AdminPaymentWebhookEventDetailResponse>(
    `${apiRoutes.admin.paymentWebhookEvents}/${eventId}`,
  );
}

export async function startAdminPaymentWebhookInvestigation(
  client: MobilisApiClient,
  eventId: string,
) {
  return client.request<AdminPaymentWebhookInvestigationResponse>(
    `${apiRoutes.admin.paymentWebhookEvents}/${eventId}/investigation`,
    {
      method: 'POST',
    },
  );
}

export async function replayAdminPaymentWebhookEvent(
  client: MobilisApiClient,
  eventId: string,
) {
  return client.request<AdminPaymentWebhookReplayResponse>(
    `${apiRoutes.admin.paymentWebhookEvents}/${eventId}/replay`,
    {
      method: 'POST',
    },
  );
}

export async function verifyAdminPaymentAttemptWithProvider(
  client: MobilisApiClient,
  paymentAttemptId: string,
) {
  return client.request<AdminPaymentAttemptProviderVerificationResponse>(
    `${apiRoutes.admin.paymentAttempts}/${paymentAttemptId}/verify-provider`,
    {
      method: 'POST',
    },
  );
}

export async function refundAdminPaymentAttempt(
  client: MobilisApiClient,
  paymentAttemptId: string,
  payload: { reason?: string } = {},
) {
  return client.request<AdminPaymentAttemptRefundResponse>(
    `${apiRoutes.admin.paymentAttempts}/${paymentAttemptId}/refund`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function updateAdminDispatchSettings(
  client: MobilisApiClient,
  payload: {
    lookbackHours?: number;
    halfLifeHours?: number;
    declineCooldownMinutes?: number;
    historyLimit?: number;
    resetToDefaults?: boolean;
  },
) {
  return client.request<AdminDispatchSettingsResponse>(
    apiRoutes.admin.dispatchSettings,
    {
      method: 'PATCH',
      body: payload,
    },
  );
}

export async function fetchHealthCheck(client: MobilisApiClient) {
  return client.request<HealthCheckResponse>(apiRoutes.health);
}

export async function acknowledgeAdminHealthIncident(
  client: MobilisApiClient,
  incidentId: string,
) {
  return client.request<{
    incident: HealthCheckResponse['operations']['healthHistory'][number];
  }>(`${apiRoutes.admin.healthIncidents}/${incidentId}/acknowledge`, {
    method: 'PATCH',
  });
}

export async function muteAdminHealthIncident(
  client: MobilisApiClient,
  incidentId: string,
) {
  return client.request<{
    incident: HealthCheckResponse['operations']['healthHistory'][number];
  }>(`${apiRoutes.admin.healthIncidents}/${incidentId}/mute`, {
    method: 'PATCH',
  });
}

export async function updateAdminDriverOnboardingReview(
  client: MobilisApiClient,
  driverId: string,
  payload: {
    status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
    notesInternal?: string;
    decisionReason?: string;
    supportPriority?: number;
    documentDecisions?: Array<{
      documentId: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
      rejectionReason?: string;
      expiresAt?: string;
    }>;
  },
) {
  return client.request<DriverOnboardingReviewUpdateResponse>(
    `${apiRoutes.admin.driverOnboarding}/${driverId}/review`,
    {
      method: 'PATCH',
      body: payload,
    },
  );
}

export async function fetchAdminDriverDocumentViewLink(
  client: MobilisApiClient,
  driverId: string,
  documentId: string,
) {
  return client.request<DriverDocumentViewLinkResponse>(
    `${apiRoutes.admin.driverOnboarding}/${driverId}/documents/${documentId}/view-link`,
  );
}

export async function updateAdminDriverDocumentObjectVerification(
  client: MobilisApiClient,
  driverId: string,
  documentId: string,
  payload: {
    state: 'confirmed' | 'failed';
    provider: string;
    objectId?: string;
    sizeBytes?: number;
    sha256?: string;
    failureReason?: string;
  },
) {
  return client.request<DriverDocumentObjectVerificationResponse>(
    `${apiRoutes.admin.driverOnboarding}/${driverId}/documents/${documentId}/object-verification`,
    {
      method: 'PATCH',
      body: payload,
    },
  );
}

export async function verifyAdminDriverDocumentObjectWithProvider(
  client: MobilisApiClient,
  driverId: string,
  documentId: string,
) {
  return client.request<DriverDocumentObjectVerificationResponse>(
    `${apiRoutes.admin.driverOnboarding}/${driverId}/documents/${documentId}/object-verification/verify-provider`,
    {
      method: 'POST',
    },
  );
}

export async function fetchRiderProfile(client: MobilisApiClient) {
  return client.request<RiderProfileResponse>(apiRoutes.riders.me);
}

export async function createSavedPlaceWithApi(
  client: MobilisApiClient,
  payload: {
    label: string;
    address: string;
    latitude: number;
    longitude: number;
  },
) {
  return client.request<SavedPlaceMutationResponse>(apiRoutes.riders.savedPlaces, {
    method: 'POST',
    body: payload,
  });
}

export async function updateTrustedContactWithApi(
  client: MobilisApiClient,
  payload: {
    phoneNumber?: string;
    shareMode?: 'MANUAL' | 'NIGHT' | 'ALL_TRIPS';
    notes?: string;
  },
) {
  return client.request<TrustedContactMutationResponse>(
    apiRoutes.riders.trustedContact,
    {
      method: 'PATCH',
      body: payload,
    },
  );
}

export async function updateSavedPlaceWithApi(
  client: MobilisApiClient,
  savedPlaceId: string,
  payload: {
    label?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  },
) {
  return client.request<SavedPlaceMutationResponse>(
    `${apiRoutes.riders.savedPlaces}/${savedPlaceId}`,
    {
      method: 'PATCH',
      body: payload,
    },
  );
}

export async function deleteSavedPlaceWithApi(
  client: MobilisApiClient,
  savedPlaceId: string,
) {
  return client.request<SavedPlaceDeleteResponse>(
    `${apiRoutes.riders.savedPlaces}/${savedPlaceId}`,
    {
      method: 'DELETE',
    },
  );
}

export async function fetchDriverPreviewOffers(client: MobilisApiClient) {
  return client.request<DriverOffer[]>(apiRoutes.drivers.previewOffers);
}

export async function fetchDriverProfile(client: MobilisApiClient) {
  return client.request<DriverProfileResponse>(apiRoutes.drivers.me);
}

export async function fetchDriverOnboarding(client: MobilisApiClient) {
  return client.request<DriverOnboardingResponse>(apiRoutes.drivers.onboarding);
}

export async function upsertDriverOnboarding(
  client: MobilisApiClient,
  payload: {
    phoneNumber?: string;
    licenseNumber: string;
    city:
      | 'OUAGADOUGOU'
      | 'BOBO_DIOULASSO'
      | 'KOUDOUGOU'
      | 'BANFORA'
      | 'OUAHIGOUYA';
    serviceRadiusKm: number;
    documents: {
      identityDocumentProvided: boolean;
      driverLicenseProvided: boolean;
      vehicleRegistrationProvided: boolean;
      insuranceProofProvided: boolean;
      selfieMatchProvided: boolean;
    };
    documentArtifacts?: Array<{
      type:
        | 'IDENTITY_DOCUMENT'
        | 'DRIVER_LICENSE'
        | 'VEHICLE_REGISTRATION'
        | 'INSURANCE_PROOF'
        | 'SELFIE_VERIFICATION';
      fileName: string;
      storageKey: string;
      mimeType?: string;
      expiresAt?: string;
      sizeBytes?: number;
      sha256?: string;
      uploadSource?: string;
    }>;
    vehicles: Array<{
      plateNumber: string;
      make: string;
      model: string;
      color: string;
      year?: number;
      type: 'MOTORCYCLE' | 'CAR';
      tier:
        | 'MOTO_STANDARD'
        | 'MOTO_PLUS'
        | 'CAR_STANDARD'
        | 'CAR_COMFORT'
        | 'CAR_XL';
      seats?: number;
    }>;
  },
) {
  return client.request<DriverOnboardingResponse>(apiRoutes.drivers.onboarding, {
    method: 'PATCH',
    body: payload,
  });
}

export async function requestDriverDocumentUploadLinks(
  client: MobilisApiClient,
  payload: {
    documents: Array<{
      type:
        | 'IDENTITY_DOCUMENT'
        | 'DRIVER_LICENSE'
        | 'VEHICLE_REGISTRATION'
        | 'INSURANCE_PROOF'
        | 'SELFIE_VERIFICATION';
      fileName: string;
      mimeType?: string;
      expiresAt?: string;
    }>;
  },
) {
  return client.request<DriverDocumentUploadLinksResponse>(
    apiRoutes.drivers.onboardingDocumentUploadLinks,
    {
      method: 'PATCH',
      body: payload,
    },
  );
}

export async function fetchDriverEarnings(client: MobilisApiClient) {
  return client.request<DriverEarningsResponse>(apiRoutes.drivers.earnings);
}

export async function fetchDriverOffers(client: MobilisApiClient) {
  return client.request<DriverOffer[]>(apiRoutes.drivers.offers);
}

export async function declineDriverOfferWithApi(
  client: MobilisApiClient,
  rideRequestId: string,
) {
  return client.request<DriverOfferDeclineResponse>(
    `${apiRoutes.drivers.declineOffer}/${rideRequestId}/decline`,
    {
      method: 'POST',
    },
  );
}

export async function updateDriverAvailabilityWithApi(
  client: MobilisApiClient,
  status: 'ONLINE' | 'OFFLINE',
) {
  return client.request<DriverAvailabilityResponse>(apiRoutes.drivers.availability, {
    method: 'PATCH',
    body: {
      status,
    },
  });
}

export async function updateDriverPresenceWithApi(
  client: MobilisApiClient,
  payload: {
    latitude: number;
    longitude: number;
  },
) {
  return client.request<DriverPresenceResponse>(apiRoutes.drivers.presence, {
    method: 'PATCH',
    body: payload,
  });
}

export async function fetchMyTrips(client: MobilisApiClient) {
  return client.request<MyTripsResponse>(apiRoutes.trips.mine);
}

export async function fetchTripDetail(client: MobilisApiClient, tripId: string) {
  return client.request<TripDetailResponse>(`${apiRoutes.trips.root}/${tripId}`);
}

export async function createTripShareLinkWithApi(
  client: MobilisApiClient,
  tripId: string,
) {
  return client.request<TripShareLinkResponse>(
    `${apiRoutes.trips.shareLink}/${tripId}/share-link`,
    {
      method: 'POST',
    },
  );
}

export async function recordTripRoutePositionWithApi(
  client: MobilisApiClient,
  tripId: string,
  payload: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    speedKph?: number;
    distanceToDestinationKm?: number;
  },
) {
  return client.request<TripRoutePositionResponse>(
    `${apiRoutes.trips.root}/${tripId}/route-position`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function fetchSharedTripWithApi(
  client: MobilisApiClient,
  shareToken: string,
) {
  return client.request<SharedTripResponse>(
    `${apiRoutes.trips.shared}/${shareToken}`,
  );
}

export async function acceptRideRequestWithApi(
  client: MobilisApiClient,
  rideRequestId: string,
) {
  return client.request<TripLifecycleResponse>(
    `${apiRoutes.trips.acceptRideRequest}/${rideRequestId}`,
    {
      method: 'POST',
    },
  );
}

export async function updateTripStatusWithApi(
  client: MobilisApiClient,
  tripId: string,
  status: 'DRIVER_ARRIVING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
) {
  return client.request<TripLifecycleResponse>(`${apiRoutes.trips.root ?? '/trips'}/${tripId}/status`, {
    method: 'PATCH',
    body: {
      status,
    },
  });
}

export async function verifyPickupCodeWithApi(
  client: MobilisApiClient,
  tripId: string,
  pickupCode: string,
) {
  return client.request<TripLifecycleResponse>(`${apiRoutes.trips.verifyPickupCode}/${tripId}/verify-pickup-code`, {
    method: 'POST',
    body: {
      pickupCode,
    },
  });
}

export async function reportTripIncidentWithApi(
  client: MobilisApiClient,
  tripId: string,
  payload: {
    incidentType: string;
    details?: string;
    priority?: number;
    evidenceConsent?: boolean;
    evidenceType?: 'AUDIO' | 'PHOTO' | 'VIDEO' | 'TEXT_NOTE';
    evidenceRetentionHours?: number;
  },
) {
  return client.request<TripIncidentResponse>(`${apiRoutes.trips.reportIncident}/${tripId}/report-incident`, {
    method: 'POST',
    body: payload,
  });
}

export async function triggerTripSafetySosWithApi(
  client: MobilisApiClient,
  tripId: string,
  payload: {
    details?: string;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
  } = {},
) {
  return client.request<TripSafetySosResponse>(
    `${apiRoutes.trips.safetySos}/${tripId}/sos`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function fetchRideOptionsPreview(
  client: MobilisApiClient,
  query: PricingEstimateQuery,
) {
  return client.request<RideOptionsPreviewResponse>(apiRoutes.pricing.rideOptions, {
    query,
  });
}

export async function fetchPricingEstimate(
  client: MobilisApiClient,
  query: PricingEstimateQuery,
) {
  return client.request<PricingEstimate>(apiRoutes.pricing.estimate, {
    query,
  });
}

export async function createRideRequestWithApi(
  client: MobilisApiClient,
  payload: CreateRideRequestPayload,
  options: { idempotencyKey?: string } = {},
) {
  return client.request<RideRequestResponse>(apiRoutes.rideRequests.root, {
    method: 'POST',
    body: payload,
    headers: options.idempotencyKey
      ? { 'Idempotency-Key': options.idempotencyKey }
      : undefined,
  });
}

export async function cancelRideRequestWithApi(
  client: MobilisApiClient,
  rideRequestId: string,
) {
  return client.request<RideRequestLifecycleResponse>(
    `${apiRoutes.rideRequests.root}/${rideRequestId}`,
    {
      method: 'DELETE',
    },
  );
}

export async function createCheckoutIntentWithApi(
  client: MobilisApiClient,
  payload: CheckoutIntentPayload,
  options: { idempotencyKey?: string } = {},
) {
  return client.request<CheckoutIntentResponse>(apiRoutes.payments.checkoutIntents, {
    method: 'POST',
    body: payload,
    headers: options.idempotencyKey
      ? { 'Idempotency-Key': options.idempotencyKey }
      : undefined,
  });
}

export async function resolveVoiceLocationIntentWithApi(
  client: MobilisApiClient,
  payload: { transcript: string },
) {
  return client.request<VoiceLocationIntentResponse>(apiRoutes.voice.locationIntent, {
    method: 'POST',
    body: payload,
  });
}

function resolveApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const message = record.message;

  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  if (Array.isArray(message)) {
    const firstMessage = message.find(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    );

    if (firstMessage) {
      return firstMessage.trim();
    }
  }

  return null;
}
