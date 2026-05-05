/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />
import { router } from 'expo-router';
import { MobilisApiError } from '@mobilis/api';
import { clearDriverPersistedSession } from '../lib/auth';
import { enqueueDriverMobileErrorReport } from '../lib/mobile-error-reporting';
import { resolveDriverAppError } from '../lib/session-feedback';

jest.mock('../lib/auth', () => ({
  clearDriverPersistedSession: jest.fn(),
}));

jest.mock('../lib/mobile-error-reporting', () => ({
  enqueueDriverMobileErrorReport: jest.fn(),
}));

const mockedClearDriverPersistedSession = jest.mocked(clearDriverPersistedSession);
const mockedEnqueueDriverMobileErrorReport = jest.mocked(enqueueDriverMobileErrorReport);

describe('resolveDriverAppError', () => {
  beforeEach(() => {
    mockedClearDriverPersistedSession.mockResolvedValue(undefined);
    mockedEnqueueDriverMobileErrorReport.mockResolvedValue(null);
  });

  it('queues reportable availability errors with shared MOB classification', async () => {
    const feedback = await resolveDriverAppError(
      new Error('availability update failed'),
      { surface: 'driver-availability' },
    );

    expect(feedback).toMatchObject({
      code: 'MOB-GENERIC-API',
      surface: 'driver-availability',
      severity: 'medium',
      owner: 'engineering',
      reportable: true,
      shouldClearSessionToken: false,
    });
    expect(mockedEnqueueDriverMobileErrorReport).toHaveBeenCalledWith(
      expect.any(Error),
      {
        classification: expect.objectContaining({
          code: 'MOB-GENERIC-API',
          retryPolicy: 'manual-refresh',
        }),
      },
    );
  });

  it('clears expired sessions and still queues a reportable auth signal', async () => {
    const feedback = await resolveDriverAppError(
      new MobilisApiError('token expired', 403),
    );

    expect(feedback).toMatchObject({
      code: 'MOB-AUTH-SESSION',
      shouldClearSessionToken: true,
      reportable: true,
    });
    expect(mockedClearDriverPersistedSession).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/auth');
    expect(mockedEnqueueDriverMobileErrorReport).toHaveBeenCalledWith(
      expect.any(MobilisApiError),
      {
        classification: expect.objectContaining({
          code: 'MOB-AUTH-SESSION',
        }),
      },
    );
  });

  it('does not queue expected offline errors', async () => {
    const feedback = await resolveDriverAppError(new TypeError('Failed to fetch'));

    expect(feedback).toMatchObject({
      code: 'MOB-NETWORK-OFFLINE',
      reportable: false,
      shouldClearSessionToken: false,
    });
    expect(mockedEnqueueDriverMobileErrorReport).not.toHaveBeenCalled();
  });
});
