/**
 * RGPD article 20 — Portabilité des données (droit d'accès).
 *
 * Invariants testés :
 * 1. L'export contient les données de profil, sessions, portefeuille,
 *    notifications, tickets et paiements — sans champs sensibles (passwordHash,
 *    tokenHash, clés de stockage).
 * 2. L'export rider inclut lieux enregistrés, trajets et notes données.
 * 3. L'export driver inclut véhicules, trajets et notes reçues.
 * 4. Un événement DATA_EXPORT est enregistré dans l'audit log (non-bloquant).
 * 5. La réponse ne contient jamais le passwordHash ni le tokenHash de session.
 */
import { AuthService } from './auth.service';

describe('AuthService — export RGPD des données personnelles', () => {
  const now = new Date('2026-05-24T10:00:00.000Z');

  function buildBaseUser(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      email: 'rider@orbi.app',
      fullName: 'Awa Ouedraogo',
      phoneNumber: '+22670000001',
      passwordHash: 'secret-hash',
      role: 'RIDER',
      provider: 'EMAIL',
      isActive: true,
      isPhoneVerified: true,
      lastLoginAt: now,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
      riderProfile: null,
      driverProfile: null,
      ...overrides,
    };
  }

  function buildAuthContext() {
    return {
      token: 'raw-token',
      user: { id: 'user-1' },
      session: {
        id: 'session-1',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    };
  }

  function createService() {
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn(),
      },
      userSession: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      wallet: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      supportTicket: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      paymentAttempt: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    const notifications = {
      enqueue: jest.fn().mockResolvedValue({ notification: { id: 'notif-1' } }),
    };

    return {
      prisma,
      service: new AuthService(prisma as never, notifications as never),
    };
  }

  // ── Champs sensibles non exposés ─────────────────────────────────────────

  it("n'expose jamais le passwordHash ni le tokenHash dans l'export", async () => {
    const { prisma, service } = createService();

    prisma.user.findUniqueOrThrow.mockResolvedValue(
      buildBaseUser({ riderProfile: null, driverProfile: null }),
    );
    prisma.userSession.findMany.mockResolvedValue([
      {
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
        createdAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
        revokedAt: null,
        tokenHash: 'should-not-appear',
      },
    ]);

    const result = await service.dataExport(buildAuthContext() as never);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('secret-hash');
    expect(serialized).not.toContain('tokenHash');
    expect(serialized).not.toContain('should-not-appear');
  });

  // ── Contenu du profil de base ─────────────────────────────────────────────

  it('exporte le profil utilisateur avec les champs corrects', async () => {
    const { prisma, service } = createService();

    prisma.user.findUniqueOrThrow.mockResolvedValue(buildBaseUser());

    const result = await service.dataExport(buildAuthContext() as never);

    expect(result.profile).toMatchObject({
      id: 'user-1',
      email: 'rider@orbi.app',
      fullName: 'Awa Ouedraogo',
      phoneNumber: '+22670000001',
      role: 'RIDER',
      provider: 'EMAIL',
      isActive: true,
      isPhoneVerified: true,
    });
    expect(result.profile).not.toHaveProperty('passwordHash');
    expect(result.profile).not.toHaveProperty('failedLoginCount');
    expect(result.profile).not.toHaveProperty('lockedUntil');
  });

  // ── Portefeuille et transactions ──────────────────────────────────────────

  it('exporte le portefeuille avec ses transactions', async () => {
    const { prisma, service } = createService();

    prisma.user.findUniqueOrThrow.mockResolvedValue(buildBaseUser());
    prisma.wallet.findFirst.mockResolvedValue({
      currency: 'XOF',
      balance: { toString: () => '12500.00' },
      transactions: [
        {
          type: 'CREDIT',
          amount: { toString: () => '5000.00' },
          reference: 'ref-1',
          description: 'Course terminée',
          createdAt: now,
        },
      ],
    });

    const result = await service.dataExport(buildAuthContext() as never);

    expect(result.wallet).not.toBeNull();
    expect(result.wallet?.currency).toBe('XOF');
    expect(result.wallet?.balance).toBe('12500.00');
    expect(result.wallet?.transactions).toHaveLength(1);
    expect(result.wallet?.transactions[0].type).toBe('CREDIT');
  });

  it("retourne null pour le portefeuille si l'utilisateur n'en a pas", async () => {
    const { prisma, service } = createService();

    prisma.user.findUniqueOrThrow.mockResolvedValue(buildBaseUser());
    prisma.wallet.findFirst.mockResolvedValue(null);

    const result = await service.dataExport(buildAuthContext() as never);

    expect(result.wallet).toBeNull();
  });

  // ── Profil rider ──────────────────────────────────────────────────────────

  it('exporte le profil rider avec lieux, trajets et notes', async () => {
    const { prisma, service } = createService();

    prisma.user.findUniqueOrThrow.mockResolvedValue(
      buildBaseUser({
        riderProfile: {
          savedPlaces: [
            {
              label: 'Maison',
              address: 'Rue 10.34, Ouagadougou',
              latitude: { toString: () => '12.3640' },
              longitude: { toString: () => '-1.5300' },
              createdAt: now,
            },
          ],
          trips: [
            {
              pickupAddress: 'Marché Central',
              destinationAddress: "Zone de l'Aéroport",
              status: 'COMPLETED',
              actualFare: { toString: () => '1500.00' },
              currency: 'XOF',
              distanceKm: { toString: () => '5.20' },
              durationMinutes: 12,
              startedAt: now,
              completedAt: now,
              createdAt: now,
            },
          ],
          ratingsGiven: [
            {
              score: 5,
              comment: 'Excellent chauffeur',
              createdAt: now,
            },
          ],
        },
        driverProfile: null,
      }),
    );

    const result = await service.dataExport(buildAuthContext() as never);

    expect(result).toHaveProperty('riderProfile');
    const riderProfile = (result as Record<string, unknown>)
      .riderProfile as Record<string, unknown[]>;
    expect(riderProfile.savedPlaces).toHaveLength(1);
    expect((riderProfile.savedPlaces[0] as Record<string, unknown>).label).toBe(
      'Maison',
    );
    expect(riderProfile.trips).toHaveLength(1);
    expect(riderProfile.ratingsGiven).toHaveLength(1);
  });

  // ── Profil driver ─────────────────────────────────────────────────────────

  it('exporte le profil driver avec véhicules, trajets et notes reçues', async () => {
    const { prisma, service } = createService();

    prisma.user.findUniqueOrThrow.mockResolvedValue(
      buildBaseUser({
        role: 'DRIVER',
        riderProfile: null,
        driverProfile: {
          licenseNumber: 'BF-DL-001',
          verificationStatus: 'APPROVED',
          averageRating: { toString: () => '4.80' },
          completedTripsCount: 42,
          vehicles: [
            {
              make: 'Honda',
              model: 'Hornet',
              type: 'MOTORCYCLE',
              tier: 'MOTO_STANDARD',
              plateNumber: '1234AB',
              year: 2022,
              isActive: true,
              createdAt: now,
            },
          ],
          assignedTrips: [],
          ratingsReceived: [{ score: 5, comment: 'Super', createdAt: now }],
          onboardingDocuments: [
            {
              type: 'DRIVER_LICENSE',
              status: 'APPROVED',
              uploadedAt: now,
              expiresAt: null,
            },
          ],
        },
      }),
    );

    const result = await service.dataExport(buildAuthContext() as never);

    expect(result).toHaveProperty('driverProfile');
    const driverProfile = (result as Record<string, unknown>)
      .driverProfile as Record<string, unknown[]>;
    expect(driverProfile.vehicles).toHaveLength(1);
    expect(driverProfile.ratingsReceived).toHaveLength(1);
    expect(driverProfile.documents).toHaveLength(1);

    // Aucune clé de stockage ne doit apparaître.
    expect(JSON.stringify(result)).not.toContain('storageKey');
  });

  // ── Audit log ─────────────────────────────────────────────────────────────

  it("enregistre un événement DATA_EXPORT dans l'audit log", async () => {
    const { prisma, service } = createService();

    prisma.user.findUniqueOrThrow.mockResolvedValue(buildBaseUser());

    await service.dataExport(buildAuthContext() as never);

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'DATA_EXPORT' }),
      }),
    );
  });

  // ── exportedAt ───────────────────────────────────────────────────────────

  it('inclut un timestamp exportedAt en ISO 8601', async () => {
    const { prisma, service } = createService();

    prisma.user.findUniqueOrThrow.mockResolvedValue(buildBaseUser());

    const before = new Date();
    const result = await service.dataExport(buildAuthContext() as never);
    const after = new Date();

    const exportedAt = new Date(result.exportedAt);
    expect(exportedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(exportedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
