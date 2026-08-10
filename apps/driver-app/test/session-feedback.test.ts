import { router } from 'expo-router';
import { OrbiApiError } from '@orbi/api';
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
      new OrbiApiError('token expired', 403),
    );

    expect(feedback).toMatchObject({
      code: 'MOB-AUTH-SESSION',
      action: 'reconnect',
      actionLabel: 'Se reconnecter',
      shouldClearSessionToken: true,
      reportable: true,
    });
    expect(mockedClearDriverPersistedSession).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/auth');
    expect(mockedEnqueueDriverMobileErrorReport).toHaveBeenCalledWith(
      expect.any(OrbiApiError),
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
      action: 'retry',
      actionLabel: 'Reessayer',
      reportable: false,
      shouldClearSessionToken: false,
    });
    expect(mockedEnqueueDriverMobileErrorReport).not.toHaveBeenCalled();
  });

  it('treats mobile request timeouts as recoverable network errors', async () => {
    const feedback = await resolveDriverAppError(
      new DOMException('The operation was aborted.', 'AbortError'),
    );

    expect(feedback).toMatchObject({
      code: 'MOB-NETWORK-OFFLINE',
      reportable: false,
      shouldClearSessionToken: false,
    });
    expect(mockedEnqueueDriverMobileErrorReport).not.toHaveBeenCalled();
  });

  it('keeps technical server details out of driver-facing errors', async () => {
    const feedback = await resolveDriverAppError(
      new OrbiApiError('server exception token trace', 500),
      {
        surface: 'driver-availability',
        fallback: "Votre disponibilite n'a pas pu etre mise a jour.",
      },
    );

    expect(feedback.message).toBe("Votre disponibilite n'a pas pu etre mise a jour.");
    expect(feedback.message).not.toMatch(/server|token|trace/i);
    expect(feedback.logCode).toBe('MOB-GENERIC-API');
  });

  it('translates denied location permission into a clear correction action', async () => {
    const feedback = await resolveDriverAppError(
      new Error('location denied permission enum=LOCATION_DENIED'),
      { surface: 'driver-availability' },
    );

    expect(feedback).toMatchObject({
      action: 'edit',
      actionLabel: 'Modifier',
      logCode: 'MOB-GENERIC-API',
    });
    expect(feedback.message).toBe(
      "Localisation necessaire. Autorisez-la ou saisissez l'adresse manuellement.",
    );
    expect(feedback.message).not.toMatch(/enum|LOCATION_DENIED|permission/i);
  });
});
