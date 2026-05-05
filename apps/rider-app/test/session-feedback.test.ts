/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />
import { router } from 'expo-router';
import { MobilisApiError } from '@mobilis/api';
import { clearRiderPersistedSession } from '../lib/auth';
import { enqueueRiderMobileErrorReport } from '../lib/mobile-error-reporting';
import { resolveRiderAppError } from '../lib/session-feedback';

jest.mock('../lib/auth', () => ({
  clearRiderPersistedSession: jest.fn(),
}));

jest.mock('../lib/mobile-error-reporting', () => ({
  enqueueRiderMobileErrorReport: jest.fn(),
}));

const mockedClearRiderPersistedSession = jest.mocked(clearRiderPersistedSession);
const mockedEnqueueRiderMobileErrorReport = jest.mocked(enqueueRiderMobileErrorReport);

describe('resolveRiderAppError', () => {
  beforeEach(() => {
    mockedClearRiderPersistedSession.mockResolvedValue(undefined);
    mockedEnqueueRiderMobileErrorReport.mockResolvedValue(null);
  });

  it('queues reportable booking errors with shared MOB classification', async () => {
    const feedback = await resolveRiderAppError(
      new Error('dispatch timeout for booking'),
      { surface: 'booking' },
    );

    expect(feedback).toMatchObject({
      code: 'MOB-BOOKING-DISPATCH',
      surface: 'booking',
      severity: 'critical',
      owner: 'ops',
      reportable: true,
      shouldClearSessionToken: false,
    });
    expect(mockedEnqueueRiderMobileErrorReport).toHaveBeenCalledWith(
      expect.any(Error),
      {
        classification: expect.objectContaining({
          code: 'MOB-BOOKING-DISPATCH',
          retryPolicy: 'idempotent-retry-with-visible-status',
        }),
      },
    );
  });

  it('clears expired sessions and still queues a reportable auth signal', async () => {
    const feedback = await resolveRiderAppError(
      new MobilisApiError('token expired', 401),
    );

    expect(feedback).toMatchObject({
      code: 'MOB-AUTH-SESSION',
      shouldClearSessionToken: true,
      reportable: true,
    });
    expect(mockedClearRiderPersistedSession).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/auth');
    expect(mockedEnqueueRiderMobileErrorReport).toHaveBeenCalledWith(
      expect.any(MobilisApiError),
      {
        classification: expect.objectContaining({
          code: 'MOB-AUTH-SESSION',
        }),
      },
    );
  });

  it('does not queue expected offline errors', async () => {
    const feedback = await resolveRiderAppError(new TypeError('Network request failed'));

    expect(feedback).toMatchObject({
      code: 'MOB-NETWORK-OFFLINE',
      reportable: false,
      shouldClearSessionToken: false,
    });
    expect(mockedEnqueueRiderMobileErrorReport).not.toHaveBeenCalled();
  });
});
