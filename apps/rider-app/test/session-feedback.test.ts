import { router } from 'expo-router';
import { OrbiApiError } from '@orbi/api';
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
      new OrbiApiError('token expired', 401),
    );

    expect(feedback).toMatchObject({
      code: 'MOB-AUTH-SESSION',
      shouldClearSessionToken: true,
      reportable: true,
    });
    expect(mockedClearRiderPersistedSession).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/auth');
    expect(mockedEnqueueRiderMobileErrorReport).toHaveBeenCalledWith(
      expect.any(OrbiApiError),
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

  it('treats mobile request timeouts as recoverable network errors', async () => {
    const feedback = await resolveRiderAppError(
      new DOMException('The operation was aborted.', 'AbortError'),
    );

    expect(feedback).toMatchObject({
      code: 'MOB-NETWORK-OFFLINE',
      reportable: false,
      shouldClearSessionToken: false,
    });
    expect(mockedEnqueueRiderMobileErrorReport).not.toHaveBeenCalled();
  });

  it('keeps technical server details out of rider-facing errors', async () => {
    const feedback = await resolveRiderAppError(
      new OrbiApiError('Prisma backend stack trace: token failed', 500),
      {
        surface: 'profile',
        fallback: 'Votre profil sera actualise des que la connexion revient.',
      },
    );

    expect(feedback.message).toBe('Votre profil sera actualise des que la connexion revient.');
    expect(feedback.message).not.toMatch(/backend|Prisma|token|stack/i);
  });
});
