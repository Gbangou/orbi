import type { SupportedLanguage } from './index';

export type OrbiVisibleErrorAction =
  | 'retry'
  | 'reconnect'
  | 'edit'
  | 'contact-support'
  | 'wait'
  | 'none';

export type OrbiVisibleErrorSeverity = 'info' | 'warning' | 'critical';

export type OrbiVisibleErrorInput = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
  surface?: string | null;
  retryPolicy?: string | null;
  fallbackMessage?: string | null;
};

export type OrbiVisibleError = {
  message: string;
  action: OrbiVisibleErrorAction;
  actionLabel: string;
  logCode: string;
  severity: OrbiVisibleErrorSeverity;
};

type ErrorCopy = Omit<OrbiVisibleError, 'logCode'>;

const developerFacingPattern =
  /\b(api|backend|server|serveur|stack|exception|token|json|sql|prisma|debug|trace|enum|undefined|null|uuid|webhook|socket|payload|http\s?\d{3}|500|401|403)\b/i;

const localeFallbacks: Record<SupportedLanguage, ErrorCopy> = {
  fr: {
    message: "Une action n'a pas abouti. Reessayez ou contactez le support si cela continue.",
    action: 'retry',
    actionLabel: 'Reessayer',
    severity: 'warning',
  },
  en: {
    message: 'Something did not finish. Try again or contact support if it continues.',
    action: 'retry',
    actionLabel: 'Try again',
    severity: 'warning',
  },
  moo: {
    message: "Une action n'a pas abouti. Reessayez ou contactez le support si cela continue.",
    action: 'retry',
    actionLabel: 'Reessayer',
    severity: 'warning',
  },
};

const actionLabels: Record<SupportedLanguage, Record<OrbiVisibleErrorAction, string>> = {
  fr: {
    retry: 'Reessayer',
    reconnect: 'Se reconnecter',
    edit: 'Modifier',
    'contact-support': 'Contacter le support',
    wait: 'Patienter',
    none: 'Fermer',
  },
  en: {
    retry: 'Try again',
    reconnect: 'Sign in again',
    edit: 'Edit',
    'contact-support': 'Contact support',
    wait: 'Wait',
    none: 'Close',
  },
  moo: {
    retry: 'Reessayer',
    reconnect: 'Se reconnecter',
    edit: 'Modifier',
    'contact-support': 'Contacter le support',
    wait: 'Patienter',
    none: 'Fermer',
  },
};

const errorCopies: Record<SupportedLanguage, Record<string, ErrorCopy>> = {
  fr: {
    timeout: {
      message: 'Connexion lente. Reessayez dans un instant.',
      action: 'retry',
      actionLabel: 'Reessayer',
      severity: 'warning',
    },
    unauthorized: {
      message: 'Session expiree. Reconnectez-vous pour continuer.',
      action: 'reconnect',
      actionLabel: 'Se reconnecter',
      severity: 'critical',
    },
    paymentFailed: {
      message: 'Paiement non confirme. Verifiez votre telephone ou reessayez.',
      action: 'retry',
      actionLabel: 'Reessayer',
      severity: 'critical',
    },
    driverUnavailable: {
      message: "Aucun chauffeur disponible pour le moment. Essayez une autre option ou reessayez.",
      action: 'edit',
      actionLabel: 'Modifier',
      severity: 'warning',
    },
    locationDenied: {
      message: "Localisation necessaire. Autorisez-la ou saisissez l'adresse manuellement.",
      action: 'edit',
      actionLabel: 'Modifier',
      severity: 'warning',
    },
    validation: {
      message: 'Certaines informations doivent etre corrigees.',
      action: 'edit',
      actionLabel: 'Modifier',
      severity: 'info',
    },
    support: {
      message: 'Le support doit verifier cette situation.',
      action: 'contact-support',
      actionLabel: 'Contacter le support',
      severity: 'critical',
    },
    wait: {
      message: 'Verification en cours. Patientez quelques instants.',
      action: 'wait',
      actionLabel: 'Patienter',
      severity: 'info',
    },
  },
  en: {
    timeout: {
      message: 'Connection is slow. Try again in a moment.',
      action: 'retry',
      actionLabel: 'Try again',
      severity: 'warning',
    },
    unauthorized: {
      message: 'Your session has expired. Sign in again to continue.',
      action: 'reconnect',
      actionLabel: 'Sign in again',
      severity: 'critical',
    },
    paymentFailed: {
      message: 'Payment was not confirmed. Check your phone or try again.',
      action: 'retry',
      actionLabel: 'Try again',
      severity: 'critical',
    },
    driverUnavailable: {
      message: 'No driver is available right now. Try another option or try again.',
      action: 'edit',
      actionLabel: 'Edit',
      severity: 'warning',
    },
    locationDenied: {
      message: 'Location is needed. Allow it or enter the address manually.',
      action: 'edit',
      actionLabel: 'Edit',
      severity: 'warning',
    },
    validation: {
      message: 'Some information needs to be corrected.',
      action: 'edit',
      actionLabel: 'Edit',
      severity: 'info',
    },
    support: {
      message: 'Support needs to check this situation.',
      action: 'contact-support',
      actionLabel: 'Contact support',
      severity: 'critical',
    },
    wait: {
      message: 'Verification is in progress. Please wait a moment.',
      action: 'wait',
      actionLabel: 'Wait',
      severity: 'info',
    },
  },
  moo: {},
};

