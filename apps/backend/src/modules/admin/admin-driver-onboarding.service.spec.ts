import type { RequestAuthContext } from '../auth/auth.types';
import { AdminDriverOnboardingService } from './admin-driver-onboarding.service';

function authContext(): RequestAuthContext {
  const now = new Date('2026-07-10T08:00:00.000Z');

  return {
    user: {
      id: 'ops-1',
      email: 'ops@orbi.test',
      phoneNumber: null,
      passwordHash: null,
      fullName: 'Ops Orbi',
      role: 'OPS',
      provider: 'EMAIL',
      isActive: true,
      isPhoneVerified: true,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
      pushToken: null,
      failedLoginCount: 0,
      lockedUntil: null,
      riderProfile: null,
      driverProfile: null,
    },
    session: {
      id: 'session-ops-1',
      userId: 'ops-1',
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date('2026-07-10T12:00:00.000Z'),
      revokedAt: null,
      userAgent: 'jest',
      ipAddress: '127.0.0.1',
    },
    token: 'test-token-ops-1',
  };
}

function completeMetadata(seed: string) {
  const sha = seed.repeat(64).slice(0, 64);

  return {
    integrity: {
      sizeBytes: 120000,
      sha256: sha,
      uploadSource: 'driver-app',
      capturedAt: '2026-07-10T08:00:00.000Z',
    },
    objectVerification: {
      state: 'confirmed',
      provider: 'orbi-object-store',
      objectId: `object-${seed}`,
      verifiedAt: '2026-07-10T08:00:02.000Z',
      sizeBytes: 120000,
      sha256: sha,
      failureReason: null,
    },
    safetyScan: {
      state: 'clear',
      engine: 'local-policy',
      scannedAt: '2026-07-10T08:00:03.000Z',
      findings: [],
      quarantineReason: null,
    },
  };
}

function approvedDocument(type: string, index: number) {
  return {
    id: `doc-${index}`,
    type,
    status: 'APPROVED',
    expiresAt: new Date('2027-07-10T00:00:00.000Z'),
    metadata: completeMetadata(String(index)),
  };
}

function completeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'driver-1',
    userId: 'user-driver-1',
    licenseNumber: 'BF-12345',
    status: 'OFFLINE',
    user: {
      fullName: 'Issa Driver',
      isPhoneVerified: true,
    },
    vehicles: [{ id: 'vehicle-1' }],
    onboardingDocuments: [
      approvedDocument('IDENTITY_DOCUMENT', 1),
      approvedDocument('DRIVER_LICENSE', 2),
      approvedDocument('VEHICLE_REGISTRATION', 3),
      approvedDocument('INSURANCE_PROOF', 4),
      approvedDocument('SELFIE_VERIFICATION', 5),
    ],
    ...overrides,
  };
}

function createService() {
  const prisma = {
    driverProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    driverDocument: {
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    driverOnboardingReview: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    supportTicket: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  const realtimeService = {
    publish: jest.fn(),
  };
  const notificationsService = {
    enqueue: jest.fn(),
  };
  const documentLinksService = {};
  const documentObjectStorageService = {};
  const service = new AdminDriverOnboardingService(
    prisma as never,
    realtimeService as never,
    notificationsService as never,
    documentLinksService as never,
    documentObjectStorageService as never,
  );

  return { prisma, realtimeService, service };
}

describe('AdminDriverOnboardingService', () => {
  it('approves a driver only when every required document is approved and traceable', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue(completeProfile());
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.driverOnboardingReview.create.mockResolvedValue({
      id: 'review-1',
      status: 'APPROVED',
      decisionReason: 'Dossier complet.',
      createdAt: new Date('2026-07-10T08:30:00.000Z'),
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.updateDriverOnboardingReview(
      'driver-1',
      {
        status: 'APPROVED',
        decisionReason: 'Dossier complet.',
      },
      authContext(),
    );

    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: {
        verificationStatus: 'APPROVED',
        status: 'OFFLINE',
      },
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'driver-onboarding.review-updated',
        entityId: 'driver-1',
      }),
    );
    expect(result.review.status).toBe('APPROVED');
  });

  it('rejects driver approval when any required document is missing', async () => {
    const { prisma, service } = createService();
    const documents = completeProfile().onboardingDocuments.filter(
      (document) => document.type !== 'INSURANCE_PROOF',
    );

    prisma.driverProfile.findUnique.mockResolvedValue(
      completeProfile({ onboardingDocuments: documents }),
    );

    await expect(
      service.updateDriverOnboardingReview(
        'driver-1',
        {
          status: 'APPROVED',
          decisionReason: 'Dossier presque complet.',
        },
        authContext(),
      ),
    ).rejects.toThrow(
      'Document INSURANCE_PROOF is missing or not approved.',
    );
    expect(prisma.driverProfile.update).not.toHaveBeenCalled();
  });

  it('rejects driver approval when document integrity is incomplete', async () => {
    const { prisma, service } = createService();
    const profile = completeProfile();
    profile.onboardingDocuments[0] = {
      ...profile.onboardingDocuments[0],
      metadata: {
        ...completeMetadata('1'),
        safetyScan: {
          state: 'pending',
          engine: '',
          scannedAt: '',
          findings: [],
          quarantineReason: null,
        },
      },
    };

    prisma.driverProfile.findUnique.mockResolvedValue(profile);

    await expect(
      service.updateDriverOnboardingReview(
        'driver-1',
        {
          status: 'APPROVED',
          decisionReason: 'Dossier sans scan final.',
        },
        authContext(),
      ),
    ).rejects.toThrow(
      'Document IDENTITY_DOCUMENT does not have confirmed object integrity.',
    );
    expect(prisma.driverProfile.update).not.toHaveBeenCalled();
  });

  it('rejects driver approval when an approved required document expires soon', async () => {
    const { prisma, service } = createService();
    const profile = completeProfile();
    profile.onboardingDocuments[1] = {
      ...profile.onboardingDocuments[1],
      expiresAt: new Date('2026-07-20T00:00:00.000Z'),
    };

    prisma.driverProfile.findUnique.mockResolvedValue(profile);

    await expect(
      service.updateDriverOnboardingReview(
        'driver-1',
        {
          status: 'APPROVED',
          decisionReason: 'Dossier complet mais permis presque expire.',
        },
        authContext(),
      ),
    ).rejects.toThrow(
      'Document DRIVER_LICENSE expires within 30 days and must be renewed.',
    );
    expect(prisma.driverProfile.update).not.toHaveBeenCalled();
  });
});
