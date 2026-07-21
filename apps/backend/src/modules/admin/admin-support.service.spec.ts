import { SupportTicketStatus, UserRole } from '@prisma/client';
import { AdminSupportService } from './admin-support.service';

function createService() {
  const prisma = {
    supportTicket: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    trip: {
      findUnique: jest.fn(),
    },
    wallet: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    walletTransaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
  };
  const realtimeService = {
    publish: jest.fn(),
  };
  const notificationsService = {
    enqueue: jest.fn(),
  };

  return {
    prisma,
    realtimeService,
    notificationsService,
    service: new AdminSupportService(
      prisma as never,
      realtimeService as never,
      notificationsService as never,
    ),
  };
}

describe('AdminSupportService', () => {
  it('exposes SLA state and privacy-minimized support queue fields', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date(Date.now() - 20 * 60_000);

    prisma.supportTicket.findMany.mockResolvedValue([
      {
        id: 'ticket-1',
        subject: 'Incident trajet tripabc123 pour awa@orbi.test',
        description:
          'Type: SAFETY_ALERT phone +226 70 00 00 00 token=secret-session-token',
        status: SupportTicketStatus.OPEN,
        priority: 3,
        adminNote: null,
        createdAt,
        updatedAt: createdAt,
        user: {
          fullName: 'Awa Rider',
          role: UserRole.RIDER,
        },
      },
    ]);
    prisma.supportTicket.count.mockResolvedValue(1);

    const result = await service.supportTickets({ page: 1, pageSize: 10 });

    expect(result.tickets[0]).toEqual(
      expect.objectContaining({
        id: 'ticket-1',
        subject: 'Incident trajet tripabc123 pour [EMAIL]',
        description:
          'Type: SAFETY_ALERT phone [TÉLÉPHONE] [CONFIDENTIEL]=[CONFIDENTIEL]-session-[CONFIDENTIEL]',
        requesterName: 'Awa R.',
        tripId: 'tripabc123',
        category: 'safety',
        actionHint: expect.stringContaining('Traiter immediatement'),
        sla: expect.objectContaining({
          tier: 'critical',
          targetMinutes: 10,
          state: 'breached',
          owner: 'ops',
          respondedAt: null,
        }),
      }),
    );
    expect(result.tickets[0].sla.breachedMinutes).toBeGreaterThanOrEqual(9);
    expect(result.staffing).toMatchObject({
      posture: 'blocked',
      activeTickets: 1,
      urgentTickets: 1,
      breachedSlaTickets: 1,
      dueSoonTickets: 0,
      ownerLoad: expect.arrayContaining([
        expect.objectContaining({
          owner: 'ops',
          activeTickets: 1,
          urgentTickets: 1,
          breachedSlaTickets: 1,
        }),
      ]),
    });
    expect(result.staffing.action).toContain('Bloquer extension pilote');
  });

  it('classifies cancellation review tickets for ops triage', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date(Date.now() - 8 * 60_000);

    prisma.supportTicket.findMany.mockResolvedValue([
      {
        id: 'ticket-cancel-driver',
        subject: 'Revue annulations chauffeur trip-driver-cancel-1',
        description:
          'Annulations chauffeur repetees apres acceptation. Course: trip-driver-cancel-1. Pause recommandee: 30 minutes.',
        status: SupportTicketStatus.OPEN,
        priority: 2,
        adminNote: null,
        createdAt,
        updatedAt: createdAt,
        user: {
          fullName: 'Issa Driver',
          role: UserRole.DRIVER,
        },
      },
    ]);
    prisma.supportTicket.count.mockResolvedValue(1);

    const result = await service.supportTickets({ page: 1, pageSize: 10 });

    expect(result.tickets[0]).toEqual(
      expect.objectContaining({
        category: 'driver_cancellation',
        tripId: 'trip-driver-cancel-1',
        actionHint: expect.stringContaining('pause/revue'),
      }),
    );
  });

  it('surfaces payment attempt context for refund tickets', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date(Date.now() - 6 * 60_000);

    prisma.supportTicket.findMany.mockResolvedValue([
      {
        id: 'ticket-refund',
        subject: 'Remboursement a suivre',
        description:
          'Le passager demande un suivi remboursement.\nPaymentAttempt: payment-1\nPaymentStatus: SUCCEEDED',
        status: SupportTicketStatus.OPEN,
        priority: 2,
        adminNote: null,
        createdAt,
        updatedAt: createdAt,
        user: {
          fullName: 'Awa Rider',
          role: UserRole.RIDER,
        },
      },
    ]);
    prisma.supportTicket.count.mockResolvedValue(1);

    const result = await service.supportTickets({ page: 1, pageSize: 10 });

    expect(result.tickets[0]).toEqual(
      expect.objectContaining({
        category: 'refund',
        paymentAttemptId: 'payment-1',
        actionHint: expect.stringContaining('statut provider'),
      }),
    );
  });

  it('classifies low-rating quality review tickets for ops follow-up', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date(Date.now() - 5 * 60_000);

    prisma.supportTicket.findMany.mockResolvedValue([
      {
        id: 'ticket-quality',
        subject: 'Revue qualite course trip-quality-1',
        description:
          'Note faible recue apres course. Course: trip-quality-1. Score: 2/5.',
        status: SupportTicketStatus.OPEN,
        priority: 2,
        adminNote: null,
        createdAt,
        updatedAt: createdAt,
        user: {
          fullName: 'Awa Rider',
          role: UserRole.RIDER,
        },
      },
    ]);
    prisma.supportTicket.count.mockResolvedValue(1);

    const result = await service.supportTickets({ page: 1, pageSize: 10 });

    expect(result.tickets[0]).toEqual(
      expect.objectContaining({
        category: 'quality_review',
        tripId: 'trip-quality-1',
        actionHint: expect.stringContaining('verifier le trajet'),
      }),
    );
  });

  it('marks SLA as responded after a ticket is taken in review', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date(Date.now() - 5 * 60_000);
    const updatedAt = new Date(Date.now() - 2 * 60_000);

    prisma.supportTicket.findMany.mockResolvedValue([
      {
        id: 'ticket-2',
        subject: 'Paiement bloque',
        description: 'Le paiement mobile money est en attente.',
        status: SupportTicketStatus.IN_REVIEW,
        priority: 2,
        adminNote: null,
        createdAt,
        updatedAt,
        user: {
          fullName: 'Issa Driver',
          role: UserRole.DRIVER,
        },
      },
    ]);
    prisma.supportTicket.count.mockResolvedValue(1);

    const result = await service.supportTickets({ page: 1, pageSize: 10 });

    expect(result.tickets[0].sla).toMatchObject({
      tier: 'standard',
      targetMinutes: 30,
      state: 'responded',
      owner: 'support',
      respondedAt: updatedAt.toISOString(),
    });
    expect(result.staffing).toMatchObject({
      posture: 'ready',
      activeTickets: 1,
      urgentTickets: 0,
      breachedSlaTickets: 0,
    });
  });

  it('credits driver wallet once from a rider cancellation compensation ticket', async () => {
    const { prisma, realtimeService, notificationsService, service } = createService();
    const ticket = {
      id: 'ticket-cancel-rider',
      userId: 'rider-user-1',
      subject: 'Revue frais annulation course trip-rider-cancel-1',
      description:
        'Annulation rider apres acceptation. Course: trip-rider-cancel-1. Frais suggere: 300 XOF. Compensation chauffeur suggeree: 240 XOF.',
      status: SupportTicketStatus.OPEN,
      priority: 2,
      adminNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const wallet = {
      id: 'wallet-driver-1',
      userId: 'driver-user-1',
      currency: 'XOF',
      isLocked: false,
    };
    const transaction = {
      id: 'wallet-tx-1',
      walletId: wallet.id,
      reference:
        'support-cancellation-compensation:ticket-cancel-rider:trip-rider-cancel-1',
    };
    const auth = {
      user: {
        id: 'ops-1',
        role: UserRole.OPS,
      },
    };

    prisma.supportTicket.findUnique.mockResolvedValue(ticket);
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-rider-cancel-1',
      currency: 'XOF',
      driver: {
        userId: 'driver-user-1',
      },
    });
    prisma.wallet.upsert.mockResolvedValue(wallet);
    prisma.walletTransaction.findUnique.mockResolvedValue(null);
    prisma.walletTransaction.create.mockResolvedValue(transaction);
    prisma.supportTicket.update.mockResolvedValue({
      ...ticket,
      status: SupportTicketStatus.IN_REVIEW,
      adminNote:
        'Revue annulation traitee: indemnisation chauffeur 240 XOF validee par operations.',
    });

    const result = await service.approveCancellationCompensation(
      ticket.id,
      auth as never,
    );

    expect(result).toEqual({
      action: 'credited',
      compensation: {
        ticketId: ticket.id,
        tripId: 'trip-rider-cancel-1',
        driverUserId: 'driver-user-1',
        walletId: wallet.id,
        transactionId: transaction.id,
        reference: transaction.reference,
        amount: 240,
        currency: 'XOF',
      },
    });
    expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          walletId: wallet.id,
          type: 'CREDIT',
          reference: transaction.reference,
          description: 'Indemnisation annulation rider trip-rider-cancel-1',
        }),
      }),
    );
    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: wallet.id },
        data: expect.objectContaining({
          balance: expect.objectContaining({ increment: expect.anything() }),
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'SUPPORT_CANCELLATION_COMPENSATION_APPROVED',
          entityId: ticket.id,
          metadata: expect.objectContaining({
            amount: 240,
            action: 'credited',
          }),
        }),
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'support-ticket.updated',
        entityId: ticket.id,
        payload: expect.objectContaining({
          compensationAmount: 240,
          compensationAction: 'credited',
        }),
      }),
    );
    expect(notificationsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'driver-user-1',
        dedupeKey: transaction.reference,
        data: expect.objectContaining({
          type: 'driver_cancellation_compensation',
          amount: '240',
        }),
      }),
    );
  });

  it('does not double-credit repeated cancellation compensation approval', async () => {
    const { prisma, notificationsService, service } = createService();
    const ticket = {
      id: 'ticket-cancel-rider',
      userId: 'rider-user-1',
      subject: 'Revue frais annulation course trip-rider-cancel-1',
      description:
        'Annulation rider apres acceptation. Course: trip-rider-cancel-1. Compensation chauffeur suggeree: 240 XOF.',
      status: SupportTicketStatus.IN_REVIEW,
      priority: 2,
      adminNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const wallet = {
      id: 'wallet-driver-1',
      userId: 'driver-user-1',
      currency: 'XOF',
      isLocked: false,
    };
    const transaction = {
      id: 'wallet-tx-existing',
      walletId: wallet.id,
      reference:
        'support-cancellation-compensation:ticket-cancel-rider:trip-rider-cancel-1',
    };

    prisma.supportTicket.findUnique.mockResolvedValue(ticket);
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-rider-cancel-1',
      currency: 'XOF',
      driver: {
        userId: 'driver-user-1',
      },
    });
    prisma.wallet.upsert.mockResolvedValue(wallet);
    prisma.walletTransaction.findUnique.mockResolvedValue(transaction);
    prisma.supportTicket.update.mockResolvedValue(ticket);

    const result = await service.approveCancellationCompensation(
      ticket.id,
      {
        user: {
          id: 'ops-1',
          role: UserRole.OPS,
        },
      } as never,
    );

    expect(result.action).toBe('already_credited');
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.wallet.update).not.toHaveBeenCalled();
    expect(notificationsService.enqueue).not.toHaveBeenCalled();
  });
});
