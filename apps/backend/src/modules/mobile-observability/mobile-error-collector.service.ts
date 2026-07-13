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

export type MobileErrorCollectorDispatchResult = {
  provider: string;
  reportCount: number;
  attempted: boolean;
  delivered: boolean;
  statusCode?: number;
  failureReason?: string;
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
      return {
        provider: 'none',
        reportCount: 0,
        attempted: false,
        delivered: true,
      } satisfies MobileErrorCollectorDispatchResult;
    }

    const provider = this.configService.get<string>(
      'observability.mobileErrorCollector.provider',
      'local',
    );

    if (provider === 'local') {
      return {
        provider,
        reportCount: reports.length,
        attempted: false,
        delivered: true,
      } satisfies MobileErrorCollectorDispatchResult;
    }

    if (provider !== 'webhook') {
      this.logger.warn(
        `Unsupported mobile error collector provider "${provider}". Reports were kept in local audit only.`,
      );
      return {
        provider,
        reportCount: reports.length,
        attempted: false,
        delivered: false,
        failureReason: 'unsupported_provider',
      } satisfies MobileErrorCollectorDispatchResult;
    }

    return this.dispatchWebhook(auth, reports);
  }

  private async dispatchWebhook(
    auth: RequestAuthContext,
    reports: MobileErrorCollectorReport[],
  ): Promise<MobileErrorCollectorDispatchResult> {
    const webhookUrl = this.configService.get<string>(
      'observability.mobileErrorCollector.webhookUrl',
      '',
    );

    if (!webhookUrl) {
      this.logger.warn(
        'MOBILE_ERROR_COLLECTOR_PROVIDER=webhook is configured without MOBILE_ERROR_COLLECTOR_WEBHOOK_URL.',
      );
      return {
        provider: 'webhook',
        reportCount: reports.length,
        attempted: false,
        delivered: false,
        failureReason: 'missing_webhook_url',
      };
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

      return {
        provider: 'webhook',
        reportCount: reports.length,
        attempted: true,
        delivered: response.ok,
        statusCode: response.status,
        failureReason: response.ok ? undefined : `http_${response.status}`,
      };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(
        `Mobile error collector webhook failed: ${failureReason}`,
      );
      return {
        provider: 'webhook',
        reportCount: reports.length,
        attempted: true,
        delivered: false,
        failureReason,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
