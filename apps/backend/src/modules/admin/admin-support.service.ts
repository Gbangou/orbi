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
import { NotificationChannel, SupportTicketStatus, UserRole } from '@prisma/client';
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
    createdAt: string;
    updatedAt: string;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
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

    return {
      tickets: tickets.map((ticket) => {
        const tripIdMatch = ticket.subject.match(/Incident trajet ([a-z0-9]+)/i);
        return {
          id: ticket.id,
          subject: redactSupportText(ticket.subject),
          description: redactSupportText(ticket.description),
          status: ticket.status,
          priority: ticket.priority,
          adminNote: ticket.adminNote ?? null,
          requesterName: maskRequesterName(ticket.user.fullName),
          requesterRole: ticket.user.role,
          tripId: tripIdMatch?.[1] ?? null,
          createdAt: ticket.createdAt.toISOString(),
          updatedAt: ticket.updatedAt.toISOString(),
        };
      }),
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
}