errorCopies.moo = errorCopies.fr;

export function translateOrbiVisibleError(
  input: OrbiVisibleErrorInput | unknown,
  locale: SupportedLanguage = 'fr',
): OrbiVisibleError {
  const normalized = normalizeVisibleErrorInput(input);
  const key = resolveErrorCopyKey(normalized);
  const copy = errorCopies[locale][key] ?? localeFallbacks[locale];

  return {
    ...copy,
    message: sanitizeVisibleContent(
      normalized.fallbackMessage && !isDeveloperFacingContent(normalized.fallbackMessage)
        ? normalized.fallbackMessage
        : copy.message,
      copy.message,
    ),
    actionLabel: copy.actionLabel || actionLabels[locale][copy.action],
    logCode: normalized.code || key,
  };
}

export function sanitizeVisibleContent(message: string, fallback: string) {
  const trimmed = message.trim();

  if (!trimmed || isDeveloperFacingContent(trimmed)) {
    return fallback;
  }

  return trimmed.replace(/\s+/g, ' ').slice(0, 180);
}

export function isDeveloperFacingContent(message: string) {
  return developerFacingPattern.test(message);
}

export function formatOrbiDate(
  value: Date | string | number,
  locale: SupportedLanguage = 'fr',
) {
  return getDate(value).toLocaleDateString(toIntlLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatOrbiTime(
  value: Date | string | number,
  locale: SupportedLanguage = 'fr',
) {
  return getDate(value).toLocaleTimeString(toIntlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatOrbiDateTime(
  value: Date | string | number,
  locale: SupportedLanguage = 'fr',
) {
  return `${formatOrbiDate(value, locale)} a ${formatOrbiTime(value, locale)}`;
}

export function formatOrbiFcfa(value: number, locale: SupportedLanguage = 'fr') {
  const amount = Number.isFinite(value) ? Math.round(value) : 0;

  return `${new Intl.NumberFormat(toIntlLocale(locale), {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount)} FCFA`;
}

export function formatOrbiPlural(
  count: number,
  labels: { one: string; other: string },
) {
  return `${count} ${count === 1 ? labels.one : labels.other}`;
}

const statusLabels: Record<SupportedLanguage, Record<string, string>> = {
  fr: {
    ACTIVE: 'Actif',
    APPROVED: 'Valide',
    ARRIVED: 'Arrive',
    BUSY: 'En mission',
    CANCELLED: 'Annule',
    CASH: 'Especes',
    COMPLETED: 'Termine',
    DRIVER_ARRIVING: 'Chauffeur en route',
    FAILED: 'Non confirme',
    IN_PROGRESS: 'En cours',
    MATCHED: 'Chauffeur trouve',
    MOBILE_MONEY: 'Mobile money',
    OFFLINE: 'Hors ligne',
    ONLINE: 'Disponible',
    PAID: 'Paye',
    PENDING: 'En attente',
    REJECTED: 'Refuse',
    REQUESTED: 'Recherche en cours',
    SUSPENDED: 'Suspendu',
    WALLET: 'Portefeuille',
  },
  en: {
    ACTIVE: 'Active',
    APPROVED: 'Approved',
    ARRIVED: 'Arrived',
    BUSY: 'On trip',
    CANCELLED: 'Cancelled',
    CASH: 'Cash',
    COMPLETED: 'Completed',
    DRIVER_ARRIVING: 'Driver on the way',
    FAILED: 'Not confirmed',
    IN_PROGRESS: 'In progress',
    MATCHED: 'Driver found',
    MOBILE_MONEY: 'Mobile money',
    OFFLINE: 'Offline',
    ONLINE: 'Available',
    PAID: 'Paid',
    PENDING: 'Pending',
    REJECTED: 'Rejected',
    REQUESTED: 'Searching',
    SUSPENDED: 'Suspended',
    WALLET: 'Wallet',
  },
  moo: {},
};

statusLabels.moo = statusLabels.fr;

export function formatOrbiStatusLabel(
  status: string | null | undefined,
  locale: SupportedLanguage = 'fr',
) {
  if (!status) {
    return locale === 'en' ? 'Unknown' : 'Statut indisponible';
  }

  const normalized = status.trim().toUpperCase().replace(/[-\s]+/g, '_');
  return statusLabels[locale][normalized] ?? humanizeTechnicalLabel(status);
}

function normalizeVisibleErrorInput(input: OrbiVisibleErrorInput | unknown): OrbiVisibleErrorInput {
  if (isVisibleErrorInput(input)) {
    return input;
  }

  if (input instanceof Error) {
    return {
      code: input.name,
      message: input.message,
    };
  }

  if (typeof input === 'string') {
    return { message: input };
  }

  return {};
}

function resolveErrorCopyKey(input: OrbiVisibleErrorInput) {
  const haystack = `${input.code ?? ''} ${input.message ?? ''} ${input.surface ?? ''} ${input.retryPolicy ?? ''}`.toLowerCase();

  if (
    input.status === 401 ||
    input.status === 403 ||
    haystack.includes('unauthorized') ||
    haystack.includes('forbidden') ||
    haystack.includes('auth') ||
    haystack.includes('session') ||
    haystack.includes('token')
  ) {
    return 'unauthorized';
  }

  if (
    haystack.includes('timeout') ||
    haystack.includes('abort') ||
    haystack.includes('network') ||
    haystack.includes('offline') ||
    haystack.includes('connexion')
  ) {
    return 'timeout';
  }

  if (
    haystack.includes('payment failed') ||
    haystack.includes('payment') ||
    haystack.includes('paiement') ||
    haystack.includes('provider') ||
    haystack.includes('refund')
  ) {
    return 'paymentFailed';
  }

  if (
    haystack.includes('driver unavailable') ||
    haystack.includes('no driver') ||
    haystack.includes('aucun chauffeur') ||
    haystack.includes('dispatch') ||
    haystack.includes('booking')
  ) {
    return 'driverUnavailable';
  }

  if (
    haystack.includes('location denied') ||
    haystack.includes('permission') ||
    haystack.includes('geolocation') ||
    haystack.includes('localisation')
  ) {
    return 'locationDenied';
  }

  if (haystack.includes('validation') || input.status === 400) {
    return 'validation';
  }

  if (haystack.includes('safety') || haystack.includes('sos') || haystack.includes('incident')) {
    return 'support';
  }

  if (haystack.includes('reconcile') || haystack.includes('verification')) {
    return 'wait';
  }

  return 'fallback';
}

function isVisibleErrorInput(value: unknown): value is OrbiVisibleErrorInput {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDate(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date(0);
  }

  return date;
}

function toIntlLocale(locale: SupportedLanguage) {
  if (locale === 'en') {
    return 'en-BF';
  }

  return 'fr-BF';
}

function humanizeTechnicalLabel(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
