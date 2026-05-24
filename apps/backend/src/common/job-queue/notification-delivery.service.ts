import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PushTokenService } from '../../modules/notifications/push-token.service';

type NotificationDeliveryInput = {
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  data?: Record<string, string>;
};

export type NotificationDeliveryResult = {
  provider: string;
  providerMessageId: string;
  deliveredAt: Date;
};

type ExpoPushTicket = {
  status: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly pushTokenService: PushTokenService,
  ) {}

  async dispatch(
    input: NotificationDeliveryInput,
  ): Promise<NotificationDeliveryResult> {
    this.assertDeliveryInput(input);

    if (input.channel === 'PUSH') {
      return this.dispatchExpoPush(input);
    }

    return {
      provider: 'local',
      providerMessageId: `local:${input.notificationId}`,
      deliveredAt: new Date(),
    };
  }

  private async dispatchExpoPush(
    input: NotificationDeliveryInput,
  ): Promise<NotificationDeliveryResult> {
    const token = this.pushTokenService.getToken(input.userId);

    if (!token) {
      this.logger.debug(
        `No push token for user ${input.userId} — push delivery skipped.`,
      );
      return {
        provider: 'skipped_no_token',
        providerMessageId: `skipped:${input.notificationId}`,
        deliveredAt: new Date(),
      };
    }

    const notification = await this.prisma.notification.findUnique({
      where: { id: input.notificationId },
      select: { title: true, body: true },
    });

    if (!notification) {
      throw new Error('notification_missing_for_push_delivery');
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({
        to: token,
        title: notification.title,
        body: notification.body,
        sound: 'default',
        priority: 'high',
        channelId: 'default',
        data: input.data ?? {},
      }),
    });

    if (!response.ok) {
      throw new Error(`expo_push_api_http_error:${response.status}`);
    }

    const result = (await response.json()) as { data?: ExpoPushTicket };

    if (result.data?.status === 'error') {
      this.logger.warn(
        `Expo push error for notification ${input.notificationId}: ${result.data.message ?? 'unknown'}`,
      );
    }

    const ticketId = result.data?.id ?? `expo:${input.notificationId}`;

    return {
      provider: 'expo',
      providerMessageId: ticketId,
      deliveredAt: new Date(),
    };
  }

  private assertDeliveryInput(input: NotificationDeliveryInput) {
    if (!input.notificationId.trim()) {
      throw new BadRequestException('Notification id is required.');
    }

    if (!input.userId.trim()) {
      throw new BadRequestException('Notification user id is required.');
    }

    if (!['PUSH', 'SMS', 'EMAIL', 'IN_APP'].includes(input.channel)) {
      throw new BadRequestException('Notification channel is unsupported.');
    }
  }
}
