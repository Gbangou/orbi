/**
 * AdminUsersService
 *
 * Responsabilité unique: administration des utilisateurs (riders + drivers).
 * Fournit: listing filtré/paginé, suspension, réactivation.
 * Toutes les mutations sont tracées dans l'audit log.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DriverStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { RequestAuthContext } from '../auth/auth.types';

// ── Types de réponse ──────────────────────────────────────────────────────────

export type AdminDriverListItem = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  status: string;
  createdAt: string;
  completedTripsCount: number;
  vehicle: {
    make: string;
    model: string;
    plateNumber: string;
    vehicleType: string;
  } | null;
};

export type AdminDriversResponse = {
  drivers: AdminDriverListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminRiderListItem = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  riderId: string | null;
  completedTripsCount: number;
  rideRequestsCount: number;
};

export type AdminRidersResponse = {
  riders: AdminRiderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

// ── Constantes ────────────────────────────────────────────────────────────────

const ALLOWED_DRIVER_STATUSES = new Set<string>([
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
]);

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listDrivers(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
  }): Promise<AdminDriversResponse> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
    const searchTerm = query.search?.trim();
    const filterStatus =
      query.status && ALLOWED_DRIVER_STATUSES.has(query.status.toUpperCase())
        ? (query.status.toUpperCase() as DriverStatus)
        : undefined;

    const where: Prisma.DriverProfileWhereInput = {
      ...(searchTerm
        ? {
            OR: [
              { user: { fullName: { contains: searchTerm, mode: 'insensitive' } } },
              { user: { email: { contains: searchTerm, mode: 'insensitive' } } },
              { user: { phoneNumber: { contains: searchTerm } } },
            ],
          }
        : {}),
      ...(filterStatus ? { status: filterStatus } : {}),
    };

    const [driverRows, total] = await Promise.all([
      this.prisma.driverProfile.findMany({
        where,
        include: {
          user: {
            select: { id: true, fullName: true, email: true, phoneNumber: true, isActive: true },
          },
          vehicles: {
            where: { isActive: true },
            select: { make: true, model: true, plateNumber: true, type: true },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.driverProfile.count({ where }),
    ]);

    return {
      drivers: driverRows.map((d) => {
        const [firstVehicle] = d.vehicles;
        return {
          id: d.id,
          userId: d.user.id,
          fullName: d.user.fullName,
          email: d.user.email,
          phoneNumber: d.user.phoneNumber ?? null,
          isActive: d.user.isActive,
          status: d.status,
          createdAt: d.createdAt.toISOString(),
          completedTripsCount: d.completedTripsCount,
          vehicle: firstVehicle
            ? {
                make: firstVehicle.make,
                model: firstVehicle.model,
                plateNumber: firstVehicle.plateNumber,
                vehicleType: firstVehicle.type,
              }
            : null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async listRiders(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    activeOnly?: boolean;
  }): Promise<AdminRidersResponse> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
    const searchTerm = query.search?.trim();

    const where: Prisma.UserWhereInput = {
      role: UserRole.RIDER,
      ...(searchTerm
        ? {
            OR: [
              { fullName: { contains: searchTerm, mode: 'insensitive' } },
              { email: { contains: searchTerm, mode: 'insensitive' } },
              { phoneNumber: { contains: searchTerm } },
            ],
          }
        : {}),
      ...(query.activeOnly ? { isActive: true } : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          isActive: true,
          createdAt: true,
          riderProfile: {
            select: {
              id: true,
              _count: { select: { trips: true, rideRequests: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      riders: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phoneNumber: u.phoneNumber ?? null,
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
        riderId: u.riderProfile?.id ?? null,
        completedTripsCount: u.riderProfile?._count.trips ?? 0,
        rideRequestsCount: u.riderProfile?._count.rideRequests ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async setRiderStatus(
    userId: string,
    payload: { isActive: boolean; reason?: string },
    auth: RequestAuthContext,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true, fullName: true },
    });

    if (!user || user.role !== UserRole.RIDER) {
      throw new NotFoundException('Rider not found.');
    }

    if (user.isActive === payload.isActive) {
      throw new BadRequestException(
        payload.isActive
          ? 'Ce compte rider est déjà actif.'
          : 'Ce compte rider est déjà suspendu.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: payload.isActive },
    });

    const reason = payload.reason?.trim() || null;

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: payload.isActive ? 'RIDER_ACTIVATED' : 'RIDER_SUSPENDED',
        entityType: 'USER',
        entityId: userId,
        metadata: {
          reason,
          previousIsActive: user.isActive,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return { riderId: userId, isActive: payload.isActive };
  }
}
