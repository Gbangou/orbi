import { ServiceUnavailableException } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { of } from 'rxjs';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
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
      listRiders: jest.fn(),
      setRiderStatus: jest.fn(),
      driverOnboardingQueue: jest.fn(),
      driverOnboardingExportHistory: jest.fn(),
      driverOnboardingExportCsv: jest.fn(),
      tripsExportCsv: jest.fn(),
      driverWallets: jest.fn(),
      prepareDriverWalletPayout: jest.fn(),
      recordDriverWalletRecoveryAdjustment: jest.fn(),
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
      updateDriverDocumentObjectVerification: jest.fn(),
      verifyDriverDocumentObjectFromProvider: jest.fn(),
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
      session: { expiresAt: new Date('2026-05-17T10:00:00.000Z') },
    } as never);

    expect(realtimeService.stream).toHaveBeenCalledWith({
      role: 'OPS',
      actorId: 'ops-1',
      riderId: null,
      driverId: null,
      sessionExpiresAt: new Date('2026-05-17T10:00:00.000Z'),
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
        session: { expiresAt: new Date('2026-05-17T10:00:00.000Z') },
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

  it('delegates driver onboarding queue reads with auth for role-aware privacy', async () => {
    const { adminService, controller } = createController();
    const query = {
      page: 1,
      pageSize: 10,
    };
    const auth = {
      user: { id: 'support-1', role: 'SUPPORT' },
    };

    await controller.driverOnboardingQueue(query as never, auth as never);

    expect(adminService.driverOnboardingQueue).toHaveBeenCalledWith(
      query,
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

  it('delegates rider account reads to the admin service', async () => {
    const { adminService, controller } = createController();
    const query = {
      page: 1,
      pageSize: 30,
      search: 'awa',
    };

    await controller.riders(query as never);

    expect(adminService.listRiders).toHaveBeenCalledWith(query);
  });

  it('delegates rider status changes with the current auth context', async () => {
    const { adminService, controller } = createController();
    const payload = {
      isActive: false,
      reason: 'Signal support confirme.',
    };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.setRiderStatus('rider-user-1', payload, auth as never);

    expect(adminService.setRiderStatus).toHaveBeenCalledWith(
      'rider-user-1',
      payload,
      auth,
    );
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

  it('keeps money mutation endpoints restricted to admin and ops roles', () => {
    const moneyMutationHandlerNames = [
      'prepareDriverWalletPayout',
      'recordDriverWalletRecoveryAdjustment',
      'markDriverPayoutPaid',
      'replayPaymentWebhookEvent',
      'verifyPaymentAttemptWithProvider',
      'refundPaymentAttempt',
      'driverPayoutSettlementCsv',
      'driverPayoutSettlementPdf',
    ];

    for (const handlerName of moneyMutationHandlerNames) {
      const handler =
        AdminController.prototype[handlerName as keyof AdminController];

      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        UserRole.ADMIN,
        UserRole.OPS,
      ]);
    }
  });

  it('requires session auth, RBAC and explicit roles on every non-public admin handler', () => {
    const publicHandlers = new Set(['preview']);
    const prototype = AdminController.prototype;
    const handlerNames = Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        name !== 'constructor' &&
        typeof prototype[name as keyof AdminController] === 'function',
    );

    expect(handlerNames).toContain('launchReadiness');
    expect(handlerNames).toContain('refundPaymentAttempt');

    for (const handlerName of handlerNames) {
      if (publicHandlers.has(handlerName)) {
        continue;
      }

      const handler = prototype[handlerName as keyof AdminController];
      const routePath = Reflect.getMetadata(PATH_METADATA, handler);
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
      const roles = Reflect.getMetadata(ROLES_KEY, handler) ?? [];

      expect(routePath).toBeDefined();
      expect(guards).toEqual(
        expect.arrayContaining([SessionAuthGuard, RolesGuard]),
      );
      expect(roles.length).toBeGreaterThan(0);
      expect(roles).toEqual(
        expect.arrayContaining([expect.stringMatching(/ADMIN|OPS|SUPPORT/)]),
      );
    }
  });

  it('allows support to read driver wallets without granting payout mutation roles', () => {
    const driverWalletsHandler = AdminController.prototype['driverWallets'];
    const preparePayoutHandler =
      AdminController.prototype['prepareDriverWalletPayout'];

    expect(Reflect.getMetadata(ROLES_KEY, driverWalletsHandler)).toEqual([
      UserRole.ADMIN,
      UserRole.OPS,
      UserRole.SUPPORT,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, preparePayoutHandler)).not.toContain(
      UserRole.SUPPORT,
    );
  });

  it('delegates recovery adjustments with required auth context', async () => {
    const { adminService, controller } = createController();
    const payload = {
      amount: 1000,
      notes: 'Recouvrement mobile money confirme.',
      idempotencyKey: 'ops-recovery-1',
    };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.recordDriverWalletRecoveryAdjustment(
      'wallet-1',
      payload,
      auth as never,
    );

    expect(
      adminService.recordDriverWalletRecoveryAdjustment,
    ).toHaveBeenCalledWith('wallet-1', payload, auth);
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

  it('delegates driver onboarding export history reads', async () => {
    const { adminService, controller } = createController();
    const query = {
      page: 1,
      pageSize: 8,
    };

    await controller.driverOnboardingExportHistory(query as never);

    expect(adminService.driverOnboardingExportHistory).toHaveBeenCalledWith(
      query,
    );
  });

  it('delegates driver document object verification updates with auth', async () => {
    const { adminService, controller } = createController();
    const payload = {
      state: 'confirmed',
      provider: 'orbi-object-store',
      sizeBytes: 120000,
      sha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.updateDriverDocumentObjectVerification(
      'driver-1',
      'doc-1',
      payload as never,
      auth as never,
    );

    expect(
      adminService.updateDriverDocumentObjectVerification,
    ).toHaveBeenCalledWith('driver-1', 'doc-1', payload, auth);
  });

  it('delegates provider driver document object verification with auth', async () => {
    const { adminService, controller } = createController();
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.verifyDriverDocumentObjectFromProvider(
      'driver-1',
      'doc-1',
      auth as never,
    );

    expect(
      adminService.verifyDriverDocumentObjectFromProvider,
    ).toHaveBeenCalledWith('driver-1', 'doc-1', auth);
  });

  it('delegates dispatch settings updates with the current auth context', async () => {
    const { adminService, controller } = createController();
    const auth = {
      user: { id: 'admin-1', role: 'ADMIN', fullName: 'Admin Orbi' },
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

    expect(adminService.acknowledgeLaunchReadinessAction).toHaveBeenCalledWith(
      'runtime-production-readiness',
      payload,
      auth,
    );
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

  it('delegates trips CSV export with auth context', async () => {
    const { adminService, controller } = createController();
    const query = { status: 'COMPLETED', limit: 100 };
    const auth = { user: { id: 'admin-1', role: 'ADMIN' } };

    await controller.tripsExportCsv(query as never, auth as never);

    expect(adminService.tripsExportCsv).toHaveBeenCalledWith(query, auth);
  });

  it('trips/export.csv is restricted to ADMIN and OPS roles', () => {
    const { controller } = createController();
    const roles: UserRole[] = Reflect.getMetadata(
      ROLES_KEY,
      controller.tripsExportCsv,
    ) as UserRole[];
    expect(roles).toContain(UserRole.ADMIN);
    expect(roles).toContain(UserRole.OPS);
    expect(roles).not.toContain(UserRole.SUPPORT);
  });

  it('trips/export.csv requires SessionAuthGuard', () => {
    const { controller } = createController();
    const guards: unknown[] = Reflect.getMetadata(
      GUARDS_METADATA,
      controller.tripsExportCsv,
    ) as unknown[];
    expect(guards).toContain(SessionAuthGuard);
    expect(guards).toContain(RolesGuard);
  });
});
