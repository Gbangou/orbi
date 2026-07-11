import {
  createOrbiClientErrorReportFromClassification,
  normalizeOrbiClientErrorReportQueue,
  submitMobileErrorReportsWithApi,
  type OrbiClientErrorClassification,
  type OrbiClientErrorReport,
  type OrbiApiClient,
} from '@orbi/api';
import { driverSessionStorage } from './session-storage';

export const driverMobileErrorReportQueueKey = 'orbi.driver.mobile-error-reports';
const maxQueuedReports = 20;

const renderCrashClassification: OrbiClientErrorClassification = {
  code: 'MOB-GENERIC-API',
  surface: 'unknown',
  severity: 'critical',
  owner: 'engineering',
  retryPolicy: 'manual-refresh',
  userMessage: "L'application a rencontre un probleme inattendu.",
  shouldClearSessionToken: false,
  shouldNavigateToAuth: false,
  reportable: true,
};

// Signale un crash de rendu (React ErrorBoundary) comme critique, toujours
// notifiable au support — memes garanties que les rapports d'erreur reseau,
// avec une tentative d'envoi immediat si une session est deja active.
export function reportDriverRenderCrash(
  error: unknown,
  context?: Record<string, unknown>,
) {
  void enqueueDriverMobileErrorReport(error, {
    classification: renderCrashClassification,
    context,
  })
    .then(() => import('./auth'))
    .then(({ restoreDriverSession }) => restoreDriverSession())
    .catch(() => undefined);
}

export async function enqueueDriverMobileErrorReport(
  error: unknown,
  input: {
    classification: OrbiClientErrorClassification;
    context?: Record<string, unknown>;
  },
) {
  const report = createOrbiClientErrorReportFromClassification(error, {
    appRole: 'driver',
    classification: input.classification,
    context: input.context,
  });

  if (!report) {
    return null;
  }

  const queuedReports = await readDriverMobileErrorReports();
  const nextReports = [report, ...queuedReports].slice(0, maxQueuedReports);
  await driverSessionStorage.setItem(
    driverMobileErrorReportQueueKey,
    JSON.stringify(nextReports),
  );

  return report;
}

export async function readDriverMobileErrorReports() {
  const rawReports = await driverSessionStorage.getItem(driverMobileErrorReportQueueKey);

  if (!rawReports) {
    return [] as OrbiClientErrorReport[];
  }

  try {
    const parsed = JSON.parse(rawReports);
    return normalizeOrbiClientErrorReportQueue(parsed, {
      appRole: 'driver',
      maxReports: maxQueuedReports,
    });
  } catch {
    return [];
  }
}

export async function clearDriverMobileErrorReports() {
  await driverSessionStorage.removeItem(driverMobileErrorReportQueueKey);
}

export async function flushDriverMobileErrorReports(client: OrbiApiClient) {
  const queuedReports = await readDriverMobileErrorReports();

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
  const latestReports = await readDriverMobileErrorReports();
  const remainingReports = latestReports.filter(
    (report) => !submittedIds.has(report.id),
  );

  if (remainingReports.length) {
    await driverSessionStorage.setItem(
      driverMobileErrorReportQueueKey,
      JSON.stringify(remainingReports),
    );
  } else {
    await clearDriverMobileErrorReports();
  }

  return response;
}
