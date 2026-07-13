// ── Mobile client error reporting & classification ────────────────────────────

import {
  isOrbiApiError,
  extractApiErrorMessage,
  isLikelyOrbiNetworkError,
  normalizeOrbiErrorMessage,
} from "./client";

export type OrbiClientErrorSurface =
  | "auth"
  | "booking"
  | "payments"
  | "active-trip"
  | "safety"
  | "profile"
  | "driver-availability"
  | "network"
  | "unknown";

export type OrbiClientErrorClassification = {
  code:
    | "MOB-AUTH-SESSION"
    | "MOB-BOOKING-DISPATCH"
    | "MOB-PAYMENT-PROVIDER"
    | "MOB-REALTIME-DEGRADED"
    | "MOB-SAFETY-INCIDENT"
    | "MOB-NETWORK-OFFLINE"
    | "MOB-VALIDATION-INPUT"
    | "MOB-GENERIC-API";
  surface: OrbiClientErrorSurface;
  severity: "low" | "medium" | "high" | "critical";
  owner: "engineering" | "ops" | "support" | "finance";
  retryPolicy:
    | "silent-refresh-once-then-relogin"
    | "idempotent-retry-with-visible-status"
    | "server-reconcile-before-client-retry"
    | "fallback-polling-with-last-known-state"
    | "store-local-and-escalate-to-support"
    | "retry-when-network-recovers"
    | "fix-input-before-retry"
    | "manual-refresh";
  userMessage: string;
  shouldClearSessionToken: boolean;
  shouldNavigateToAuth: boolean;
  reportable: boolean;
};

export type OrbiClientAppRole = "rider" | "driver";

const orbiClientErrorCodes = [
  "MOB-AUTH-SESSION",
  "MOB-BOOKING-DISPATCH",
  "MOB-PAYMENT-PROVIDER",
  "MOB-REALTIME-DEGRADED",
  "MOB-SAFETY-INCIDENT",
  "MOB-NETWORK-OFFLINE",
  "MOB-VALIDATION-INPUT",
  "MOB-GENERIC-API",
] as const;

const orbiClientErrorSurfaces = [
  "auth",
  "booking",
  "payments",
  "active-trip",
  "safety",
  "profile",
  "driver-availability",
  "network",
  "unknown",
] as const;

const orbiClientErrorSeverities = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

const orbiClientErrorOwners = [
  "engineering",
  "ops",
  "support",
  "finance",
] as const;

const orbiClientErrorRetryPolicies = [
  "silent-refresh-once-then-relogin",
  "idempotent-retry-with-visible-status",
  "server-reconcile-before-client-retry",
  "fallback-polling-with-last-known-state",
  "store-local-and-escalate-to-support",
  "retry-when-network-recovers",
  "fix-input-before-retry",
  "manual-refresh",
] as const;

export type OrbiClientErrorReport = {
  id: string;
  occurredAt: string;
  appRole: OrbiClientAppRole;
  appVersion?: string;
  classification: OrbiClientErrorClassification;
  fingerprint: string;
  errorName: string;
  errorMessage: string;
  context: Record<string, string | number | boolean | null>;
};

export type SubmitMobileErrorReportsPayload = {
  reports: OrbiClientErrorReport[];
};

export type SubmitMobileErrorReportsResponse = {
  acceptedReports: number;
  ignoredReports: number;
  duplicateReports: number;
  supportTicketCount: number;
};

export function normalizeOrbiClientErrorReportQueue(
  value: unknown,
  options: {
    appRole?: OrbiClientAppRole;
    maxReports?: number;
  } = {},
): OrbiClientErrorReport[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const maxReports = options.maxReports ?? 20;
  const reports: OrbiClientErrorReport[] = [];

  for (const item of value) {
    const report = normalizeOrbiClientErrorReport(item, options.appRole);

    if (report) {
      reports.push(report);
    }

    if (reports.length >= maxReports) {
      break;
    }
  }

  return reports;
}

