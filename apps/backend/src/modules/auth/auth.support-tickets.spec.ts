import { AuthService } from './auth.service';

/**
 * OWASP API3 (Excessive Data Exposure) + OWASP API1 (Broken Object Level Auth):
 * - Un utilisateur ne peut voir que ses propres tickets (filtre userId strict)
 * - Aucune donnée d'un autre utilisateur ne fuite dans la réponse
 * - Limite 5 créations/min côté controller — le service lui-même n'est pas limité
 */

function createService() {
  const prisma = {
    supportTicket: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    userSession: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (ops: unknown[]) =>
      Promise.all(ops.map((op) => Promise.resolve(op))),
    ),
  };

  const notifications = {
    enqueue: jest.fn().mockResolvedValue({ notification: { id: 'notif-1' } }),
  };

  const service = new AuthService(prisma as never, notifications as never);

  const auth = {
    token: 'tok',
    session: { id: 'sess-1' },
    user: {
      id: 'user-1',
      role: 'RIDER',
      fullName: 'Awa Rider',
      riderProfile: { id: 'rider-1' },
      driverProfile: null,
    },
  };

  return { prisma, service, auth };
}

describe('AuthService — support tickets', () => {
  describe('createSupportTicket', () => {
    it('crée un ticket avec les données fournies par le passager', async () => {
      const { prisma, service, auth } = createService();
      const now = new Date();
      prisma.supportTicket.create.mockResolvedValue({
        id: 'ticket-1',
        subject: 'Problème de paiement',
        description: 'Mon paiement a été débité mais la course est annulée.',
        status: 'OPEN',
        priority: 1,
        createdAt: now,
      });

      const result = await service.createSupportTicket(auth as never, {
        subject: 'Problème de paiement',
        description: 'Mon paiement a été débité mais la course est annulée.',
        category: 'payment',
      });

      expect(result.ticket.id).toBe('ticket-1');
      expect(result.ticket.status).toBe('OPEN');
      expect(result.ticket.createdAt).toBe(now.toISOString());
    });

    it('associe le ticket à userId de l\'utilisateur authentifié', async () => {
      const { prisma, service, auth } = createService();
      prisma.supportTicket.create.mockResolvedValue({
        id: 'ticket-1',
        subject: 'Sujet',
        description: 'Description suffisamment longue.',
        status: 'OPEN',
        priority: 1,
        createdAt: new Date(),
      });

      await service.createSupportTicket(auth as never, {
        subject: 'Sujet',
        description: 'Description suffisamment longue.',
      });

      expect(prisma.supportTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });

    it('affecte priorité 3 (haute) aux tickets de sécurité', async () => {
      const { prisma, service, auth } = createService();
      prisma.supportTicket.create.mockResolvedValue({
        id: 'ticket-safe',
        subject: 'Chauffeur dangereux',
        description: 'Le chauffeur a conduit de façon très dangereuse.',
        status: 'OPEN',
        priority: 3,
        createdAt: new Date(),
      });

      await service.createSupportTicket(auth as never, {
        subject: 'Chauffeur dangereux',
        description: 'Le chauffeur a conduit de façon très dangereuse.',
        category: 'safety',
      });

      expect(prisma.supportTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priority: 3 }),
        }),
      );
    });

    it('affecte priorité 1 (normale) aux catégories non-sécurité', async () => {
      const { prisma, service, auth } = createService();
      prisma.supportTicket.create.mockResolvedValue({
        id: 'ticket-2',
        subject: 'Question compte',
        description: 'Comment modifier mon email?',
        status: 'OPEN',
        priority: 1,
        createdAt: new Date(),
      });

      await service.createSupportTicket(auth as never, {
        subject: 'Question compte',
        description: 'Comment modifier mon email?',
        category: 'account',
      });

      expect(prisma.supportTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priority: 1 }),
        }),
      );
    });

    it('ne retourne que les champs sans données sensibles', async () => {
      const { prisma, service, auth } = createService();
      prisma.supportTicket.create.mockResolvedValue({
        id: 'ticket-1',
        subject: 'Test',
        description: 'Description test.',
        status: 'OPEN',
        priority: 1,
        createdAt: new Date(),
      });

      const result = await service.createSupportTicket(auth as never, {
        subject: 'Test',
        description: 'Description test.',
      });

      const keys = Object.keys(result.ticket);
      expect(keys).not.toContain('userId');
      expect(keys).toContain('id');
      expect(keys).toContain('status');
      expect(keys).toContain('createdAt');
    });
  });

  describe('getMySupportTickets', () => {
    it('filtre strictement par userId de l\'utilisateur authentifié', async () => {
      const { prisma, service, auth } = createService();
      prisma.supportTicket.findMany.mockResolvedValue([]);

      await service.getMySupportTickets(auth as never);

      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        }),
      );
    });

    it('retourne les tickets dans l\'ordre décroissant (plus récent en premier)', async () => {
      const { prisma, service, auth } = createService();
      prisma.supportTicket.findMany.mockResolvedValue([]);

      await service.getMySupportTickets(auth as never);

      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('limite à 20 tickets maximum (protection contre les réponses trop larges)', async () => {
      const { prisma, service, auth } = createService();
      prisma.supportTicket.findMany.mockResolvedValue([]);

      await service.getMySupportTickets(auth as never);

      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });

    it('sérialise les dates en ISO string', async () => {
      const { prisma, service, auth } = createService();
      const now = new Date('2026-05-24T10:00:00.000Z');
      prisma.supportTicket.findMany.mockResolvedValue([
        {
          id: 'ticket-1',
          subject: 'Test',
          description: 'Description.',
          status: 'IN_REVIEW',
          priority: 1,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = await service.getMySupportTickets(auth as never);

      expect(result.tickets[0].createdAt).toBe('2026-05-24T10:00:00.000Z');
      expect(result.tickets[0].updatedAt).toBe('2026-05-24T10:00:00.000Z');
    });

    it('retourne un tableau vide quand l\'utilisateur n\'a pas de tickets', async () => {
      const { prisma, service, auth } = createService();
      prisma.supportTicket.findMany.mockResolvedValue([]);

      const result = await service.getMySupportTickets(auth as never);

      expect(result.tickets).toHaveLength(0);
    });
  });
});
