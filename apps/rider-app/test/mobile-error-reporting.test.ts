/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />
import {
  clearRiderMobileErrorReports,
  flushRiderMobileErrorReports,
  readRiderMobileErrorReports,
  riderMobileErrorReportQueueKey,
} from '../lib/mobile-error-reporting';
import { riderSessionStorage } from '../lib/session-storage';
import { submitMobileErrorReportsWithApi } from '@mobilis/api';

jest.mock('../lib/session-storage', () => ({
  riderSessionStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@mobilis/api', () => {
  const actual = jest.requireActual('@mobilis/api');

  return {
    ...actual,
    submitMobileErrorReportsWithApi: jest.fn(),
  };
});

const mockedStorage = jest.mocked(riderSessionStorage);
const mockedSubmitMobileErrorReportsWithApi = jest.mocked(
  submitMobileErrorReportsWithApi,
);

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
        'https://mobilis.local/callback?token=rider-secret-token&ok=true',
      password: 'password=Mobilis123!',
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
  });

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
        callbackUrl: 'https://mobilis.local/callback?token=[redacted]&ok=true',
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
});
