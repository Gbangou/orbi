import { BadRequestException } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  function createService() {
    const prisma = {
      notification: {
        create: jest.fn().mockResolvedValue({
          id: 'notification-1',
          userId: 'user-1',
          title: 'Course confirmee',
          body: 'Votre chauffeur arrive.',
          channel: 'PUSH',
        }),
      },
    };
    const jobQueueService = {
      enqueue: jest.fn().mockResolvedValue({
        id: 'job-1',
      }),
    };

    return {
      prisma,
      jobQueueService,
      service: new NotificationsService(
        prisma as never,
        jobQueueService as never,
      ),
    };
  }

  it('persists notifications and schedules durable dispatch jobs', async () => {
    const { prisma, jobQueueService, service } = createService();

    const result = await service.enqueue({
      userId: 'user-1',
      title: ' Course confirmee ',
      body: ' Votre chauffeur arrive. ',
      channel: NotificationChannel.PUSH,
      dedupeKey: 'trip:trip-1:driver-arriving',
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        title: 'Course confirmee',
        body: 'Votre chauffeur arrive.',
        channel: 'PUSH',
      },
    });
    expect(jobQueueService.enqueue).toHaveBeenCalledWith({
      kind: 'NOTIFICATION',
      dedupeKey: 'trip:trip-1:driver-arriving',
      entityType: 'notification',
      entityId: 'notification-1',
      payload: {
        notificationId: 'notification-1',
        userId: 'user-1',
        channel: 'PUSH',
        data: {},
      },
    });
    expect(result.notification.id).toBe('notification-1');
  });

  it('bounds notification text before persistence', async () => {
    const { prisma, service } = createService();

    await expect(
      service.enqueue({
        userId: 'user-1',
        title: '',
        body: 'Votre chauffeur arrive.',
        channel: NotificationChannel.PUSH,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
