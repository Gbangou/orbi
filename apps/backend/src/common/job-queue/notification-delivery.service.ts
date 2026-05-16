import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';

type NotificationDeliveryInput = {
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
};

export type NotificationDeliveryResult = {
  provider: string;
  providerMessageId: string;
  deliveredAt: Date;
};

@Injectable()
export class NotificationDeliveryService {
  constructor(private readonly configService: ConfigService) {}

  async dispatch(
    input: NotificationDeliveryInput,
  ): Promise<NotificationDeliveryResult> {
    this.assertDeliveryInput(input);
    await Promise.resolve();
    const provider = this.resolveProvider();

    if (provider !== 'local') {
      throw new BadRequestException(
        'Notification provider is not configured for durable dispatch.',
      );
    }

    return {
      provider,
      providerMessageId: `local:${input.notificationId}`,
      deliveredAt: new Date(),
    };
  }

  private resolveProvider() {
    const provider =
      this.configService.get<string>('notifications.provider') ?? 'local';

    return provider.trim().toLowerCase();
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