export function classifyOrbiClientError(
  error: unknown,
  input: {
    surface?: OrbiClientErrorSurface;
    fallbackMessage?: string;
  } = {},
): OrbiClientErrorClassification {
  const surface = input.surface ?? inferOrbiErrorSurface(error);
  const normalizedMessage = normalizeOrbiErrorMessage(error);

  if (isOrbiApiError(error) && [401, 403].includes(error.status)) {
    return {
      code: "MOB-AUTH-SESSION",
      surface: "auth",
      severity: "high",
      owner: "engineering",
      retryPolicy: "silent-refresh-once-then-relogin",
      userMessage:
        "Session expiree. Reconnecte-toi pour continuer sans melanger les actions.",
      shouldClearSessionToken: true,
      shouldNavigateToAuth: true,
      reportable: true,
    };
  }

  if (isLikelyOrbiNetworkError(error)) {
    return {
      code: "MOB-NETWORK-OFFLINE",
      surface: "network",
      severity: "medium",
      owner: "engineering",
      retryPolicy: "retry-when-network-recovers",
      userMessage:
        "Connexion instable. Orbi garde le dernier etat connu pendant la reprise reseau.",
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: false,
    };
  }

  if (isOrbiApiError(error) && error.status === 400) {
    return {
      code: "MOB-VALIDATION-INPUT",
      surface,
      severity: "low",
      owner: surface === "payments" ? "finance" : "ops",
      retryPolicy: "fix-input-before-retry",
      userMessage: extractApiErrorMessage(
        error,
        input.fallbackMessage ??
          "Certaines informations doivent etre corrigees.",
      ),
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: false,
    };
  }

  if (surface === "booking") {
    return {
      code: "MOB-BOOKING-DISPATCH",
      surface,
      severity: "critical",
      owner: "ops",
      retryPolicy: "idempotent-retry-with-visible-status",
      userMessage:
        input.fallbackMessage ??
        "La demande est en verification. Aucun double trajet ne sera cree.",
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: true,
    };
  }

  if (surface === "payments") {
    return {
      code: "MOB-PAYMENT-PROVIDER",
      surface,
      severity: "critical",
      owner: "finance",
      retryPolicy: "server-reconcile-before-client-retry",
      userMessage:
        input.fallbackMessage ??
        "Paiement en verification. Le support voit deja la transaction.",
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: true,
    };
  }

  if (surface === "safety" || normalizedMessage.includes("sos")) {
    return {
      code: "MOB-SAFETY-INCIDENT",
      surface: "safety",
      severity: "critical",
      owner: "support",
      retryPolicy: "store-local-and-escalate-to-support",
      userMessage:
        input.fallbackMessage ??
        "Alerte securite en reprise. Garde le telephone disponible et reessaie si besoin.",
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: true,
    };
  }

  if (surface === "active-trip" || normalizedMessage.includes("realtime")) {
    return {
      code: "MOB-REALTIME-DEGRADED",
      surface: "active-trip",
      severity: "medium",
      owner: "engineering",
      retryPolicy: "fallback-polling-with-last-known-state",
      userMessage:
        input.fallbackMessage ??
        "Connexion live instable. Le trajet reste suivi par Orbi.",
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: true,
    };
  }

  return {
    code: "MOB-GENERIC-API",
    surface,
    severity: "medium",
    owner: "engineering",
    retryPolicy: "manual-refresh",
    userMessage: extractApiErrorMessage(
      error,
      input.fallbackMessage ?? "Une erreur reseau ou serveur est survenue.",
    ),
    shouldClearSessionToken: false,
    shouldNavigateToAuth: false,
    reportable: true,
  };
}

