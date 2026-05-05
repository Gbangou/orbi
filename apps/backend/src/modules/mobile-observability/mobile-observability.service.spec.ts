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

    return {
      service: new MobileObservabilityService(
        prisma as never,
        realtimeService as never,
      ),
      prisma,
      realtimeService,
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
    const { service, prisma, realtimeService } = createService();

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
      }),
    );
  });

  it('keeps non-reportable mobile errors out of audit and support queues', async () => {
    const { service, prisma } = createService();

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
  });

  it('deduplicates already audited report ids', async () => {
    const { service, prisma } = createService();
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
  });

  it('rejects reports that do not match the authenticated app role', async () => {
    const { service } = createService();

    await expect(
      service.submitErrorReports(riderAuth(), {
        reports: [buildReport({ appRole: 'driver' })],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
