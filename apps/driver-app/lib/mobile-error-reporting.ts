import {
  createMobilisClientErrorReportFromClassification,
  normalizeMobilisClientErrorReportQueue,
  submitMobileErrorReportsWithApi,
  type MobilisClientErrorClassification,
  type MobilisClientErrorReport,
  type MobilisApiClient,
} from '@mobilis/api';
import { driverSessionStorage } from './session-storage';

export const driverMobileErrorReportQueueKey = 'mobilis.driver.mobile-error-reports';
const maxQueuedReports = 20;

export async function enqueueDriverMobileErrorReport(
  error: unknown,
  input: {
    classification: MobilisClientErrorClassification;
    context?: Record<string, unknown>;
  },
) {
  const report = createMobilisClientErrorReportFromClassification(error, {
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
    return [] as MobilisClientErrorReport[];
  }

  try {
    const parsed = JSON.parse(rawReports);
    return normalizeMobilisClientErrorReportQueue(parsed, {
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

export async function flushDriverMobileErrorReports(client: MobilisApiClient) {
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
