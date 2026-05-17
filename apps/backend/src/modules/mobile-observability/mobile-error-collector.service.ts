import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RequestAuthContext } from '../auth/auth.types';

export type MobileErrorCollectorReport = {
  id: string;
  appRole: 'rider' | 'driver';
  appVersion?: string;
  occurredAt: string;
  fingerprint: string;
  errorName: string;
  errorMessage: string;
  classification: {
    code: string;
    surface: string;
    severity: string;
    owner: string;
    retryPolicy: string;
    userMessage: string;
    reportable: boolean;
  };
  context: Record<string, string | number | boolean | null>;
};

@Injectable()
export class MobileErrorCollectorService {
  private readonly logger = new Logger(MobileErrorCollectorService.name);

  constructor(private readonly configService: ConfigService) {}

  async dispatchReports(
    auth: RequestAuthContext,
    reports: MobileErrorCollectorReport[],
  ) {
    if (!reports.length) {
      return;
    }

    const provider = this.configService.get<string>(
      'observability.mobileErrorCollector.provider',
      'local',
    );

    if (provider === 'local') {
      return;
    }

    if (provider !== 'webhook') {
      this.logger.warn(
        `Unsupported mobile error collector provider "${provider}". Reports were kept in local audit only.`,
      );
      return;
    }

    await this.dispatchWebhook(auth, reports);
  }

  private async dispatchWebhook(
    auth: RequestAuthContext,
    reports: MobileErrorCollectorReport[],
  ) {
    const webhookUrl = this.configService.get<string>(
      'observability.mobileErrorCollector.webhookUrl',
      '',
    );

    if (!webhookUrl) {
      this.logger.warn(
        'MOBILE_ERROR_COLLECTOR_PROVIDER=webhook is configured without MOBILE_ERROR_COLLECTOR_WEBHOOK_URL.',
      );
      return;
    }

    const timeoutMs = this.configService.get<number>(
      'observability.mobileErrorCollector.timeoutMs',
      1500,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-orbi-source': 'backend-mobile-observability',
        },
        body: JSON.stringify({
          userId: auth.user.id,
          actorRole: auth.user.role,
          reportCount: reports.length,
          reports,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `Mobile error collector webhook returned HTTP ${response.status}. Reports were kept in local audit.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Mobile error collector webhook failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
