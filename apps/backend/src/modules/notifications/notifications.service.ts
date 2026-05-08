import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { JobQueueService } from '../../common/job-queue/job-queue.service';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobQueueService: JobQueueService,
  ) {}

  async enqueue(input: {
    userId: string;
    title: string;
    body: string;
    channel: NotificationChannel;
    dedupeKey?: string;
  }) {
    const title = input.title.trim();
    const body = input.body.trim();

    if (!title || title.length > 120) {
      throw new BadRequestException(
        'Notification title must be between 1 and 120 characters.',
      );
    }

    if (!body || body.length > 500) {
      throw new BadRequestException(
        'Notification body must be between 1 and 500 characters.',
      );
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        title,
        body,
        channel: input.channel,
      },
    });

    await this.jobQueueService.enqueue({
      kind: 'NOTIFICATION',
      dedupeKey: input.dedupeKey ?? `notification:${notification.id}`,
      entityType: 'notification',
      entityId: notification.id,
      payload: {
        notificationId: notification.id,
        userId: input.userId,
        channel: input.channel,
      },
    });

    return {
      notification,
    };
  }
}
