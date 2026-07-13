import {
  createOrbiClientErrorReportFromClassification,
  normalizeOrbiClientErrorReportQueue,
  resolveMobileRenderCrashSurface,
  submitMobileErrorReportsWithApi,
  type OrbiClientErrorClassification,
  type OrbiClientErrorReport,
  type OrbiApiClient,
} from '@orbi/api';
import { riderSessionStorage } from './session-storage';

export const riderMobileErrorReportQueueKey = 'orbi.rider.mobile-error-reports';
const maxQueuedReports = 20;

function buildRenderCrashClassification(
  pathname?: unknown,
): OrbiClientErrorClassification {
  return {
    code: 'MOB-GENERIC-API',
    surface: resolveMobileRenderCrashSurface(
      typeof pathname === 'string' ? pathname : null,
    ),
    severity: 'critical',
    owner: 'engineering',
    retryPolicy: 'manual-refresh',
    userMessage: "L'application a rencontre un probleme inattendu.",
    shouldClearSessionToken: false,
    shouldNavigateToAuth: false,
    reportable: true,
  };
}

// Signale un crash de rendu (React ErrorBoundary) comme critique, toujours
// notifiable au support — memes garanties que les rapports d'erreur reseau,
// avec une tentative d'envoi immediat si une session est deja active. La
// surface est deduite du pathname courant pour que le support sache quel
// ecran a casse au lieu de recevoir systematiquement "unknown".
export function reportRiderRenderCrash(
  error: unknown,
  context?: Record<string, unknown>,
) {
  void enqueueRiderMobileErrorReport(error, {
    classification: buildRenderCrashClassification(context?.pathname),
    context,
  })
    .then(() => import('./auth'))
    .then(({ restoreRiderSession }) => restoreRiderSession())
    .catch(() => undefined);
}

export async function enqueueRiderMobileErrorReport(
  error: unknown,
  input: {
    classification: OrbiClientErrorClassification;
    context?: Record<string, unknown>;
  },
) {
  const report = createOrbiClientErrorReportFromClassification(error, {
    appRole: 'rider',
    classification: input.classification,
    context: input.context,
  });

  if (!report) {
    return null;
  }

  const queuedReports = await readRiderMobileErrorReports();
  const nextReports = [report, ...queuedReports].slice(0, maxQueuedReports);
  await riderSessionStorage.setItem(
    riderMobileErrorReportQueueKey,
    JSON.stringify(nextReports),
  );

  return report;
}

export async function readRiderMobileErrorReports() {
  const rawReports = await riderSessionStorage.getItem(riderMobileErrorReportQueueKey);

  if (!rawReports) {
    return [] as OrbiClientErrorReport[];
  }

  try {
    const parsed = JSON.parse(rawReports);
    return normalizeOrbiClientErrorReportQueue(parsed, {
      appRole: 'rider',
      maxReports: maxQueuedReports,
    });
  } catch {
    return [];
  }
}

export async function clearRiderMobileErrorReports() {
  await riderSessionStorage.removeItem(riderMobileErrorReportQueueKey);
}

export async function flushRiderMobileErrorReports(client: OrbiApiClient) {
  const queuedReports = await readRiderMobileErrorReports();

  if (!queuedReports.length) {
    return {
      acceptedReports: 0,
      ignoredReports: 0,
      duplicateReports: 0,
      supportTicketCount: 0,
    };
  }

  const response = await submitMobileErrorReportsWithApi(client, {
    reports: queuedReports,
  });
  const submittedIds = new Set(queuedReports.map((report) => report.id));
  const latestReports = await readRiderMobileErrorReports();
  const remainingReports = latestReports.filter(
    (report) => !submittedIds.has(report.id),
  );

  if (remainingReports.length) {
    await riderSessionStorage.setItem(
      riderMobileErrorReportQueueKey,
      JSON.stringify(remainingReports),
    );
  } else {
    await clearRiderMobileErrorReports();
  }

  return response;
}
