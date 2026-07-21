/**
 * AdminSupportService
 *
 * Responsabilité unique: gestion des tickets support passager/chauffeur.
 * Assure la confidentialité des données (redaction, masquage) et notifie
 * les utilisateurs lors des mises à jour de statut.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationChannel,
  Prisma,
  SupportTicketStatus,
  UserRole,
  WalletTransactionType,
} from '@prisma/client';
import {
  PageQueryDto,
  resolvePageQuery,
} from '../../common/dto/page-query.dto';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';

// ── Types de réponse ──────────────────────────────────────────────────────────

export type AdminSupportTicketQueueResponse = {
  tickets: Array<{
    id: string;
    subject: string;
    description: string;
    status: SupportTicketStatus;
    priority: number;
    adminNote: string | null;
    requesterName: string;
    requesterRole: UserRole;
    tripId: string | null;
    paymentAttemptId: string | null;
    category: SupportTicketOpsCategory;
    actionHint: string;
    createdAt: string;
    updatedAt: string;
    sla: SupportTicketSla;
  }>;
  staffing: SupportStaffingReadiness;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

type SupportTicketSla = {
  tier: 'critical' | 'standard' | 'normal';
  targetMinutes: number;
  dueAt: string;
  respondedAt: string | null;
  state: 'on_track' | 'due_soon' | 'breached' | 'responded' | 'closed';
  remainingMinutes: number | null;
  breachedMinutes: number | null;
  owner: 'support' | 'ops';
};

type SupportTicketOpsCategory =
  | 'safety'
  | 'payment'
  | 'refund'
  | 'fare_review'
  | 'rider_cancellation'
  | 'driver_cancellation'
  | 'quality_review'
  | 'mobile_health'
  | 'onboarding'
  | 'general';

type SupportStaffingReadiness = {
  posture: 'ready' | 'strained' | 'blocked';
  action: string;
  activeTickets: number;
  urgentTickets: number;
  breachedSlaTickets: number;
  dueSoonTickets: number;
  ownerLoad: Array<{
    owner: 'support' | 'ops';
    activeTickets: number;
    urgentTickets: number;
    breachedSlaTickets: number;
  }>;
};

export type AdminSupportTicketUpdateResponse = {
  ticket: {
    id: string;
    status: SupportTicketStatus;
    priority: number;
    adminNote: string | null;
    updatedAt: string;
  };
};

export type AdminCancellationCompensationResponse = {
  action: 'credited' | 'already_credited';
  compensation: {
    ticketId: string;
    tripId: string;
    driverUserId: string;
    walletId: string;
    transactionId: string;
    reference: string;
    amount: number;
    currency: string;
  };
};

// ── Helpers de confidentialité ────────────────────────────────────────────────

const sensitiveSupportTokenPattern =
  /\b(password|mot de passe|mdp|code|pin|token|secret)\b/gi;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phonePattern = /\+?\d[\d\s().-]{7,}\d/g;

function redactSupportText(value: string): string {
  return value
    .replace(sensitiveSupportTokenPattern, '[CONFIDENTIEL]')
    .replace(emailPattern, '[EMAIL]')
    .replace(phonePattern, '[TÉLÉPHONE]');
}

function maskRequesterName(fullName: string | null | undefined): string {
  if (!fullName?.trim()) return 'Utilisateur anonyme';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0]?.charAt(0) ?? '?'}.`;
  return `${parts[0]} ${parts[1]?.charAt(0) ?? '?'}.`;
}

function extractSupportTicketTripId(ticket: {
  subject: string;
  description: string;
}) {
  const match =
    ticket.subject.match(/(?:Incident trajet|course) ([a-z0-9-]+)/i) ??
    ticket.description.match(/(?:Course|Derniere demande|Reference): ([a-z0-9-]+)/i);

  return match?.[1] ?? null;
}

function extractSupportTicketPaymentAttemptId(ticket: {
  subject: string;
  description: string;
}) {
  const match =
    ticket.subject.match(/PaymentAttempt:\s*([A-Za-z0-9_-]+)/i) ??
    ticket.description.match(/PaymentAttempt:\s*([A-Za-z0-9_-]+)/i) ??
    ticket.description.match(/Tentative paiement:\s*([A-Za-z0-9_-]+)/i);

  return match?.[1] ?? null;
}

function extractCancellationCompensationAmount(description: string) {
  const match = description.match(
    /Compensation chauffeur suggeree:\s*([0-9]{2,5})\s*XOF/i,
  );
  const amount = match ? Number(match[1]) : 0;

  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000) {
    return null;
  }

  return amount;
}

function resolveSupportTicketOpsClassification(ticket: {
  subject: string;
  description: string;
  priority: number;
}): { category: SupportTicketOpsCategory; actionHint: string } {
  const text = `${ticket.subject} ${ticket.description}`.toLowerCase();

  if (text.includes('sos') || text.includes('safety') || text.includes('securite')) {
    return {
      category: 'safety',
      actionHint: 'Traiter immediatement: verifier securite, appeler si necessaire, garder trace ops.',
    };
  }

  if (text.includes('annulations chauffeur') || text.includes('annulation chauffeur')) {
    return {
      category: 'driver_cancellation',
      actionHint: 'Verifier le motif chauffeur, le contexte terrain et appliquer pause/revue si abus confirme.',
    };
  }

  if (text.includes('annulation rider') || text.includes('frais annulation') || text.includes('annulation a revoir')) {
    return {
      category: 'rider_cancellation',
      actionHint: 'Verifier assignation chauffeur, temps perdu et frais rond avant toute decision.',
    };
  }

  if (text.includes('revue qualite') || text.includes('note faible')) {
    return {
      category: 'quality_review',
      actionHint: 'Lire la note, verifier le trajet et contacter rider/chauffeur si le signal est repetitif ou grave.',
    };
  }

  if (text.includes('remboursement') || text.includes('refund')) {
    return {
      category: 'refund',
      actionHint: 'Verifier tentative paiement, statut provider et journal webhook avant reponse client.',
    };
  }

  if (text.includes('paiement') || text.includes('payment') || text.includes('mobile money')) {
    return {
      category: 'payment',
      actionHint: 'Controler debit, reconciliation provider et ticket paiement avant escalade finance.',
    };
  }

  if (text.includes('prix') || text.includes('fare') || text.includes('tarif')) {
    return {
      category: 'fare_review',
      actionHint: 'Comparer prix affiche, prix facture, distance et arrondissement commercial.',
    };
  }

  if (text.includes('mobile') || text.includes('crash') || text.includes('erreur app')) {
    return {
      category: 'mobile_health',
      actionHint: 'Identifier version app, surface mobile et impact utilisateur avant cloture.',
    };
  }

  if (text.includes('onboarding') || text.includes('document chauffeur')) {
    return {
      category: 'onboarding',
      actionHint: 'Verifier documents, note interne et prochaine action onboarding chauffeur.',
    };
  }

  return {
    category: 'general',
    actionHint:
      ticket.priority >= 2
        ? 'Qualifier le ticket puis router vers support, ops ou finance.'
        : 'Lire le contexte et repondre avec une action claire.',
  };
}

function resolveSupportSla(ticket: {
  priority: number;
  status: SupportTicketStatus;
  adminNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SupportTicketSla {
  const targetMinutes = ticket.priority >= 3 ? 10 : ticket.priority === 2 ? 30 : 120;
  const tier =
    ticket.priority >= 3
      ? ('critical' as const)
      : ticket.priority === 2
        ? ('standard' as const)
        : ('normal' as const);
  const owner = ticket.priority >= 3 ? ('ops' as const) : ('support' as const);
  const dueAt = new Date(ticket.createdAt.getTime() + targetMinutes * 60_000);
  const isClosed =
    ticket.status === SupportTicketStatus.RESOLVED ||
    ticket.status === SupportTicketStatus.CLOSED;
  const respondedAt =
    ticket.status !== SupportTicketStatus.OPEN || ticket.adminNote
      ? ticket.updatedAt
      : null;
  const now = new Date();
  const remainingMinutes = Math.ceil((dueAt.getTime() - now.getTime()) / 60_000);
  const breachedMinutes = remainingMinutes < 0 ? Math.abs(remainingMinutes) : null;
  const state =
    isClosed
      ? ('closed' as const)
      : respondedAt
        ? ('responded' as const)
        : remainingMinutes < 0
          ? ('breached' as const)
          : remainingMinutes <= Math.max(5, Math.ceil(targetMinutes * 0.2))
            ? ('due_soon' as const)
            : ('on_track' as const);

  return {
    tier,
    targetMinutes,
    dueAt: dueAt.toISOString(),
    respondedAt: respondedAt?.toISOString() ?? null,
    state,
    remainingMinutes: state === 'on_track' || state === 'due_soon' ? remainingMinutes : null,
    breachedMinutes,
    owner,
  };
}

function resolveSupportStaffingReadiness(
  tickets: Array<{ status: SupportTicketStatus; priority: number; sla: SupportTicketSla }>,
): SupportStaffingReadiness {
  const activeTickets = tickets.filter(
    (ticket) =>
      ticket.status === SupportTicketStatus.OPEN ||
      ticket.status === SupportTicketStatus.IN_REVIEW,
  );
  const urgentTickets = activeTickets.filter((ticket) => ticket.priority >= 3);
  const breachedSlaTickets = activeTickets.filter(
    (ticket) => ticket.sla.state === 'breached',
  );
  const dueSoonTickets = activeTickets.filter(
    (ticket) => ticket.sla.state === 'due_soon',
  );
  const posture =
    breachedSlaTickets.length > 0 || urgentTickets.length >= 3
      ? ('blocked' as const)
      : dueSoonTickets.length > 0 || activeTickets.length > 5
        ? ('strained' as const)
        : ('ready' as const);
  const ownerLoad = (['ops', 'support'] as const).map((owner) => {
    const ownerTickets = activeTickets.filter((ticket) => ticket.sla.owner === owner);
    return {
      owner,
      activeTickets: ownerTickets.length,
      urgentTickets: ownerTickets.filter((ticket) => ticket.priority >= 3).length,
      breachedSlaTickets: ownerTickets.filter(
        (ticket) => ticket.sla.state === 'breached',
      ).length,
    };
  });

  return {
    posture,
    action:
      posture === 'blocked'
        ? 'Bloquer extension pilote: assigner une permanence ops/support et traiter les SLA en retard avant nouveau volume.'
        : posture === 'strained'
          ? 'Garder le pilote limite: ajouter renfort support ou reduire les tickets actifs avant pic demande.'
          : 'Permanence support compatible avec un pilote encadre; maintenir surveillance SLA.',
    activeTickets: activeTickets.length,
    urgentTickets: urgentTickets.length,
    breachedSlaTickets: breachedSlaTickets.length,
    dueSoonTickets: dueSoonTickets.length,
    ownerLoad,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AdminSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async supportTickets(
    query: PageQueryDto = new PageQueryDto(),
  ): Promise<AdminSupportTicketQueueResponse> {
    const { page, pageSize, skip, take } = resolvePageQuery(query);

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        skip,
        take,
        include: {
          user: { select: { fullName: true, role: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.supportTicket.count(),
    ]);

    const queueTickets = tickets.map((ticket) => {
        const classification = resolveSupportTicketOpsClassification(ticket);
        const tripId = extractSupportTicketTripId(ticket);
        const paymentAttemptId = extractSupportTicketPaymentAttemptId(ticket);
        return {
          id: ticket.id,
          subject: redactSupportText(ticket.subject),
          description: redactSupportText(ticket.description),
          status: ticket.status,
          priority: ticket.priority,
          adminNote: ticket.adminNote ?? null,
          requesterName: maskRequesterName(ticket.user.fullName),
          requesterRole: ticket.user.role,
          tripId,
          paymentAttemptId,
          category: classification.category,
          actionHint: classification.actionHint,
          createdAt: ticket.createdAt.toISOString(),
          updatedAt: ticket.updatedAt.toISOString(),
          sla: resolveSupportSla(ticket),
        };
      });

    return {
      tickets: queueTickets,
      staffing: resolveSupportStaffingReadiness(queueTickets),
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }

  async updateSupportTicket(
    ticketId: string,
    payload: {
      status?: SupportTicketStatus;
      priority?: number;
      adminNote?: string;
    },
    auth: RequestAuthContext,
  ): Promise<AdminSupportTicketUpdateResponse> {
    const existing = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!existing) {
      throw new NotFoundException('Support ticket not found.');
    }

    if (
      payload.priority !== undefined &&
      (payload.priority < 1 || payload.priority > 5)
    ) {
      throw new BadRequestException('Priority must be between 1 and 5.');
    }

    const trimmedNote = payload.adminNote?.trim() ?? undefined;

    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: payload.status ?? existing.status,
        priority: payload.priority ?? existing.priority,
        ...(trimmedNote !== undefined ? { adminNote: trimmedNote || null } : {}),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'SUPPORT_TICKET_UPDATED',
        entityType: 'SUPPORT_TICKET',
        entityId: updated.id,
        metadata: {
          status: updated.status,
          priority: updated.priority,
          hasAdminNote: updated.adminNote !== null,
        },
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'support-ticket.updated',
      entityId: updated.id,
      actorRole: auth.user.role,
      payload: { status: updated.status, priority: updated.priority },
    });

    const shouldNotifyUser =
      trimmedNote !== undefined ||
      payload.status === 'RESOLVED' ||
      payload.status === 'CLOSED';

    if (shouldNotifyUser) {
      const notifTitle =
        updated.status === 'RESOLVED' || updated.status === 'CLOSED'
          ? 'Ticket support résolu'
          : 'Réponse du support';
      const notifBody = trimmedNote
        ? `L'équipe support a répondu à votre demande "${updated.subject.slice(0, 40)}".`
        : `Votre ticket "${updated.subject.slice(0, 40)}" a été mis à jour.`;

      void this.notificationsService.enqueue({
        userId: existing.userId,
        title: notifTitle,
        body: notifBody,
        channel: NotificationChannel.PUSH,
        dedupeKey: `support-ticket-update:${updated.id}:${updated.updatedAt.getTime()}`,
        data: {
          type: 'support_ticket_updated',
          ticketId: updated.id,
          status: updated.status,
        },
      });
    }

    return {
      ticket: {
        id: updated.id,
        status: updated.status,
        priority: updated.priority,
        adminNote: updated.adminNote,
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  async approveCancellationCompensation(
    ticketId: string,
    auth: RequestAuthContext,
  ): Promise<AdminCancellationCompensationResponse> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found.');
    }

    const classification = resolveSupportTicketOpsClassification(ticket);

    if (classification.category !== 'rider_cancellation') {
      throw new BadRequestException(
        'Only rider cancellation review tickets can credit driver compensation.',
      );
    }

    const tripId = extractSupportTicketTripId(ticket);
    const amount = extractCancellationCompensationAmount(ticket.description);

    if (!tripId || amount === null) {
      throw new BadRequestException(
        'Cancellation compensation ticket is missing trip or amount context.',
      );
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        driver: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!trip?.driver?.userId) {
      throw new BadRequestException('Trip driver not found for compensation.');
    }

    const currency = trip.currency || 'XOF';
    const driverUserId = trip.driver.userId;
    const reference = `support-cancellation-compensation:${ticketId}:${tripId}`;
    const adminNote = `Revue annulation traitee: indemnisation chauffeur ${amount} ${currency} validee par operations.`;

    const result = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: {
          userId_currency: {
            userId: driverUserId,
            currency,
          },
        },
        create: {
          userId: driverUserId,
          currency,
          balance: new Prisma.Decimal(0),
        },
        update: {},
      });

      if (wallet.isLocked) {
        throw new BadRequestException('Driver wallet is locked.');
      }

      const existingTransaction = await tx.walletTransaction.findUnique({
        where: {
          walletId_reference: {
            walletId: wallet.id,
            reference,
          },
        },
      });

      if (existingTransaction) {
        await tx.supportTicket.update({
          where: { id: ticketId },
          data: {
            status: SupportTicketStatus.IN_REVIEW,
            adminNote,
          },
        });

        return {
          action: 'already_credited' as const,
          wallet,
          transaction: existingTransaction,
        };
      }

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.CREDIT,
          amount: new Prisma.Decimal(amount),
          reference,
          description: `Indemnisation annulation rider ${tripId}`,
          metadata: {
            ticketId,
            tripId,
            approvedByUserId: auth.user.id,
            source: 'support_rider_cancellation_compensation',
          },
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            increment: new Prisma.Decimal(amount),
          },
        },
      });

      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: SupportTicketStatus.IN_REVIEW,
          adminNote,
        },
      });

      return {
        action: 'credited' as const,
        wallet,
        transaction,
      };
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'SUPPORT_CANCELLATION_COMPENSATION_APPROVED',
        entityType: 'SUPPORT_TICKET',
        entityId: ticketId,
        metadata: {
          tripId,
          driverUserId,
          walletId: result.wallet.id,
          transactionId: result.transaction.id,
          reference,
          amount,
          currency,
          action: result.action,
        },
      },
    });

    this.realtimeService.publish({
      channel: 'admin',
      type: 'support-ticket.updated',
      entityId: ticketId,
      actorRole: auth.user.role,
      payload: {
        status: SupportTicketStatus.IN_REVIEW,
        category: 'rider_cancellation',
        compensationAmount: amount,
        compensationAction: result.action,
      },
    });

    if (result.action === 'credited') {
      void this.notificationsService.enqueue({
        userId: driverUserId,
        title: 'Indemnisation annulation validee',
        body: `${amount} ${currency} ont ete credites pour le temps perdu sur une course annulee.`,
        channel: NotificationChannel.PUSH,
        dedupeKey: reference,
        data: {
          type: 'driver_cancellation_compensation',
          ticketId,
          tripId,
          amount: String(amount),
          currency,
        },
      });
    }

    return {
      action: result.action,
      compensation: {
        ticketId,
        tripId,
        driverUserId,
        walletId: result.wallet.id,
        transactionId: result.transaction.id,
        reference,
        amount,
        currency,
      },
    };
  }
}
