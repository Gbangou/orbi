import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, SupportTicketStatus } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import type { RequestAuthContext } from '../auth/auth.types';
import type { SubmitMobileErrorReportsDto } from './dto/submit-mobile-error-reports.dto';
import {
  MobileErrorCollectorService,
  type MobileErrorCollectorDispatchResult,
  type MobileErrorCollectorReport,
} from './mobile-error-collector.service';

const sensitiveMobileErrorPattern =
  /\b(sessiontoken|session|token|authorization|password|secret)\s*[=:]\s*(?:bearer\s+)?["']?[^"'&\s,;)]+["']?/gi;
const bearerSecretPattern = /bearer\s+["']?[a-z0-9._~+/=-]+["']?/gi;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phonePattern = /\+?\d[\d\s().-]{7,}\d/g;

@Injectable()
export class MobileObservabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
    private readonly mobileErrorCollectorService: MobileErrorCollectorService,
  ) {}

  async submitErrorReports(
    auth: RequestAuthContext,
    payload: SubmitMobileErrorReportsDto,
  ) {
    for (const report of payload.reports ?? []) {
      this.assertReportMatchesActor(auth, report.appRole);
    }

    let acceptedReports = 0;
    let ignoredReports = 0;
    let duplicateReports = 0;
    let supportTicketCount = 0;
    const collectorReports: MobileErrorCollectorReport[] = [];

    for (const report of payload.reports ?? []) {
      if (!report.classification.reportable) {
        ignoredReports += 1;
        continue;
      }

      const existingAudit = await this.prisma.auditLog.findFirst({
        where: {
          userId: auth.user.id,
          action: 'MOBILE_CLIENT_ERROR_REPORTED',
          entityType: 'MOBILE_ERROR_REPORT',
          entityId: report.id,
        },
        select: {
          id: true,
        },
      });

      if (existingAudit) {
        duplicateReports += 1;
        continue;
      }

      const metadata = {
        appRole: report.appRole,
        appVersion: report.appVersion ?? null,
        occurredAt: report.occurredAt,
        fingerprint: report.fingerprint,
        errorName: report.errorName,
        errorMessage: this.redactMobileErrorText(report.errorMessage),
        sessionId: auth.session.id,
        classification: report.classification,
        context: this.boundContext(report.context),
      };

      await this.prisma.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'MOBILE_CLIENT_ERROR_REPORTED',
          entityType: 'MOBILE_ERROR_REPORT',
          entityId: report.id,
          metadata: metadata as unknown as Prisma.InputJsonValue,
        },
      });
      acceptedReports += 1;
      collectorReports.push({
        id: report.id,
        appRole: metadata.appRole,
        appVersion: report.appVersion,
        occurredAt: metadata.occurredAt,
        fingerprint: metadata.fingerprint,
        errorName: metadata.errorName,
        errorMessage: metadata.errorMessage,
        classification: metadata.classification,
        context: metadata.context,
      });

      if (report.classification.severity === 'critical') {
        const createdTicket = await this.ensureCriticalSupportTicket(
          auth,
          report,
        );
        if (createdTicket) {
          supportTicketCount += 1;
        }
      }
    }

    if (acceptedReports > 0 || supportTicketCount > 0) {
      const collectorDispatch =
        await this.mobileErrorCollectorService.dispatchReports(
          auth,
          collectorReports,
        );
      await this.recordCollectorDispatchAudit(
        auth,
        collectorDispatch,
        collectorReports,
      );

      this.realtimeService.publish({
        channel: 'admin',
        type: 'mobile.error-reports-submitted',
        entityId: auth.user.id,
        actorRole: auth.user.role,
        payload: {
          acceptedReports,
          supportTicketCount,
          appRole: this.resolveAuthenticatedAppRole(auth),
        },
      });
    }

    return {
      acceptedReports,
      ignoredReports,
      duplicateReports,
      supportTicketCount,
    };
  }

  private assertReportMatchesActor(
    auth: RequestAuthContext,
    appRole: 'rider' | 'driver',
  ) {
    if (
      (auth.user.role === 'RIDER' && appRole !== 'rider') ||
      (auth.user.role === 'DRIVER' && appRole !== 'driver')
    ) {
      throw new ForbiddenException(
        'Mobile error report role does not match the authenticated session.',
      );
    }
  }

  private resolveAuthenticatedAppRole(auth: RequestAuthContext) {
    return auth.user.role === 'DRIVER' ? 'driver' : 'rider';
  }

  private async ensureCriticalSupportTicket(
    auth: RequestAuthContext,
    report: SubmitMobileErrorReportsDto['reports'][number],
  ) {
    const subject = `Erreur mobile ${report.classification.code} ${report.fingerprint}`;
    const existingTicket = await this.prisma.supportTicket.findFirst({
      where: {
        userId: auth.user.id,
        subject,
        status: {
          in: [SupportTicketStatus.OPEN, SupportTicketStatus.IN_REVIEW],
        },
      },
      select: {
        id: true,
      },
    });

    if (existingTicket) {
      return false;
    }

    await this.prisma.supportTicket.create({
      data: {
        userId: auth.user.id,
        subject,
        description: [
          report.classification.userMessage,
          `Surface: ${report.classification.surface}`,
          `Owner: ${report.classification.owner}`,
          `Retry: ${report.classification.retryPolicy}`,
        ].join('\n'),
        priority: 3,
        status: SupportTicketStatus.OPEN,
      },
    });

    return true;
  }

  private async recordCollectorDispatchAudit(
    auth: RequestAuthContext,
    dispatch: MobileErrorCollectorDispatchResult,
    reports: MobileErrorCollectorReport[],
  ) {
    if (!reports.length) {
      return;
    }

    const action = dispatch.delivered
      ? dispatch.attempted
        ? 'MOBILE_ERROR_COLLECTOR_DELIVERED'
        : 'MOBILE_ERROR_COLLECTOR_LOCAL_ONLY'
      : 'MOBILE_ERROR_COLLECTOR_DEGRADED';

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action,
        entityType: 'MOBILE_ERROR_COLLECTOR',
        entityId: reports[0]?.id ?? auth.user.id,
        metadata: {
          provider: dispatch.provider,
          reportCount: dispatch.reportCount,
          attempted: dispatch.attempted,
          delivered: dispatch.delivered,
          statusCode: dispatch.statusCode ?? null,
          failureReason: dispatch.failureReason ?? null,
          appRoles: [...new Set(reports.map((report) => report.appRole))],
          criticalReports: reports.filter(
            (report) => report.classification.severity === 'critical',
          ).length,
        } satisfies Prisma.InputJsonValue,
      },
    });
  }

  private boundContext(
    context?: Record<string, string | number | boolean | null>,
  ) {
    return Object.fromEntries(
      Object.entries(context ?? {})
        .slice(0, 16)
        .map(([key, value]) => [
          this.redactMobileErrorText(key).slice(0, 48),
          typeof value === 'string'
            ? this.redactMobileErrorText(value).slice(0, 160)
            : value,
        ]),
    );
  }

  private redactMobileErrorText(value: string) {
    return value
      .replace(emailPattern, '[email]')
      .replace(phonePattern, '[phone]')
      .replace(sensitiveMobileErrorPattern, '$1=[redacted]')
      .replace(bearerSecretPattern, 'Bearer [token]');
  }
}
