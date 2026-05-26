import { BadRequestException } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { NotificationDeliveryService } from './notification-delivery.service';
import { PushTokenService } from '../../modules/notifications/push-token.service';

describe('NotificationDeliveryService', () => {
  function createService(
    opts: {
      pushToken?: string;
      notificationTitle?: string;
      notificationBody?: string;
    } = {},
  ) {
    const configService = {
      get: jest.fn(() => undefined),
    };

    const pushTokenService = new PushTokenService();
    if (opts.pushToken) {
      pushTokenService.register('user-1', opts.pushToken);
    }

    const prisma = {
      notification: {
        findUnique: jest.fn().mockResolvedValue(
          opts.notificationTitle
            ? {
                title: opts.notificationTitle,
                body: opts.notificationBody ?? '',
              }
            : null,
        ),
      },
    };

    return {
      pushTokenService,
      prisma,
      service: new NotificationDeliveryService(
        configService as never,
        prisma as never,
        pushTokenService,
      ),
    };
  }

  it('skips push delivery when no token is registered for the user', async () => {
    const { service } = createService();

    const result = await service.dispatch({
      notificationId: 'notification-1',
      userId: 'user-1',
      channel: NotificationChannel.PUSH,
    });

    expect(result).toMatchObject({
      provider: 'skipped_no_token',
      providerMessageId: 'skipped:notification-1',
      deliveredAt: expect.any(Date),
    });
  });

  it('delivers via Expo when a push token is registered', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { status: 'ok', id: 'expo-ticket-abc' },
      }),
    });
    global.fetch = mockFetch as never;

    const { service } = createService({
      pushToken: 'ExponentPushToken[test-token]',
      notificationTitle: 'Chauffeur trouvé !',
      notificationBody: 'Votre chauffeur arrive.',
    });

    const result = await service.dispatch({
      notificationId: 'notification-1',
      userId: 'user-1',
      channel: NotificationChannel.PUSH,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toMatchObject({
      provider: 'expo',
      providerMessageId: 'expo-ticket-abc',
      deliveredAt: expect.any(Date),
    });
  });

  it('uses local fallback for non-push channels', async () => {
    const { service } = createService();

    const result = await service.dispatch({
      notificationId: 'notification-1',
      userId: 'user-1',
      channel: NotificationChannel.IN_APP,
    });

    expect(result).toMatchObject({
      provider: 'local',
      providerMessageId: 'local:notification-1',
    });
  });

  it('rejects malformed provider inputs before dispatch', async () => {
    const { service } = createService();

    await expect(
      service.dispatch({
        notificationId: '',
        userId: 'user-1',
        channel: NotificationChannel.PUSH,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the userId is empty', async () => {
    const { service } = createService();

    await expect(
      service.dispatch({
        notificationId: 'notification-1',
        userId: '   ',
        channel: NotificationChannel.PUSH,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when a push token exists but the notification record is missing', async () => {
    const { service } = createService({
      pushToken: 'ExponentPushToken[test-token]',
    });

    await expect(
      service.dispatch({
        notificationId: 'notification-missing',
        userId: 'user-1',
        channel: NotificationChannel.PUSH,
      }),
    ).rejects.toThrow('notification_missing_for_push_delivery');
  });

  it('throws when the Expo API returns a non-2xx HTTP response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as never;

    const { service } = createService({
      pushToken: 'ExponentPushToken[test-token]',
      notificationTitle: 'Test',
      notificationBody: 'Body',
    });

    await expect(
      service.dispatch({
        notificationId: 'notification-1',
        userId: 'user-1',
        channel: NotificationChannel.PUSH,
      }),
    ).rejects.toThrow('expo_push_api_http_error:503');
  });

  it('returns an expo result with a fallback ticket id when the push ticket has no id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { status: 'error', message: 'DeviceNotRegistered' },
      }),
    }) as never;

    const { service } = createService({
      pushToken: 'ExponentPushToken[test-token]',
      notificationTitle: 'Test',
      notificationBody: 'Body',
    });

    const result = await service.dispatch({
      notificationId: 'notification-1',
      userId: 'user-1',
      channel: NotificationChannel.PUSH,
    });

    expect(result.provider).toBe('expo');
    expect(result.providerMessageId).toBe('expo:notification-1');
    expect(result.deliveredAt).toBeInstanceOf(Date);
  });
});
