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
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { RequestAuthContext } from '../auth/auth.types';

// ── Types de réponse ──────────────────────────────────────────────────────────

export type AdminDriverListItem = {
  id: string;
  userId: string;
  driverId: string | null;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  status: string;
  verificationStatus: string;
  profileStatus: 'READY' | 'MISSING_PROFILE';
  createdAt: string;
  lastLoginAt: string | null;
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

export type AdminDriverProfileRepairResponse = {
  driver: AdminDriverListItem;
  repaired: boolean;
};

export type AdminRiderListItem = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  riderId: string | null;
  profileStatus: 'READY' | 'MISSING_PROFILE';
  completedTripsCount: number;
  rideRequestsCount: number;
};

export type AdminRidersResponse = {
  riders: AdminRiderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminRiderProfileRepairResponse = {
  rider: AdminRiderListItem;
  repaired: boolean;
};

type AdminRiderUserRecord = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  riderProfile: {
    id: string;
    _count: { trips: number; rideRequests: number };
  } | null;
};

type AdminDriverUserRecord = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  driverProfile: {
    id: string;
    status: string;
    verificationStatus: string;
    createdAt: Date;
    completedTripsCount: number;
    vehicles: Array<{
      make: string;
      model: string;
      plateNumber: string;
      type: string;
    }>;
  } | null;
};

// ── Constantes ────────────────────────────────────────────────────────────────

// Le filtre exposé aux ops (PENDING/ACTIVE/SUSPENDED/REJECTED) décrit le cycle
// de vie du dossier chauffeur, pas la présence en direct (DriverStatus:
// OFFLINE/ONLINE/BUSY/SUSPENDED) — seul SUSPENDED existe dans les deux
// modèles. Caster directement les 3 autres valeurs vers DriverStatus faisait
// planter la requête Prisma avec une valeur d'enum invalide (500 reproduit en
// direct en filtrant "Actifs" depuis la console). Chaque valeur est
// maintenant traduite vers le bon champ sous-jacent.
function resolveDriverStatusFilter(
  rawStatus: string | undefined,
): Prisma.DriverProfileWhereInput {
  switch (rawStatus?.toUpperCase()) {
    case 'ACTIVE':
      return {
        verificationStatus: 'APPROVED',
        status: { not: 'SUSPENDED' },
      };
    case 'PENDING':
      return { verificationStatus: 'PENDING' };
    case 'REJECTED':
      return { verificationStatus: 'REJECTED' };
    case 'SUSPENDED':
      return { status: 'SUSPENDED' };
    default:
      return {};
  }
}

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  private mapAdminRider(user: AdminRiderUserRecord): AdminRiderListItem {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber ?? null,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      riderId: user.riderProfile?.id ?? null,
      profileStatus: user.riderProfile ? 'READY' : 'MISSING_PROFILE',
      completedTripsCount: user.riderProfile?._count.trips ?? 0,
      rideRequestsCount: user.riderProfile?._count.rideRequests ?? 0,
    };
  }

  private mapAdminDriver(user: AdminDriverUserRecord): AdminDriverListItem {
    const [firstVehicle] = user.driverProfile?.vehicles ?? [];

    return {
      id: user.driverProfile?.id ?? user.id,
      userId: user.id,
      driverId: user.driverProfile?.id ?? null,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber ?? null,
      isActive: user.isActive,
      status: user.driverProfile?.status ?? 'MISSING_PROFILE',
      verificationStatus:
        user.driverProfile?.verificationStatus ?? 'MISSING_PROFILE',
      profileStatus: user.driverProfile ? 'READY' : 'MISSING_PROFILE',
      createdAt: (user.driverProfile?.createdAt ?? user.createdAt).toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      completedTripsCount: user.driverProfile?.completedTripsCount ?? 0,
      vehicle: firstVehicle
        ? {
            make: firstVehicle.make,
            model: firstVehicle.model,
            plateNumber: firstVehicle.plateNumber,
            vehicleType: firstVehicle.type,
          }
        : null,
    };
  }

  async listDrivers(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
  }): Promise<AdminDriversResponse> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
    const searchTerm = query.search?.trim();

    const driverProfileWhere = resolveDriverStatusFilter(query.status);
    const where: Prisma.UserWhereInput = {
      role: UserRole.DRIVER,
      ...(searchTerm
        ? {
            OR: [
              { fullName: { contains: searchTerm, mode: 'insensitive' } },
              { email: { contains: searchTerm, mode: 'insensitive' } },
              { phoneNumber: { contains: searchTerm } },
            ],
          }
        : {}),
      ...(Object.keys(driverProfileWhere).length
        ? { driverProfile: { is: driverProfileWhere } }
        : {}),
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
          lastLoginAt: true,
          driverProfile: {
            select: {
              id: true,
              status: true,
              verificationStatus: true,
              createdAt: true,
              completedTripsCount: true,
              vehicles: {
                where: { isActive: true },
                select: { make: true, model: true, plateNumber: true, type: true },
                take: 1,
                orderBy: { createdAt: 'desc' },
              },
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
      drivers: users.map((u) => this.mapAdminDriver(u)),
      total,
      page,
      pageSize,
    };
  }

  async repairDriverProfile(
    userId: string,
    auth: RequestAuthContext,
  ): Promise<AdminDriverProfileRepairResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        driverProfile: {
          select: {
            id: true,
            status: true,
            verificationStatus: true,
            createdAt: true,
            completedTripsCount: true,
            vehicles: {
              where: { isActive: true },
              select: { make: true, model: true, plateNumber: true, type: true },
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!user || user.role !== UserRole.DRIVER) {
      throw new NotFoundException('Driver account not found.');
    }

    if (user.driverProfile) {
      return {
        driver: this.mapAdminDriver(user),
        repaired: false,
      };
    }

    const driverProfile = await this.prisma.driverProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
      select: {
        id: true,
        status: true,
        verificationStatus: true,
        createdAt: true,
        completedTripsCount: true,
        vehicles: {
          where: { isActive: true },
          select: { make: true, model: true, plateNumber: true, type: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_PROFILE_REPAIRED',
        entityType: 'DRIVER_PROFILE',
        entityId: driverProfile.id,
        metadata: {
          userId,
          email: user.email,
          source: 'admin_drivers_board',
        } satisfies Prisma.InputJsonObject,
      },
    });

    return {
      driver: this.mapAdminDriver({
        ...user,
        driverProfile,
      }),
      repaired: true,
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
          lastLoginAt: true,
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
      riders: users.map((u) => this.mapAdminRider(u)),
      total,
      page,
      pageSize,
    };
  }

  async repairRiderProfile(
    userId: string,
    auth: RequestAuthContext,
  ): Promise<AdminRiderProfileRepairResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        riderProfile: {
          select: {
            id: true,
            _count: { select: { trips: true, rideRequests: true } },
          },
        },
      },
    });

    if (!user || user.role !== UserRole.RIDER) {
      throw new NotFoundException('Rider account not found.');
    }

    if (user.riderProfile) {
      return {
        rider: this.mapAdminRider(user),
        repaired: false,
      };
    }

    const riderProfile = await this.prisma.riderProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
      select: {
        id: true,
        _count: { select: { trips: true, rideRequests: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'RIDER_PROFILE_REPAIRED',
        entityType: 'RIDER_PROFILE',
        entityId: riderProfile.id,
        metadata: {
          userId,
          email: user.email,
          source: 'admin_riders_board',
        } satisfies Prisma.InputJsonObject,
      },
    });

    return {
      rider: this.mapAdminRider({
        ...user,
        riderProfile,
      }),
      repaired: true,
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
