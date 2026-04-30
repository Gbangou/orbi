import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ServiceUnavailableException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { of } from 'rxjs';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

class SessionAuthGuardStub implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    request.auth = {
      token: 'session-token',
      session: {
        id: 'session-1',
        userId: 'user-ops-1',
        createdAt: new Date('2026-04-19T10:00:00.000Z'),
        lastSeenAt: new Date('2026-04-19T10:00:00.000Z'),
        expiresAt: new Date('2026-04-20T10:00:00.000Z'),
        revokedAt: null,
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      },
      user: {
        id: 'ops-1',
        role: 'OPS',
        fullName: 'Ops Mobilis',
      },
    };

    return true;
  }
}

class RolesGuardStub implements CanActivate {
  canActivate() {
    return true;
  }
}

describe('AdminController (integration)', () => {
  let app: INestApplication<App>;
  let adminService: {
    supportTickets: jest.Mock;
    previewOverview: jest.Mock;
    overview: jest.Mock;
    liveOps: jest.Mock;
    driverOnboardingQueue: jest.Mock;
    featureFlags: jest.Mock;
    dispatchSettings: jest.Mock;
    pricingCalibration: jest.Mock;
    paymentWebhookEvents: jest.Mock;
    paymentWebhookEventDetail: jest.Mock;
    startPaymentWebhookInvestigation: jest.Mock;
    updateDispatchSettings: jest.Mock;
    updateSupportTicket: jest.Mock;
    updateDriverOnboardingReview: jest.Mock;
    getDriverDocumentViewLink: jest.Mock;
  };
  let realtimeService: {
    stream: jest.Mock;
  };

  beforeEach(async () => {
    adminService = {
      previewOverview: jest.fn(),
      overview: jest.fn(),
      liveOps: jest.fn(),
      supportTickets: jest.fn(),
      driverOnboardingQueue: jest.fn(),
      featureFlags: jest.fn(),
      dispatchSettings: jest.fn(),
      pricingCalibration: jest.fn(),
      paymentWebhookEvents: jest.fn(),
      paymentWebhookEventDetail: jest.fn(),
      startPaymentWebhookInvestigation: jest.fn(),
      updateDispatchSettings: jest.fn(),
      updateSupportTicket: jest.fn(),
      updateDriverOnboardingReview: jest.fn(),
      getDriverDocumentViewLink: jest.fn(),
    };
    realtimeService = {
      stream: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: adminService,
        },
        {
          provide: RealtimeService,
          useValue: realtimeService,
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useClass(SessionAuthGuardStub)
      .overrideGuard(RolesGuard)
      .useClass(RolesGuardStub)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves support tickets through the versioned admin endpoint', async () => {
    adminService.supportTickets.mockResolvedValue({
      tickets: [
        {
          id: 'ticket-1',
          status: 'OPEN',
        },
      ],
      meta: {
        page: 1,
        pageSize: 10,
        total: 1,
        pageCount: 1,
      },
    });

    await request(app.getHttpServer())
      .get('/api/v1/admin/support-tickets?page=1&pageSize=10')
      .expect(200)
      .expect((response) => {
        expect(response.body.tickets[0]?.id).toBe('ticket-1');
        expect(response.body.meta.total).toBe(1);
      });

    expect(adminService.supportTickets).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
    });
  });

  it('streams SSE events on the admin endpoint in nominal mode', async () => {
    realtimeService.stream.mockReturnValue(
      of({
        type: 'support-ticket.updated',
        data: {
          entityId: 'ticket-1',
          status: 'IN_REVIEW',
        },
      }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/admin/stream')
      .expect(200)
      .expect('content-type', /text\/event-stream/)
      .expect((response) => {
        expect(response.text).toContain('event: support-ticket.updated');
        expect(response.text).toContain('"entityId":"ticket-1"');
      });

    expect(realtimeService.stream).toHaveBeenCalledWith({
      role: 'OPS',
      actorId: 'ops-1',
      riderId: null,
      driverId: null,
    });
  });

  it('updates dispatch settings through the versioned admin endpoint', async () => {
    adminService.updateDispatchSettings.mockResolvedValue({
      settings: {
        lookbackHours: 96,
        halfLifeHours: 24,
        declineCooldownMinutes: 30,
        historyLimit: 60,
        source: 'DATABASE_OVERRIDE',
        updatedAt: '2026-04-23T18:00:00.000Z',
        updatedBy: {
          id: 'ops-1',
          name: 'Ops Mobilis',
          role: 'OPS',
        },
      },
    });

    await request(app.getHttpServer())
      .patch('/api/v1/admin/dispatch-settings')
      .send({
        lookbackHours: 96,
        halfLifeHours: 24,
        declineCooldownMinutes: 30,
        historyLimit: 60,
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.settings.lookbackHours).toBe(96);
        expect(response.body.settings.source).toBe('DATABASE_OVERRIDE');
      });

    expect(adminService.updateDispatchSettings).toHaveBeenCalledWith(
      {
        lookbackHours: 96,
        halfLifeHours: 24,
        declineCooldownMinutes: 30,
        historyLimit: 60,
      },
      expect.objectContaining({
        user: expect.objectContaining({
          id: 'ops-1',
        }),
      }),
    );
  });

  it('serves pricing calibration through the versioned admin endpoint', async () => {
    adminService.pricingCalibration.mockResolvedValue({
      window: {
        lookbackDays: 14,
        since: '2026-04-12T00:00:00.000Z',
      },
      summary: {
        totalRequests: 3,
        matchedRequests: 2,
        completedTrips: 1,
        cancelledRequests: 1,
        expiredRequests: 0,
        paidRequests: 1,
        acceptanceRate: 66.7,
        completionRate: 33.3,
        cancellationRate: 33.3,
        paymentConversionRate: 33.3,
        averageFare: 1600,
        averageDriverPayout: 1312,
        averageFarePerKm: 320,
        averagePickupWaitMinutes: 4,
      },
      segments: [],
      timeWindows: [],
      geographySegments: [],
      recommendations: [
        {
          scope: 'Global',
          priority: 'LOW',
          action: 'Continuer la collecte avant ajustement automatique.',
          rationale:
            'Les signaux restent compatibles avec une calibration prudente.',
        },
      ],
      alerts: [
        'Acceptation terrain compatible avec une calibration progressive.',
      ],
    });

    await request(app.getHttpServer())
      .get('/api/v1/admin/pricing-calibration')
      .expect(200)
      .expect((response) => {
        expect(response.body.summary.totalRequests).toBe(3);
        expect(response.body.summary.acceptanceRate).toBe(66.7);
      });

    expect(adminService.pricingCalibration).toHaveBeenCalled();
  });

  it('serves payment webhook events through the versioned admin endpoint', async () => {
    adminService.paymentWebhookEvents.mockResolvedValue({
      events: [
        {
          id: 'webhook-event-1',
          provider: 'FLUTTERWAVE',
          action: 'persisted_and_reconciled',
          eventType: 'payment.completed',
          transactionRef: 'mobilis_123_ride-request-1',
          providerReference: 'fw_ref_123',
          signatureVerified: true,
          createdAt: '2026-04-27T09:30:00.000Z',
        },
      ],
      meta: {
        page: 1,
        pageSize: 10,
        total: 1,
        pageCount: 1,
      },
    });

    await request(app.getHttpServer())
      .get(
        '/api/v1/admin/payment-webhook-events?page=1&pageSize=10&provider=FLUTTERWAVE',
      )
      .expect(200)
      .expect((response) => {
        expect(response.body.events[0]?.id).toBe('webhook-event-1');
        expect(response.body.events[0]?.signatureVerified).toBe(true);
      });

    expect(adminService.paymentWebhookEvents).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      provider: 'FLUTTERWAVE',
    });
  });

  it('serves payment webhook event detail through the versioned admin endpoint', async () => {
    adminService.paymentWebhookEventDetail.mockResolvedValue({
      event: {
        id: 'webhook-event-1',
        provider: 'CINETPAY',
        action: 'persisted_and_reconciled',
        payload: {
          cel_phone_num: '[redacted]',
        },
      },
    });

    await request(app.getHttpServer())
      .get('/api/v1/admin/payment-webhook-events/webhook-event-1')
      .expect(200)
      .expect((response) => {
        expect(response.body.event.id).toBe('webhook-event-1');
        expect(response.body.event.payload.cel_phone_num).toBe('[redacted]');
      });

    expect(adminService.paymentWebhookEventDetail).toHaveBeenCalledWith(
      'webhook-event-1',
    );
  });

  it('starts payment webhook investigations through the versioned admin endpoint', async () => {
    adminService.startPaymentWebhookInvestigation.mockResolvedValue({
      investigation: {
        eventId: 'webhook-event-1',
        status: 'STARTED',
        supportTicket: {
          id: 'ticket-1',
          status: 'OPEN',
          priority: 2,
        },
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/admin/payment-webhook-events/webhook-event-1/investigation')
      .expect(201)
      .expect((response) => {
        expect(response.body.investigation.eventId).toBe('webhook-event-1');
        expect(response.body.investigation.supportTicket.id).toBe('ticket-1');
      });

    expect(adminService.startPaymentWebhookInvestigation).toHaveBeenCalledWith(
      'webhook-event-1',
      expect.objectContaining({
        user: expect.objectContaining({
          id: 'ops-1',
        }),
      }),
    );
  });

  it('returns a 503 response when realtime streaming is disabled for the actor', async () => {
    realtimeService.stream.mockImplementation(() => {
      throw new ServiceUnavailableException(
        'Realtime is temporarily disabled for this actor during controlled rollout.',
      );
    });

    await request(app.getHttpServer())
      .get('/api/v1/admin/stream')
      .expect(503)
      .expect((response) => {
        expect(response.body.message).toContain(
          'Realtime is temporarily disabled for this actor during controlled rollout.',
        );
      });
  });
});
