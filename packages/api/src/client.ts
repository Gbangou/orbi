// ── Core API client — HTTP primitives, error types, retry logic ───────────────

export type ApiClientOptions = {
  baseUrl: string;
  version?: string;
  defaultHeaders?: Record<string, string>;
  fetcher?: typeof fetch;
  requestTimeoutMs?: number;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
};

export class OrbiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = "OrbiApiError";
  }
}

export function isOrbiApiError(error: unknown): error is OrbiApiError {
  return error instanceof OrbiApiError;
}

export function extractApiErrorMessage(
  error: unknown,
  fallback = "Une erreur reseau ou serveur est survenue.",
) {
  if (isOrbiApiError(error)) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

// Un message backend destine a un client mobile doit toujours etre en
// francais. Un backend qui laisse passer un texte anglais non traduit (deja
// arrive : "Trip completion is blocked by a critical route monitoring
// alert.") ne doit jamais atteindre l'ecran du chauffeur/passager tel quel —
// on retombe sur le message generique plutot que d'exposer du texte brut non
// verifie. Ce filtre ne doit s'appliquer qu'a l'affichage final ; les
// classifieurs qui font du pattern-matching sur le texte brut (ex: l'auth)
// doivent continuer a utiliser extractApiErrorMessage directement.
const unvettedEnglishMessagePattern =
  /\b(not|is|was|has|does|cannot|only|already|before|found|could|would|should|must|the|this|please|your)\b/i;

export function looksLikeUnvettedEnglishMessage(message: string): boolean {
  return unvettedEnglishMessagePattern.test(message);
}

export function resolveDisplayableApiErrorMessage(
  error: unknown,
  fallback = "Une erreur reseau ou serveur est survenue.",
) {
  const extracted = extractApiErrorMessage(error, fallback);
  return looksLikeUnvettedEnglishMessage(extracted) ? fallback : extracted;
}

export type NetworkRetryOptions = {
  maxAttempts?: number;
  onRetry?: (attempt: number, maxAttempts: number) => void;
};

function isLikelyOrbiNetworkError(error: unknown) {
  if (error instanceof TypeError) {
    return true;
  }

  const message = normalizeOrbiErrorMessage(error);

  return (
    message.includes("network request failed") ||
    message.includes("fetch failed") ||
    message.includes("load failed") ||
    message.includes("networkerror")
  );
}

function normalizeOrbiErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  return "";
}

function isNetworkLevelError(error: unknown): boolean {
  return isLikelyOrbiNetworkError(error);
}

function isLikelyOrbiConnectivityFailure(error: unknown): boolean {
  if (isLikelyOrbiNetworkError(error)) {
    return true;
  }

  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    typeof error.name === "string" &&
    error.name.toLowerCase() === "aborterror"
  ) {
    return true;
  }

  const message = normalizeOrbiErrorMessage(error);

  return (
    message.includes("aborted") ||
    message.includes("aborterror")
  );
}

function retryDelayMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
}

export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  options: NetworkRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isNetworkLevelError(error) || attempt === maxAttempts) {
        throw error;
      }

      options.onRetry?.(attempt, maxAttempts);
      await new Promise<void>((resolve) =>
        setTimeout(resolve, retryDelayMs(attempt)),
      );
    }
  }

  throw lastError;
}

function resolveApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const message = record.message;

  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  if (Array.isArray(message)) {
    const firstMessage = message.find(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0,
    );

    if (firstMessage) {
      return firstMessage.trim();
    }
  }

  return null;
}

export {
  isLikelyOrbiNetworkError,
  isLikelyOrbiConnectivityFailure,
  normalizeOrbiErrorMessage,
};

// These values mirror apiConfig in routes.ts — kept here so OrbiApiClient
// has no import dependency on routes.ts (avoids circular imports).
const API_VERSION_PREFIX = "v1";
const API_PREFIX = "/api";

const defaultRequestTimeoutMs = 30_000;

export class OrbiApiClient {
  private readonly version: string;
  private readonly headers: Record<string, string>;
  private readonly fetcher: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: ApiClientOptions) {
    this.version = options.version ?? API_VERSION_PREFIX;
    this.headers = options.defaultHeaders ?? {};
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
  }

  endpoint(path: string, query?: RequestOptions["query"]) {
    const url = new URL(
      `${API_PREFIX}/${this.version}${path}`,
      this.options.baseUrl,
    );

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
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );

    let response: Response;

    try {
      response = await this.fetcher(this.endpoint(path, options.query), {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errorPayload: unknown;

      try {
        errorPayload = await response.json();
      } catch {
        errorPayload = undefined;
      }

      const message =
        resolveApiErrorMessage(errorPayload) ??
        `Orbi API request failed with status ${response.status}`;

      throw new OrbiApiError(message, response.status, errorPayload);
    }

    return (await response.json()) as T;
  }

  async requestWithRetry<T>(
    path: string,
    options: RequestOptions = {},
    retryOptions: NetworkRetryOptions = {},
  ): Promise<T> {
    return withNetworkRetry(() => this.request<T>(path, options), retryOptions);
  }

  async requestText(path: string, options: RequestOptions = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );

    let response: Response;

    try {
      response = await this.fetcher(this.endpoint(path, options.query), {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errorPayload: unknown;

      try {
        errorPayload = await response.json();
      } catch {
        errorPayload = undefined;
      }

      const message =
        resolveApiErrorMessage(errorPayload) ??
        `Orbi API request failed with status ${response.status}`;

      throw new OrbiApiError(message, response.status, errorPayload);
    }

    return response.text();
  }

  withAuthToken(token: string) {
    return new OrbiApiClient({
      ...this.options,
      version: this.version,
      defaultHeaders: {
        ...this.headers,
        Authorization: `Bearer ${token}`,
      },
      fetcher: this.fetcher,
      requestTimeoutMs: this.requestTimeoutMs,
    });
  }
}

export function createOrbiApiClient(
  baseUrl: string,
  init?: Omit<ApiClientOptions, "baseUrl">,
) {
  return new OrbiApiClient({
    baseUrl,
    ...init,
  });
}
