import {
  clearRiderMobileErrorReports,
  flushRiderMobileErrorReports,
  readRiderMobileErrorReports,
  reportRiderRenderCrash,
  riderMobileErrorReportQueueKey,
} from '../lib/mobile-error-reporting';
import { riderSessionStorage } from '../lib/session-storage';
import { submitMobileErrorReportsWithApi } from '@orbi/api';
import { restoreRiderSession } from '../lib/auth';

jest.mock('../lib/session-storage', () => ({
  riderSessionStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../lib/auth', () => ({
  restoreRiderSession: jest.fn().mockRejectedValue(new Error('no session in test')),
}));

jest.mock('@orbi/api', () => {
  const actual = jest.requireActual('@orbi/api');

  return {
    ...actual,
    submitMobileErrorReportsWithApi: jest.fn(),
  };
});

const mockedStorage = jest.mocked(riderSessionStorage);
const mockedSubmitMobileErrorReportsWithApi = jest.mocked(
  submitMobileErrorReportsWithApi,
);
const mockedRestoreRiderSession = jest.mocked(restoreRiderSession);

function buildQueuedReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'moberr_20260509080000_abcd123',
    occurredAt: '2026-05-09T08:00:00.000Z',
    appRole: 'rider',
    classification: {
      code: 'MOB-BOOKING-DISPATCH',
      surface: 'booking',
      severity: 'critical',
      owner: 'ops',
      retryPolicy: 'idempotent-retry-with-visible-status',
      userMessage: 'Reservation interrompue.',
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: true,
    },
    fingerprint: 'abcd123',
    errorName: 'Error',
    errorMessage:
      'Authorization: Bearer rider-secret-token failed for awa@example.com and +22670000000',
    context: {
      sessionToken: 'sessionToken=rider-secret-token',
      callbackUrl:
        'https://orbi.local/callback?token=rider-secret-token&ok=true',
      password: 'password=Orbi123!',
      screen: 'booking',
    },
    ...overrides,
  };
}

describe('rider mobile error reporting queue', () => {
  beforeEach(() => {
    mockedStorage.getItem.mockReset();
    mockedStorage.setItem.mockReset();
    mockedStorage.removeItem.mockReset();
    mockedSubmitMobileErrorReportsWithApi.mockReset();
    mockedRestoreRiderSession.mockReset();
    mockedRestoreRiderSession.mockRejectedValue(new Error('no session in test') as never);
  });

  async function flushPendingPromises() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }

  it('normalizes persisted reports before they can be flushed to the backend', async () => {
    mockedStorage.getItem.mockResolvedValue(
      JSON.stringify([
        buildQueuedReport(),
        buildQueuedReport({
          id: 'moberr_20260509080001_driver',
          appRole: 'driver',
        }),
        buildQueuedReport({
          id: 'moberr_20260509080002_ignored',
          classification: {
            code: 'MOB-BOOKING-DISPATCH',
          },
        }),
      ]),
    );

    const reports = await readRiderMobileErrorReports();

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      id: 'moberr_20260509080000_abcd123',
      appRole: 'rider',
      errorMessage: 'Authorization=[redacted] failed for [email] and [phone]',
      context: {
        sessionToken: 'sessionToken=[redacted]',
        callbackUrl: 'https://orbi.local/callback?token=[redacted]&ok=true',
        password: 'password=[redacted]',
        screen: 'booking',
      },
    });
  });

  it('flushes only normalized rider reports and clears submitted entries', async () => {
    mockedStorage.getItem
      .mockResolvedValueOnce(JSON.stringify([buildQueuedReport()]))
      .mockResolvedValueOnce(JSON.stringify([buildQueuedReport()]));
    mockedSubmitMobileErrorReportsWithApi.mockResolvedValue({
      acceptedReports: 1,
      ignoredReports: 0,
      duplicateReports: 0,
      supportTicketCount: 1,
    });

    await flushRiderMobileErrorReports({ token: 'rider-auth-client' } as never);

    expect(mockedSubmitMobileErrorReportsWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      {
        reports: [
          expect.objectContaining({
            id: 'moberr_20260509080000_abcd123',
            appRole: 'rider',
          }),
        ],
      },
    );
    expect(mockedStorage.removeItem).toHaveBeenCalledWith(
      riderMobileErrorReportQueueKey,
    );
  });

  it('clears the persisted rider queue on request', async () => {
    await clearRiderMobileErrorReports();

    expect(mockedStorage.removeItem).toHaveBeenCalledWith(
      riderMobileErrorReportQueueKey,
    );
  });

  it('derives the crash surface from pathname instead of always reporting unknown', async () => {
    // Le crash de rendu (React ErrorBoundary) recevait toujours "unknown" comme
    // surface, meme quand le pathname de l'ecran casse etait connu — le support
    // ne pouvait jamais savoir quel ecran corriger. Verifie que le pathname est
    // desormais traduit en surface exploitable.
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue(undefined);

    reportRiderRenderCrash(new Error('boom'), { pathname: '/book' });
    await flushPendingPromises();

    expect(mockedStorage.setItem).toHaveBeenCalledWith(
      riderMobileErrorReportQueueKey,
      expect.stringContaining('"surface":"booking"'),
    );
    expect(mockedStorage.setItem).not.toHaveBeenCalledWith(
      riderMobileErrorReportQueueKey,
      expect.stringContaining('"surface":"unknown"'),
    );
  });

  it('falls back to unknown surface when no pathname is available', async () => {
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue(undefined);

    reportRiderRenderCrash(new Error('boom'), {});
    await flushPendingPromises();

    expect(mockedStorage.setItem).toHaveBeenCalledWith(
      riderMobileErrorReportQueueKey,
      expect.stringContaining('"surface":"unknown"'),
    );
  });

  it('flushes a render crash report immediately when a rider session exists', async () => {
    mockedStorage.getItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify([buildQueuedReport()]))
      .mockResolvedValueOnce(JSON.stringify([buildQueuedReport()]));
    mockedStorage.setItem.mockResolvedValue(undefined);
    mockedRestoreRiderSession.mockResolvedValue({
      authClient: { token: 'rider-auth-client' },
    } as never);
    mockedSubmitMobileErrorReportsWithApi.mockResolvedValue({
      acceptedReports: 1,
      ignoredReports: 0,
      duplicateReports: 0,
      supportTicketCount: 1,
    });

    reportRiderRenderCrash(new Error('boom'), { pathname: '/book' });
    await flushPendingPromises();

    expect(mockedSubmitMobileErrorReportsWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        reports: [
          expect.objectContaining({
            appRole: 'rider',
          }),
        ],
      }),
    );
  });
});
