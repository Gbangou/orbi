import { BadRequestException } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { NotificationDeliveryService } from './notification-delivery.service';

describe('NotificationDeliveryService', () => {
  function createService(provider = 'local') {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'notifications.provider' ? provider : undefined,
      ),
    };

    return {
      configService,
      service: new NotificationDeliveryService(configService as never),
    };
  }

  it('dispatches through the local provider without exposing notification text', async () => {
    const { service } = createService();

    const result = await service.dispatch({
      notificationId: 'notification-1',
      userId: 'user-1',
      channel: NotificationChannel.PUSH,
    });

    expect(result).toEqual({
      provider: 'local',
      providerMessageId: 'local:notification-1',
      deliveredAt: expect.any(Date),
    });
  });

  it('fails closed when a real provider has not been configured', async () => {
    const { service } = createService('sms-provider');

    await expect(
      service.dispatch({
        notificationId: 'notification-1',
        userId: 'user-1',
        channel: NotificationChannel.SMS,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
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
});
