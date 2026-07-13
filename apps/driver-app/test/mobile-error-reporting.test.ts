import {
  flushDriverMobileErrorReports,
  readDriverMobileErrorReports,
  reportDriverRenderCrash,
  driverMobileErrorReportQueueKey,
} from '../lib/mobile-error-reporting';
import { driverSessionStorage } from '../lib/session-storage';
import { submitMobileErrorReportsWithApi } from '@orbi/api';

jest.mock('../lib/session-storage', () => ({
  driverSessionStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../lib/auth', () => ({
  restoreDriverSession: jest.fn().mockRejectedValue(new Error('no session in test')),
}));

jest.mock('@orbi/api', () => {
  const actual = jest.requireActual('@orbi/api');

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
      authorization: 'Authorization: Bearer driver-secret-token',
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
      errorMessage: 'sessionToken=[redacted] failed',
      context: {
        authorization: 'Authorization=[redacted]',
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

  it('derives the crash surface from pathname instead of always reporting unknown', async () => {
    // Meme defaut que cote rider: le crash de rendu renvoyait toujours
    // "unknown" quel que soit l'ecran chauffeur casse. Verifie que le pathname
    // est desormais traduit en surface exploitable pour le triage support.
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue(undefined);

    reportDriverRenderCrash(new Error('boom'), { pathname: '/(tabs)/offres' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedStorage.setItem).toHaveBeenCalledWith(
      driverMobileErrorReportQueueKey,
      expect.stringContaining('"surface":"driver-availability"'),
    );
    expect(mockedStorage.setItem).not.toHaveBeenCalledWith(
      driverMobileErrorReportQueueKey,
      expect.stringContaining('"surface":"unknown"'),
    );
  });
});
