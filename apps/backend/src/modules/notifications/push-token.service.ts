import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class PushTokenService {
  private readonly logger = new Logger(PushTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, token: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: token.trim() },
    });
  }

  async getToken(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });
    return user?.pushToken ?? null;
  }

  async revoke(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { pushToken: null },
      });
    } catch (err) {
      this.logger.warn(`Failed to revoke push token for user ${userId}: ${String(err)}`);
    }
  }
}
