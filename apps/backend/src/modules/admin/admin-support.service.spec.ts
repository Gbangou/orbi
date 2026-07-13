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
    auditLog: {
      create: jest.fn(),
    },
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
});
