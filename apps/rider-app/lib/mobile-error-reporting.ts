import {
  createMobilisClientErrorReportFromClassification,
  submitMobileErrorReportsWithApi,
  type MobilisClientErrorClassification,
  type MobilisClientErrorReport,
  type MobilisApiClient,
} from '@mobilis/api';
import { riderSessionStorage } from './session-storage';

export const riderMobileErrorReportQueueKey = 'mobilis.rider.mobile-error-reports';
const maxQueuedReports = 20;

export async function enqueueRiderMobileErrorReport(
  error: unknown,
  input: {
    classification: MobilisClientErrorClassification;
    context?: Record<string, unknown>;
  },
) {
  const report = createMobilisClientErrorReportFromClassification(error, {
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
    return [] as MobilisClientErrorReport[];
  }

  try {
    const parsed = JSON.parse(rawReports);
    return Array.isArray(parsed)
      ? (parsed.filter(isMobilisClientErrorReportLike) as MobilisClientErrorReport[])
      : [];
  } catch {
    return [];
  }
}

export async function clearRiderMobileErrorReports() {
  await riderSessionStorage.removeItem(riderMobileErrorReportQueueKey);
}

export async function flushRiderMobileErrorReports(client: MobilisApiClient) {
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

function isMobilisClientErrorReportLike(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as MobilisClientErrorReport).id === 'string' &&
    typeof (value as MobilisClientErrorReport).fingerprint === 'string'
  );
}