export function createOrbiClientErrorReport(
  error: unknown,
  input: {
    appRole: OrbiClientAppRole;
    appVersion?: string;
    surface?: OrbiClientErrorSurface;
    fallbackMessage?: string;
    occurredAt?: string;
    context?: Record<string, unknown>;
  },
): OrbiClientErrorReport | null {
  const classification = classifyOrbiClientError(error, {
    surface: input.surface,
    fallbackMessage: input.fallbackMessage,
  });

  return createOrbiClientErrorReportFromClassification(error, {
    appRole: input.appRole,
    appVersion: input.appVersion,
    classification,
    occurredAt: input.occurredAt,
    context: input.context,
  });
}

export function createOrbiClientErrorReportFromClassification(
  error: unknown,
  input: {
    appRole: OrbiClientAppRole;
    appVersion?: string;
    classification: OrbiClientErrorClassification;
    occurredAt?: string;
    context?: Record<string, unknown>;
  },
): OrbiClientErrorReport | null {
  if (!input.classification.reportable) {
    return null;
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const errorName = error instanceof Error ? error.name : typeof error;
  const errorMessage = sanitizeOrbiErrorReportValue(
    extractApiErrorMessage(error, input.classification.userMessage),
    220,
  );
  const fingerprint = buildOrbiClientErrorFingerprint({
    appRole: input.appRole,
    code: input.classification.code,
    surface: input.classification.surface,
    message: errorMessage,
  });

  return {
    id: `moberr_${occurredAt.replace(/[^0-9]/g, "").slice(0, 14)}_${fingerprint}`,
    occurredAt,
    appRole: input.appRole,
    appVersion: input.appVersion,
    classification: input.classification,
    fingerprint,
    errorName: sanitizeOrbiErrorReportValue(errorName, 80),
    errorMessage,
    context: sanitizeOrbiErrorReportContext(input.context),
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function sanitizeOrbiErrorReportContext(context?: Record<string, unknown>) {
  const sanitized: Record<string, string | number | boolean | null> = {};

  if (!context) {
    return sanitized;
  }

  for (const [key, value] of Object.entries(context).slice(0, 16)) {
    const cleanKey = sanitizeOrbiErrorReportValue(key, 48);

    if (!cleanKey) {
      continue;
    }

    if (typeof value === "string") {
      sanitized[cleanKey] = sanitizeOrbiErrorReportValue(value, 160);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[cleanKey] = value;
    } else if (typeof value === "boolean" || value === null) {
      sanitized[cleanKey] = value;
    }
  }

  return sanitized;
}

function sanitizeOrbiErrorReportValue(value: string, maxLength: number) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(
      /\b(sessiontoken|session|token|authorization|password|secret)\s*[=:]\s*(?:bearer\s+)?["']?[^"'&\s,;)]+["']?/gi,
      "$1=[redacted]",
    )
    .replace(/bearer\s+["']?[a-z0-9._~+/=-]+["']?/gi, "Bearer [token]")
    .slice(0, maxLength);
}

function normalizeOrbiClientErrorReport(
  value: unknown,
  expectedAppRole?: OrbiClientAppRole,
): OrbiClientErrorReport | null {
  if (!isRecord(value)) {
    return null;
  }

  const appRole = parseEnumValue(value.appRole, ["rider", "driver"] as const);
  const classification = normalizeOrbiClientErrorClassification(
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
    context: normalizeOrbiErrorReportContext(value.context),
  };
}

function normalizeOrbiClientErrorClassification(
  value: unknown,
): OrbiClientErrorClassification | null {
  if (!isRecord(value)) {
    return null;
  }

  const code = parseEnumValue(value.code, orbiClientErrorCodes);
  const surface = parseEnumValue(value.surface, orbiClientErrorSurfaces);
  const severity = parseEnumValue(value.severity, orbiClientErrorSeverities);
  const owner = parseEnumValue(value.owner, orbiClientErrorOwners);
  const retryPolicy = parseEnumValue(
    value.retryPolicy,
    orbiClientErrorRetryPolicies,
  );

  if (!code || !surface || !severity || !owner || !retryPolicy) {
    return null;
  }

  if (
    typeof value.shouldClearSessionToken !== "boolean" ||
    typeof value.shouldNavigateToAuth !== "boolean" ||
    typeof value.reportable !== "boolean"
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

function normalizeOrbiErrorReportContext(value: unknown) {
  const normalized: OrbiClientErrorReport["context"] = {};

  if (!isRecord(value)) {
    return normalized;
  }

  for (const [key, entry] of Object.entries(value).slice(0, 16)) {
    const cleanKey = normalizeErrorReportText(key, 48);

    if (!cleanKey) {
      continue;
    }

    if (typeof entry === "string") {
      normalized[cleanKey] = normalizeErrorReportText(entry, 160);
    } else if (typeof entry === "number" && Number.isFinite(entry)) {
      normalized[cleanKey] = entry;
    } else if (typeof entry === "boolean" || entry === null) {
      normalized[cleanKey] = entry;
    }
  }

  return normalized;
}

function normalizeIsoDate(value: unknown) {
  if (typeof value !== "string" || value.length > 40) {
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
  if (typeof value !== "string") {
    return "";
  }

  return sanitizeOrbiErrorReportValue(
    value.replace(/[ -]/g, "").trim(),
    maxLength,
  );
}

function normalizeErrorReportIdentifier(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[ -]/g, "")
    .trim()
    .replace(/[^a-z0-9._:-]/gi, "")
    .slice(0, maxLength);
}

function parseEnumValue<const T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number] | null {
  if (typeof value !== "string") {
    return null;
  }

  return values.includes(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildOrbiClientErrorFingerprint(input: {
  appRole: OrbiClientAppRole;
  code: OrbiClientErrorClassification["code"];
  surface: OrbiClientErrorSurface;
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

// Deduit la surface d'un crash de rendu (React ErrorBoundary) depuis le
// pathname du router, afin que "Surface: unknown" cesse d'etre la valeur
// systematique de tout crash quel que soit l'ecran ou il survient.
export function resolveMobileRenderCrashSurface(
  pathname: string | null | undefined,
): OrbiClientErrorSurface {
  if (typeof pathname !== "string" || pathname.length === 0) {
    return "unknown";
  }

  const path = pathname.toLowerCase();

  if (path.includes("auth") || path.includes("onboarding")) {
    return "auth";
  }

  if (
    path.includes("payment") ||
    path.includes("wallet") ||
    path.includes("receipt") ||
    path.includes("revenus")
  ) {
    return "payments";
  }

  if (
    path.includes("sos") ||
    path.includes("safety") ||
    path.includes("incident")
  ) {
    return "safety";
  }

  if (path.includes("activity") || path.includes("trip")) {
    return "active-trip";
  }

  if (
    path.includes("account") ||
    path.includes("profil") ||
    path.includes("profile")
  ) {
    return "profile";
  }

  if (path.includes("offres") || path.includes("accueil")) {
    return "driver-availability";
  }

  if (path.includes("book") || path.includes("home")) {
    return "booking";
  }

  return "unknown";
}

function inferOrbiErrorSurface(error: unknown): OrbiClientErrorSurface {
  const message = normalizeOrbiErrorMessage(error);

  if (
    message.includes("session") ||
    message.includes("token") ||
    message.includes("unauthorized")
  ) {
    return "auth";
  }

  if (
    message.includes("payment") ||
    message.includes("paiement") ||
    message.includes("webhook") ||
    message.includes("refund")
  ) {
    return "payments";
  }

  if (
    message.includes("ride request") ||
    message.includes("reservation") ||
    message.includes("booking") ||
    message.includes("dispatch")
  ) {
    return "booking";
  }

  if (
    message.includes("trip") ||
    message.includes("trajet") ||
    message.includes("realtime")
  ) {
    return "active-trip";
  }

  if (
    message.includes("sos") ||
    message.includes("incident") ||
    message.includes("safety")
  ) {
    return "safety";
  }

  if (isLikelyOrbiNetworkError(error)) {
    return "network";
  }

  return "unknown";
}
