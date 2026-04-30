import { ServiceUnavailableException } from '@nestjs/common';
import { of } from 'rxjs';
import { AdminController } from './admin.controller';

describe('AdminController', () => {
  function createController() {
    const adminService = {
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
