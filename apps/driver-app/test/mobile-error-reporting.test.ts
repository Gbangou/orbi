/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />
import {
  flushDriverMobileErrorReports,
  readDriverMobileErrorReports,
  driverMobileErrorReportQueueKey,
} from '../lib/mobile-error-reporting';
import { driverSessionStorage } from '../lib/session-storage';
import { submitMobileErrorReportsWithApi } from '@mobilis/api';

jest.mock('../lib/session-storage', () => ({
  driverSessionStorage: {
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

const mockedStorage = jest.mocked(driverSessionStorage);
const mockedSubmitMobileErrorReportsWithApi = jest.mocked(
  submitMobileErrorReportsWithApi,
);

function buildQueuedReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'moberr_20260509081500_driver1',
    occurredAt: '2026-05-09T08:15:00.000Z',
    appRole: 'driver',
    classification: {
      code: 'MOB-GENERIC-API',
      surface: 'driver-availability',
      severity: 'medium',
      owner: 'engineering',
      retryPolicy: 'manual-refresh',
      userMessage: 'Disponibilite non synchronisee.',
      shouldClearSessionToken: false,
      shouldNavigateToAuth: false,
      reportable: true,
    },
    fingerprint: 'driver1',
    errorName: 'Error',
    errorMessage: 'sessionToken=driver-secret-token failed',
    context: {
      phone: '+22670000001',
      surface: 'availability',
    },
    ...overrides,
  };
}

describe('driver mobile error reporting queue', () => {
  beforeEach(() => {
    mockedStorage.getItem.mockReset();
    mockedStorage.setItem.mockReset();
    mockedStorage.removeItem.mockReset();
    mockedSubmitMobileErrorReportsWithApi.mockReset();
  });

  it('keeps only normalized driver reports from persisted storage', async () => {
    mockedStorage.getItem.mockResolvedValue(
      JSON.stringify([
        buildQueuedReport(),
        buildQueuedReport({
          id: 'moberr_20260509081501_rider',
          appRole: 'rider',
        }),
        'not-a-report',
      ]),
    );

    const reports = await readDriverMobileErrorReports();

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      id: 'moberr_20260509081500_driver1',
      appRole: 'driver',
      errorMessage: 'sessionToken=[token] failed',
      context: {
        phone: '[phone]',
        surface: 'availability',
      },
    });
  });

  it('does not submit anything when no valid driver reports remain', async () => {
    mockedStorage.getItem.mockResolvedValue(
      JSON.stringify([
        buildQueuedReport({
          appRole: 'rider',
        }),
      ]),
    );

    const response = await flushDriverMobileErrorReports({
      token: 'driver-auth-client',
    } as never);

    expect(response).toEqual({
      acceptedReports: 0,
      ignoredReports: 0,
      duplicateReports: 0,
      supportTicketCount: 0,
    });
    expect(mockedSubmitMobileErrorReportsWithApi).not.toHaveBeenCalled();
    expect(mockedStorage.removeItem).not.toHaveBeenCalledWith(
      driverMobileErrorReportQueueKey,
    );
  });
});
