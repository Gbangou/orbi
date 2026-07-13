import { ForbiddenException } from '@nestjs/common';
import { MobileObservabilityService } from './mobile-observability.service';
import type { SubmitMobileErrorReportsDto } from './dto/submit-mobile-error-reports.dto';

describe('MobileObservabilityService', () => {
  function createService() {
    const prisma = {
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(undefined),
      },
      supportTicket: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    const realtimeService = {
      publish: jest.fn(),
    };
    const mobileErrorCollectorService = {
      dispatchReports: jest.fn().mockResolvedValue({
        provider: 'local',
        reportCount: 1,
        attempted: false,
        delivered: true,
      }),
    };

    return {
      service: new MobileObservabilityService(
        prisma as never,
        realtimeService as never,
        mobileErrorCollectorService as never,
      ),
      prisma,
      realtimeService,
      mobileErrorCollectorService,
    };
  }

  function riderAuth() {
    return {
      user: {
        id: 'rider-user-1',
        role: 'RIDER',
      },
      session: {
        id: 'session-1',
      },
    } as never;
  }

  function buildReport(
    override: Partial<SubmitMobileErrorReportsDto['reports'][number]> = {},
  ): SubmitMobileErrorReportsDto['reports'][number] {
    return {
      id: 'moberr-1',
      occurredAt: '2026-05-03T12:00:00.000Z',
      appRole: 'rider',
      classification: {
        code: 'MOB-BOOKING-DISPATCH',
        surface: 'booking',
        severity: 'critical',
        owner: 'ops',
        retryPolicy: 'idempotent-retry-with-visible-status',
        userMessage:
          'La demande est en verification. Aucun double trajet ne sera cree.',
        shouldClearSessionToken: false,
        shouldNavigateToAuth: false,
        reportable: true,
      },
      fingerprint: 'abc123',
      errorName: 'Error',
      errorMessage: 'dispatch timeout',
      context: {
        screen: 'book',
      },
      ...override,
    };
  }

  it('audits reportable mobile errors and opens a support ticket for critical signals', async () => {
    const { service, prisma, realtimeService, mobileErrorCollectorService } =
      createService();

    const result = await service.submitErrorReports(riderAuth(), {
      reports: [buildReport()],
    });

    expect(result).toEqual({
      acceptedReports: 1,
      ignoredReports: 0,
      duplicateReports: 0,
      supportTicketCount: 1,
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'rider-user-1',
        action: 'MOBILE_CLIENT_ERROR_REPORTED',
        entityType: 'MOBILE_ERROR_REPORT',
        entityId: 'moberr-1',
      }),
    });
    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'rider-user-1',
        subject: 'Erreur mobile MOB-BOOKING-DISPATCH abc123',
        priority: 3,
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'admin',
        type: 'mobile.error-reports-submitted',
        payload: expect.objectContaining({
          appRole: 'rider',
        }),
      }),
    );
    expect(mobileErrorCollectorService.dispatchReports).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: 'rider-user-1' }),
      }),
      [
        expect.objectContaining({
          id: 'moberr-1',
          appRole: 'rider',
          errorMessage: 'dispatch timeout',
          context: {
            screen: 'book',
          },
        }),
      ],
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'rider-user-1',
        action: 'MOBILE_ERROR_COLLECTOR_LOCAL_ONLY',
        entityType: 'MOBILE_ERROR_COLLECTOR',
        entityId: 'moberr-1',
        metadata: expect.objectContaining({
          provider: 'local',
          delivered: true,
          criticalReports: 1,
        }),
      }),
    });
  });

  it('redacts secrets from mobile error metadata on the server boundary', async () => {
    const { service, prisma, mobileErrorCollectorService } = createService();

    await service.submitErrorReports(riderAuth(), {
      reports: [
        buildReport({
          errorMessage:
            'Authorization: Bearer rider-secret-token failed for awa@example.com and +22670000000',
          context: {
            sessionToken: 'sessionToken=rider-secret-token',
            callbackUrl:
              'https://orbi.local/callback?token=rider-secret-token&ok=true',
            password: 'password=Orbi123!',
          },
        }),
      ],
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          errorMessage:
            'Authorization=[redacted] failed for [email] and [phone]',
          context: {
            sessionToken: 'sessionToken=[redacted]',
            callbackUrl: 'https://orbi.local/callback?token=[redacted]&ok=true',
            password: 'password=[redacted]',
          },
        }),
      }),
    });
    expect(mobileErrorCollectorService.dispatchReports).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          errorMessage:
            'Authorization=[redacted] failed for [email] and [phone]',
          context: {
            sessionToken: 'sessionToken=[redacted]',
            callbackUrl: 'https://orbi.local/callback?token=[redacted]&ok=true',
            password: 'password=[redacted]',
          },
        }),
      ],
    );
  });

  it('keeps non-reportable mobile errors out of audit and support queues', async () => {
    const { service, prisma, mobileErrorCollectorService } = createService();

    const result = await service.submitErrorReports(riderAuth(), {
      reports: [
        buildReport({
          classification: {
            ...buildReport().classification,
            code: 'MOB-NETWORK-OFFLINE',
            surface: 'network',
            severity: 'medium',
            reportable: false,
          },
        }),
      ],
    });

    expect(result).toMatchObject({
      acceptedReports: 0,
      ignoredReports: 1,
      supportTicketCount: 0,
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(mobileErrorCollectorService.dispatchReports).not.toHaveBeenCalled();
  });

  it('deduplicates already audited report ids', async () => {
    const { service, prisma, mobileErrorCollectorService } = createService();
    prisma.auditLog.findFirst.mockResolvedValueOnce({ id: 'audit-1' });

    const result = await service.submitErrorReports(riderAuth(), {
      reports: [buildReport()],
    });

    expect(result).toMatchObject({
      acceptedReports: 0,
      duplicateReports: 1,
      supportTicketCount: 0,
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(mobileErrorCollectorService.dispatchReports).not.toHaveBeenCalled();
  });

  it('audits degraded external collector dispatch without rejecting the report', async () => {
    const { service, prisma, mobileErrorCollectorService } = createService();
    mobileErrorCollectorService.dispatchReports.mockResolvedValueOnce({
      provider: 'webhook',
      reportCount: 1,
      attempted: true,
      delivered: false,
      statusCode: 503,
      failureReason: 'http_503',
    });

    const result = await service.submitErrorReports(riderAuth(), {
      reports: [buildReport()],
    });

    expect(result).toMatchObject({
      acceptedReports: 1,
      supportTicketCount: 1,
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'rider-user-1',
        action: 'MOBILE_ERROR_COLLECTOR_DEGRADED',
        entityType: 'MOBILE_ERROR_COLLECTOR',
        entityId: 'moberr-1',
        metadata: expect.objectContaining({
          provider: 'webhook',
          attempted: true,
          delivered: false,
          statusCode: 503,
          failureReason: 'http_503',
        }),
      }),
    });
  });

  it('rejects reports that do not match the authenticated app role', async () => {
    const { service } = createService();

    await expect(
      service.submitErrorReports(riderAuth(), {
        reports: [buildReport({ appRole: 'driver' })],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects mixed-role payloads before writing audit or support side effects', async () => {
    const { service, prisma, realtimeService, mobileErrorCollectorService } =
      createService();

    await expect(
      service.submitErrorReports(riderAuth(), {
        reports: [
          buildReport(),
          buildReport({ id: 'moberr-2', appRole: 'driver' }),
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.auditLog.findFirst).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(realtimeService.publish).not.toHaveBeenCalled();
    expect(mobileErrorCollectorService.dispatchReports).not.toHaveBeenCalled();
  });
});
