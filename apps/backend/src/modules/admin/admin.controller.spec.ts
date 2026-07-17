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
      tripsExportCsv: jest.fn(),
      featureFlags: jest.fn(),
      dispatchSettings: jest.fn(),
      pricingCalibration: jest.fn(),
      updateDispatchSettings: jest.fn(),
      acknowledgeHealthIncident: jest.fn(),
      muteHealthIncident: jest.fn(),
      tripsAudit: jest.fn(),
      jobQueue: jest.fn(),
      requeueJob: jest.fn(),
      healthIncidents: jest.fn(),
    };
    const realtimeService = { stream: jest.fn() };
    const adminPaymentWebhooksService = {
      paymentWebhookEvents: jest.fn(),
      paymentWebhookEventDetail: jest.fn(),
      startPaymentWebhookInvestigation: jest.fn(),
      replayPaymentWebhookEvent: jest.fn(),
      verifyPaymentAttemptWithProvider: jest.fn(),
      refundPaymentAttempt: jest.fn(),
    };
    const adminDriverPayoutsService = {
      driverWallets: jest.fn(),
      prepareDriverWalletPayout: jest.fn(),
      recordDriverWalletRecoveryAdjustment: jest.fn(),
      markDriverPayoutPaid: jest.fn(),
      driverPayoutSettlementCsv: jest.fn(),
      driverPayoutSettlementPdf: jest.fn(),
    };
    const adminDriverOnboardingService = {
      driverOnboardingQueue: jest.fn(),
      driverOnboardingExportCsv: jest.fn(),
      driverOnboardingExportHistory: jest.fn(),
      updateDriverOnboardingReview: jest.fn(),
      getDriverDocumentViewLink: jest.fn(),
      updateDriverDocumentObjectVerification: jest.fn(),
      verifyDriverDocumentObjectFromProvider: jest.fn(),
      suspendDriver: jest.fn(),
      reactivateDriver: jest.fn(),
    };
    const adminPromoCodesService = {
      listPromoCodes: jest.fn(),
      createPromoCode: jest.fn(),
      deactivatePromoCode: jest.fn(),
    };
    const adminSupportService = {
      supportTickets: jest.fn(),
      updateSupportTicket: jest.fn(),
    };
    const adminUsersService = {
      listDrivers: jest.fn(),
      listRiders: jest.fn(),
      setRiderStatus: jest.fn(),
      repairRiderProfile: jest.fn(),
    };

    return {
      adminService,
      realtimeService,
      adminPaymentWebhooksService,
      adminDriverPayoutsService,
      adminDriverOnboardingService,
      adminPromoCodesService,
      adminSupportService,
      adminUsersService,
      controller: new AdminController(
        adminService as never,
        realtimeService as never,
        adminPaymentWebhooksService as never,
        adminDriverPayoutsService as never,
        adminDriverOnboardingService as never,
        adminPromoCodesService as never,
        adminSupportService as never,
        adminUsersService as never,
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
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
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

    expect(adminSupportService.updateSupportTicket).toHaveBeenCalledWith(
      'ticket-1',
      payload,
      auth,
    );
  });

  it('delegates driver onboarding queue reads with auth for role-aware privacy', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const query = {
      page: 1,
      pageSize: 10,
    };
    const auth = {
      user: { id: 'support-1', role: 'SUPPORT' },
    };

    await controller.driverOnboardingQueue(query as never, auth as never);

    expect(adminDriverOnboardingService.driverOnboardingQueue).toHaveBeenCalledWith(
      query,
      auth,
    );
  });

  it('delegates driver wallet reads to the admin service', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const query = {
      page: 1,
      pageSize: 10,
    };

    await controller.driverWallets(query as never);

    expect(adminDriverPayoutsService.driverWallets).toHaveBeenCalledWith(query);
  });

  it('delegates rider account reads to the admin service', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const query = {
      page: 1,
      pageSize: 30,
      search: 'awa',
    };

    await controller.riders(query as never);

    expect(adminUsersService.listRiders).toHaveBeenCalledWith(query);
  });

  it('delegates rider status changes with the current auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const payload = {
      isActive: false,
      reason: 'Signal support confirme.',
    };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.setRiderStatus('rider-user-1', payload, auth as never);

    expect(adminUsersService.setRiderStatus).toHaveBeenCalledWith(
      'rider-user-1',
      payload,
      auth,
    );
  });

  it('delegates rider profile repair with the current auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.repairRiderProfile('rider-user-1', auth as never);

    expect(adminUsersService.repairRiderProfile).toHaveBeenCalledWith(
      'rider-user-1',
      auth,
    );
  });

  it('delegates driver payout preparation with notes and auth', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const payload = { notes: 'Paiement terrain valide.' };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.prepareDriverWalletPayout(
      'wallet-1',
      payload,
      auth as never,
    );

    expect(adminDriverPayoutsService.prepareDriverWalletPayout).toHaveBeenCalledWith(
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
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
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
      adminDriverPayoutsService.recordDriverWalletRecoveryAdjustment,
    ).toHaveBeenCalledWith('wallet-1', payload, auth);
  });

  it('delegates driver payout CSV settlement exports with auth', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const query = { status: 'PREPARED' };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.driverPayoutSettlementCsv(query as never, auth as never);

    expect(adminDriverPayoutsService.driverPayoutSettlementCsv).toHaveBeenCalledWith(
      query,
      auth,
    );
  });

  it('delegates driver onboarding CSV exports with auth', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const query = {
      guidanceFilter: 'review',
      searchQuery: 'permis',
      limit: 50,
    };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.driverOnboardingExportCsv(query as never, auth as never);

    expect(adminDriverOnboardingService.driverOnboardingExportCsv).toHaveBeenCalledWith(
      query,
      auth,
    );
  });

  it('delegates driver onboarding export history reads', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const query = {
      page: 1,
      pageSize: 8,
    };

    await controller.driverOnboardingExportHistory(query as never);

    expect(adminDriverOnboardingService.driverOnboardingExportHistory).toHaveBeenCalledWith(
      query,
    );
  });

  it('delegates driver document object verification updates with auth', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
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
      adminDriverOnboardingService.updateDriverDocumentObjectVerification,
    ).toHaveBeenCalledWith('driver-1', 'doc-1', payload, auth);
  });

  it('delegates provider driver document object verification with auth', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.verifyDriverDocumentObjectFromProvider(
      'driver-1',
      'doc-1',
      auth as never,
    );

    expect(
      adminDriverOnboardingService.verifyDriverDocumentObjectFromProvider,
    ).toHaveBeenCalledWith('driver-1', 'doc-1', auth);
  });

  it('delegates dispatch settings updates with the current auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
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
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();

    await controller.pricingCalibration();

    expect(adminService.pricingCalibration).toHaveBeenCalled();
  });

  it('delegates launch readiness reads to the admin service', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();

    await controller.launchReadiness();

    expect(adminService.launchReadiness).toHaveBeenCalled();
  });

  it('delegates launch readiness action acknowledgements with auth', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
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
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const query = {
      page: 1,
      pageSize: 10,
      provider: 'FLUTTERWAVE',
    };

    await controller.paymentWebhookEvents(query as never);

    expect(adminPaymentWebhooksService.paymentWebhookEvents).toHaveBeenCalledWith(query);
  });

  it('delegates payment webhook event detail reads to the admin service', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();

    await controller.paymentWebhookEventDetail('webhook-event-1');

    expect(adminPaymentWebhooksService.paymentWebhookEventDetail).toHaveBeenCalledWith(
      'webhook-event-1',
    );
  });

  it('delegates payment webhook investigation starts with the current auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.startPaymentWebhookInvestigation(
      'webhook-event-1',
      auth as never,
    );

    expect(adminPaymentWebhooksService.startPaymentWebhookInvestigation).toHaveBeenCalledWith(
      'webhook-event-1',
      auth,
    );
  });

  it('delegates provider payment verification with the current auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.verifyPaymentAttemptWithProvider(
      'payment-1',
      auth as never,
    );

    expect(adminPaymentWebhooksService.verifyPaymentAttemptWithProvider).toHaveBeenCalledWith(
      'payment-1',
      auth,
    );
  });

  it('delegates payment refunds with payload and auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const payload = {
      reason: 'Course annulee apres debit.',
    };
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.refundPaymentAttempt('payment-1', payload, auth as never);

    expect(adminPaymentWebhooksService.refundPaymentAttempt).toHaveBeenCalledWith(
      'payment-1',
      payload,
      auth,
    );
  });

  it('delegates payment webhook replays with the current auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const auth = {
      user: { id: 'ops-1', role: 'OPS' },
    };

    await controller.replayPaymentWebhookEvent(
      'webhook-event-1',
      auth as never,
    );

    expect(adminPaymentWebhooksService.replayPaymentWebhookEvent).toHaveBeenCalledWith(
      'webhook-event-1',
      auth,
    );
  });

  it('delegates health incident acknowledgement with the current auth context', () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
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
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
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
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const query = { status: 'COMPLETED', limit: 100 };
    const auth = { user: { id: 'admin-1', role: 'ADMIN' } };

    await controller.tripsExportCsv(query as never, auth as never);

    expect(adminService.tripsExportCsv).toHaveBeenCalledWith(query, auth);
  });

  it('trips/export.csv is restricted to ADMIN and OPS roles', () => {
    const { controller } = createController();
    const roles: UserRole[] = Reflect.getMetadata(
      ROLES_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
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
      // eslint-disable-next-line @typescript-eslint/unbound-method
      controller.tripsExportCsv,
    ) as unknown[];
    expect(guards).toContain(SessionAuthGuard);
    expect(guards).toContain(RolesGuard);
  });

  it('delegates driver account list reads to the admin service', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const query = {
      page: 1,
      pageSize: 30,
      search: 'bakary',
      status: 'ACTIVE',
    };

    await controller.listDrivers(query as never);

    expect(adminUsersService.listDrivers).toHaveBeenCalledWith(query);
  });

  it('allows ADMIN, OPS and SUPPORT to list drivers', () => {
    const handler = AdminController.prototype['listDrivers'];
    const roles: UserRole[] = Reflect.getMetadata(
      ROLES_KEY,
      handler,
    ) as UserRole[];

    expect(roles).toContain(UserRole.ADMIN);
    expect(roles).toContain(UserRole.OPS);
    expect(roles).toContain(UserRole.SUPPORT);
  });

  it('requires session auth guard on the drivers list endpoint', () => {
    const handler = AdminController.prototype['listDrivers'];
    const guards: unknown[] = Reflect.getMetadata(
      GUARDS_METADATA,
      handler,
    ) as unknown[];

    expect(guards).toContain(SessionAuthGuard);
    expect(guards).toContain(RolesGuard);
  });

  it('delegates trips audit reads to the admin service', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const query = { lookbackHours: 48 };

    await controller.tripsAudit(query as never);

    expect(adminService.tripsAudit).toHaveBeenCalledWith(query);
  });

  it('allows ADMIN, OPS and SUPPORT to read trips audit', () => {
    const handler = AdminController.prototype['tripsAudit'];
    const roles: UserRole[] = Reflect.getMetadata(
      ROLES_KEY,
      handler,
    ) as UserRole[];

    expect(roles).toContain(UserRole.ADMIN);
    expect(roles).toContain(UserRole.OPS);
    expect(roles).toContain(UserRole.SUPPORT);
  });

  it('delegates job queue reads to the admin service', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const query = { page: 1, pageSize: 20 };

    await controller.jobQueue(query as never);

    expect(adminService.jobQueue).toHaveBeenCalledWith(query);
  });

  it('delegates dead-letter job requeue with auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const auth = { user: { id: 'ops-1', role: 'OPS' } };

    await controller.requeueJob('job-dead-1', auth as never);

    expect(adminService.requeueJob).toHaveBeenCalledWith('job-dead-1', auth);
  });

  it('restricts job requeue to ADMIN and OPS — SUPPORT is excluded', () => {
    const handler = AdminController.prototype['requeueJob'];
    const roles: UserRole[] = Reflect.getMetadata(
      ROLES_KEY,
      handler,
    ) as UserRole[];

    expect(roles).toContain(UserRole.ADMIN);
    expect(roles).toContain(UserRole.OPS);
    expect(roles).not.toContain(UserRole.SUPPORT);
  });

  it('delegates driver suspension with payload and auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const payload = { reason: 'Comportement inapproprie signale.' };
    const auth = { user: { id: 'ops-1', role: 'OPS' } };

    await controller.suspendDriver('driver-1', payload as never, auth as never);

    expect(adminDriverOnboardingService.suspendDriver).toHaveBeenCalledWith(
      'driver-1',
      payload,
      auth,
    );
  });

  it('allows ADMIN and OPS to suspend drivers — SUPPORT is excluded', () => {
    const handler = AdminController.prototype['suspendDriver'];
    const roles: UserRole[] = Reflect.getMetadata(
      ROLES_KEY,
      handler,
    ) as UserRole[];

    expect(roles).toContain(UserRole.ADMIN);
    expect(roles).toContain(UserRole.OPS);
    expect(roles).not.toContain(UserRole.SUPPORT);
  });

  it('delegates driver reactivation with auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const auth = { user: { id: 'admin-1', role: 'ADMIN' } };

    await controller.reactivateDriver('driver-1', auth as never);

    expect(adminDriverOnboardingService.reactivateDriver).toHaveBeenCalledWith(
      'driver-1',
      auth,
    );
  });

  it('restricts driver reactivation to ADMIN only — OPS and SUPPORT are excluded', () => {
    const handler = AdminController.prototype['reactivateDriver'];
    const roles: UserRole[] = Reflect.getMetadata(
      ROLES_KEY,
      handler,
    ) as UserRole[];

    expect(roles).toContain(UserRole.ADMIN);
    expect(roles).not.toContain(UserRole.OPS);
    expect(roles).not.toContain(UserRole.SUPPORT);
  });

  it('delegates promo code list reads to the admin service', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();

    await controller.listPromoCodes();

    expect(adminPromoCodesService.listPromoCodes).toHaveBeenCalled();
  });

  it('restricts promo code listing to ADMIN and OPS — SUPPORT is excluded', () => {
    const handler = AdminController.prototype['listPromoCodes'];
    const roles: UserRole[] = Reflect.getMetadata(
      ROLES_KEY,
      handler,
    ) as UserRole[];

    expect(roles).toContain(UserRole.ADMIN);
    expect(roles).toContain(UserRole.OPS);
    expect(roles).not.toContain(UserRole.SUPPORT);
  });

  it('delegates promo code creation with payload and auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const payload = { code: 'PILOTE10', discountBps: 1000, maxUses: 100 };
    const auth = { user: { id: 'admin-1', role: 'ADMIN' } };

    await controller.createPromoCode(payload as never, auth as never);

    expect(adminPromoCodesService.createPromoCode).toHaveBeenCalledWith(payload, auth);
  });

  it('restricts promo code creation to ADMIN only — OPS and SUPPORT are excluded', () => {
    const handler = AdminController.prototype['createPromoCode'];
    const roles: UserRole[] = Reflect.getMetadata(
      ROLES_KEY,
      handler,
    ) as UserRole[];

    expect(roles).toContain(UserRole.ADMIN);
    expect(roles).not.toContain(UserRole.OPS);
    expect(roles).not.toContain(UserRole.SUPPORT);
  });

  it('delegates promo code deactivation with auth context', async () => {
    const { adminService, adminSupportService, adminUsersService, adminPromoCodesService, adminDriverOnboardingService, adminDriverPayoutsService, adminPaymentWebhooksService, controller } = createController();
    const auth = { user: { id: 'admin-1', role: 'ADMIN' } };

    await controller.deactivatePromoCode('promo-1', auth as never);

    expect(adminPromoCodesService.deactivatePromoCode).toHaveBeenCalledWith(
      'promo-1',
      auth,
    );
  });

  it('restricts promo code deactivation to ADMIN only — OPS and SUPPORT are excluded', () => {
    const handler = AdminController.prototype['deactivatePromoCode'];
    const roles: UserRole[] = Reflect.getMetadata(
      ROLES_KEY,
      handler,
    ) as UserRole[];

    expect(roles).toContain(UserRole.ADMIN);
    expect(roles).not.toContain(UserRole.OPS);
    expect(roles).not.toContain(UserRole.SUPPORT);
  });
});
