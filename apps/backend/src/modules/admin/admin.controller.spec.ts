import { ServiceUnavailableException } from '@nestjs/common';
import { of } from 'rxjs';
import { AdminController } from './admin.controller';

describe('AdminController', () => {
  function createController() {
    const adminService = {
      previewOverview: jest.fn(),
      overview: jest.fn(),
      liveOps: jest.fn(),
      launchReadiness: jest.fn(),
      acknowledgeLaunchReadinessAction: jest.fn(),
      supportTickets: jest.fn(),
      driverOnboardingQueue: jest.fn(),
      driverOnboardingExportCsv: jest.fn(),
      driverWallets: jest.fn(),
      prepareDriverWalletPayout: jest.fn(),
      markDriverPayoutPaid: jest.fn(),
      driverPayoutSettlementCsv: jest.fn(),
      driverPayoutSettlementPdf: jest.fn(),
      featureFlags: jest.fn(),
      dispatchSettings: jest.fn(),
      pricingCalibration: jest.fn(),
      paymentWebhookEvents: jest.fn(),
      paymentWebhookEventDetail: jest.fn(),
      startPaymentWebhookInvestigation: jest.fn(),
      replayPaymentWebhookEvent: jest.fn(),
      verifyPaymentAttemptWithProvider: jest.fn(),
      refundPaymentAttempt: jest.fn(),
      updateDispatchSettings: jest.fn(),
      updateSupportTicket: jest.fn(),
      updateDriverOnboardingReview: jest.fn(),
      acknowledgeHealthIncident: jest.fn(),
      muteHealthIncident: jest.fn(),
      getDriverDocumentViewLink: jest.fn(),
    };
    const realtimeService = {
      stream: jest.fn(),
    };

    return {
      adminService,
      realtimeService,
      controller: new AdminController(
        adminService as never,
        realtimeService as never,
      ),
    };
  }

  it('streams admin events with the authenticated actor identity', () => {
    const { controller, realtimeService } = createController();
    const stream$ = of({
      type: 'support-ticket.updated',
      data: {
        entityId: 'ticket-1',
      },
    });
    realtimeService.stream.mockReturnValue(stream$);

    const result = controller.stream({
      user: { id: 'ops-1', role: 'OPS' },
    } as never);

    expect(realtimeService.stream).toHaveBeenCalledWith({
      role: 'OPS',
      actorId: 'ops-1',
      riderId: null,
      driverId: null,
    });
    expect(result).toBe(stream$);
  });

  it('propagates controlled realtime shutdowns to stream consumers', () => {
    const { controller, realtimeService } = createController();

    realtimeService.stream.mockImplementation(() => {
      throw new ServiceUnavailableException(
        'Realtime is temporarily disabled for this actor during controlled rollout.',
      );
    });

    expect(() =>
      controller.stream({
        user: { id: 'support-1', role: 'SUPPORT' },
      } as never),
    ).toThrow(ServiceUnavailableException);
  });

  it('delegates support ticket updates with the current auth context', async () => {
    const { adminService, controller } = createController();
    const auth = {
      user: { id: 'admin-1', role: 'ADMIN' },
    };
    const payload = {
      status: 'IN_REVIEW',
      priority: 2,
    };

    await controller.updateSupportTicket(
      'ticket-1',
      payload as never,
      auth as never,
    );

    expect(adminService.updateSupportTicket).toHaveBeenCalledWith(
      'ticket-1',
      payload,
      auth,
    );
  });

  it('delegates driver wallet reads to the admin service', async () => {
    const { adminService, controller } = createController();
    const query = {
      page: 1,
      pageSize: 10,
    };

    await controller.driverWallets(query as never);

    expect(adminService.driverWallets).toHaveBeenCalledWith(query);
  });

  it('delegates driver payout preparation with notes and auth', async () => {
    const { adminService, controller } = createController();
    const payload = { notes: 'Paiement terrain valide.' };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.prepareDriverWalletPayout(
      'wallet-1',
      payload,
      auth as never,
    );

    expect(adminService.prepareDriverWalletPayout).toHaveBeenCalledWith(
      'wallet-1',
      payload,
      auth,
    );
  });

  it('delegates driver payout CSV settlement exports with auth', async () => {
    const { adminService, controller } = createController();
    const query = { status: 'PREPARED' };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.driverPayoutSettlementCsv(query as never, auth as never);

    expect(adminService.driverPayoutSettlementCsv).toHaveBeenCalledWith(
      query,
      auth,
    );
  });

  it('delegates driver onboarding CSV exports with auth', async () => {
    const { adminService, controller } = createController();
    const query = {
      guidanceFilter: 'review',
      searchQuery: 'permis',
      limit: 50,
    };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.driverOnboardingExportCsv(query as never, auth as never);

    expect(adminService.driverOnboardingExportCsv).toHaveBeenCalledWith(
      query,
      auth,
    );
  });

  it('delegates dispatch settings updates with the current auth context', async () => {
    const { adminService, controller } = createController();
    const auth = {
      user: { id: 'admin-1', role: 'ADMIN', fullName: 'Admin Mobilis' },
    };
    const payload = {
      lookbackHours: 96,
      halfLifeHours: 24,
    };

    await controller.updateDispatchSettings(payload as never, auth as never);

    expect(adminService.updateDispatchSettings).toHaveBeenCalledWith(
      payload,
      auth,
    );
  });

  it('delegates pricing calibration reads to the admin service', async () => {
    const { adminService, controller } = createController();

    await controller.pricingCalibration();

    expect(adminService.pricingCalibration).toHaveBeenCalled();
  });

  it('delegates launch readiness reads to the admin service', async () => {
    const { adminService, controller } = createController();

    await controller.launchReadiness();

    expect(adminService.launchReadiness).toHaveBeenCalled();
  });

  it('delegates launch readiness action acknowledgements with auth', async () => {
    const { adminService, controller } = createController();
    const payload = {
      owner: 'engineering',
      notes: 'Redis backplane owner assigned.',
    };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.acknowledgeLaunchReadinessAction(
      'runtime-production-readiness',
      payload as never,
      auth as never,
    );

    expect(
      adminService.acknowledgeLaunchReadinessAction,
    ).toHaveBeenCalledWith('runtime-production-readiness', payload, auth);
  });

  it('delegates payment webhook event journal reads to the admin service', async () => {
    const { adminService, controller } = createController();
    const query = {
      page: 1,
      pageSize: 10,
      provider: 'FLUTTERWAVE',
    };

    await controller.paymentWebhookEvents(query as never);

    expect(adminService.paymentWebhookEvents).toHaveBeenCalledWith(query);
  });

  it('delegates payment webhook event detail reads to the admin service', async () => {
    const { adminService, controller } = createController();

    await controller.paymentWebhookEventDetail('webhook-event-1');

    expect(adminService.paymentWebhookEventDetail).toHaveBeenCalledWith(
      'webhook-event-1',
    );
  });

  it('delegates payment webhook investigation starts with the current auth context', async () => {
    const { adminService, controller } = createController();
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.startPaymentWebhookInvestigation(
      'webhook-event-1',
      auth as never,
    );

    expect(adminService.startPaymentWebhookInvestigation).toHaveBeenCalledWith(
      'webhook-event-1',
      auth,
    );
  });

  it('delegates provider payment verification with the current auth context', async () => {
    const { adminService, controller } = createController();
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.verifyPaymentAttemptWithProvider(
      'payment-1',
      auth as never,
    );

    expect(adminService.verifyPaymentAttemptWithProvider).toHaveBeenCalledWith(
      'payment-1',
      auth,
    );
  });

  it('delegates payment refunds with payload and auth context', async () => {
    const { adminService, controller } = createController();
    const payload = {
      reason: 'Course annulee apres debit.',
    };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.refundPaymentAttempt('payment-1', payload, auth as never);

    expect(adminService.refundPaymentAttempt).toHaveBeenCalledWith(
      'payment-1',
      payload,
      auth,
    );
  });

  it('delegates payment webhook replays with the current auth context', async () => {
    const { adminService, controller } = createController();
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.replayPaymentWebhookEvent(
      'webhook-event-1',
      auth as never,
    );

    expect(adminService.replayPaymentWebhookEvent).toHaveBeenCalledWith(
      'webhook-event-1',
      auth,
    );
  });

  it('delegates health incident acknowledgement with the current auth context', () => {
    const { adminService, controller } = createController();
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    controller.acknowledgeHealthIncident('incident-1', auth as never);

    expect(adminService.acknowledgeHealthIncident).toHaveBeenCalledWith(
      'incident-1',
      auth,
    );
  });

  it('delegates health incident mute with the current auth context', () => {
    const { adminService, controller } = createController();
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    controller.muteHealthIncident('incident-1', auth as never);

    expect(adminService.muteHealthIncident).toHaveBeenCalledWith(
      'incident-1',
      auth,
    );
  });
});
