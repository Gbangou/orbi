/**
 * AdminDriverOnboardingService — Revue du dossier chauffeur
 *
 * Responsabilité unique: file d'attente de vérification, revue des documents,
 * suspension/réactivation et exports pour l'équipe opérations.
 * Extrait de AdminService pour respecter le Single Responsibility Principle.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DriverDocumentStatus,
  DriverOnboardingReviewStatus,
  DriverStatus,
  Prisma,
  VerificationStatus,
} from '@prisma/client';
import {
  PageQueryDto,
  resolvePageQuery,
} from '../../common/dto/page-query.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { DocumentLinksService } from '../../common/document-links/document-links.service';
import {
  DocumentObjectStorageService,
  type StoredDocumentObjectVerification,
} from '../../common/document-links/document-object-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationChannel } from '@prisma/client';
import { DriverOnboardingExportQueryDto } from './dto/driver-onboarding-export-query.dto';
import { UpdateDriverOnboardingReviewDto } from './dto/update-driver-onboarding-review.dto';
import { UpdateDriverDocumentObjectVerificationDto } from './dto/update-driver-document-object-verification.dto';

const reviewDecisionRoles = new Set(['ADMIN', 'OPS']);

@Injectable()
export class AdminDriverOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
    private readonly notificationsService: NotificationsService,
    private readonly documentLinksService: DocumentLinksService,
    private readonly documentObjectStorageService: DocumentObjectStorageService,
  ) {}

  async driverOnboardingQueue(
    query: PageQueryDto = new PageQueryDto(),
    auth?: RequestAuthContext,
  ) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const minimizeIdentity = shouldMinimizeDriverOnboardingIdentity(auth);
    const [profiles, total] = await Promise.all([
      this.prisma.driverProfile.findMany({
        skip,
        take,
        where: {
          verificationStatus: {
            in: ['PENDING', 'REJECTED'],
          },
        },
        include: {
          user: true,
          vehicles: {
            where: {
              isActive: true,
            },
          },
          onboardingDocuments: {
            orderBy: {
              uploadedAt: 'desc',
            },
          },
          onboardingReviews: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 5,
            include: {
              actor: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      this.prisma.driverProfile.count({
        where: {
          verificationStatus: {
            in: ['PENDING', 'REJECTED'],
          },
        },
      }),
    ]);

    return {
      drivers: profiles.map((profile) => {
        const latestReview = profile.onboardingReviews[0] ?? null;
        const latestDocumentsByType = new Map<
          string,
          (typeof profile.onboardingDocuments)[number]
        >();

        for (const document of profile.onboardingDocuments) {
          if (!latestDocumentsByType.has(document.type)) {
            latestDocumentsByType.set(document.type, document);
          }
        }

        const reviewableDocuments = Array.from(latestDocumentsByType.values());
        const approvedDocuments = reviewableDocuments.filter(
          (document) => resolveEffectiveDocumentStatus(document) === 'APPROVED',
        ).length;
        const pendingDocuments = reviewableDocuments.filter(
          (document) => resolveEffectiveDocumentStatus(document) === 'PENDING',
        ).length;
        const rejectedDocuments = reviewableDocuments.filter(
          (document) =>
            resolveEffectiveDocumentStatus(document) === 'REJECTED' ||
            resolveEffectiveDocumentStatus(document) === 'EXPIRED',
        ).length;
        const documentsWithIntegrity = reviewableDocuments.map((document) => ({
          document,
          integrity: resolveDriverDocumentIntegrity(document.metadata),
        }));
        const integrityWarnings = documentsWithIntegrity.filter(
          ({ integrity }) => integrity.state !== 'complete',
        ).length;
        const averageIntegrityScore = documentsWithIntegrity.length
          ? Math.round(
              documentsWithIntegrity.reduce(
                (totalScore, { integrity }) => totalScore + integrity.score,
                0,
              ) / documentsWithIntegrity.length,
            )
          : 0;
        const missingRequiredTypes = requiredOnboardingDocumentTypes.filter(
          (type) => !latestDocumentsByType.has(type),
        );
        const decisionGuidance = resolveDriverOnboardingDecisionGuidance({
          approvedDocuments,
          pendingDocuments,
          rejectedDocuments,
          missingRequiredTypes: [...missingRequiredTypes],
          documentsWithIntegrity,
        });

        return {
          id: profile.id,
          driverName: minimizeIdentity
            ? maskRequesterName(profile.user.fullName)
            : profile.user.fullName,
          email: minimizeIdentity
            ? maskEmailAddress(profile.user.email)
            : profile.user.email,
          phoneNumber: minimizeIdentity
            ? maskPhoneNumber(profile.user.phoneNumber)
            : profile.user.phoneNumber,
          driverStatus: profile.status,
          verificationStatus: profile.verificationStatus,
          reviewStatus:
            latestReview?.status ?? DriverOnboardingReviewStatus.SUBMITTED,
          latestReviewAt: latestReview?.createdAt.toISOString() ?? null,
          latestReviewActor: latestReview?.actor.fullName
            ? minimizeIdentity
              ? maskRequesterName(latestReview.actor.fullName)
              : latestReview.actor.fullName
            : null,
          latestDecisionReason: latestReview?.decisionReason ?? null,
          serviceRadiusKm: Number(profile.serviceRadiusKm ?? 0),
          activeVehicleCount: profile.vehicles.length,
          documentSummary: {
            total: reviewableDocuments.length,
            approved: approvedDocuments,
            pending: pendingDocuments,
            rejected: rejectedDocuments,
            integrityWarnings,
            averageIntegrityScore,
            missingRequired: missingRequiredTypes.length,
          },
          decisionGuidance,
          reviewHistory: profile.onboardingReviews.map((review) => ({
            id: review.id,
            status: review.status,
            actorName: minimizeIdentity
              ? maskRequesterName(review.actor.fullName)
              : review.actor.fullName,
            decisionReason: review.decisionReason ?? null,
            createdAt: review.createdAt.toISOString(),
            decisionGuidance: resolveStoredDecisionGuidance(review.metadata),
            documentSummary: resolveStoredDocumentSummary(review.metadata),
          })),
          documents: documentsWithIntegrity.map(({ document, integrity }) => ({
            id: document.id,
            type: document.type,
            status: resolveEffectiveDocumentStatus(document),
            fileName: document.fileName,
            uploadedAt: document.uploadedAt.toISOString(),
            expiresAt: document.expiresAt?.toISOString() ?? null,
            rejectionReason: document.rejectionReason ?? null,
            integrity,
          })),
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

  async driverOnboardingExportCsv(
    query: DriverOnboardingExportQueryDto,
    auth: RequestAuthContext,
  ) {
    const guidanceFilter = query.guidanceFilter ?? 'all';
    const searchQuery = query.searchQuery?.trim() ?? '';
    const limit = query.limit ?? 100;
    const queue = await this.driverOnboardingQueue({
      page: 1,
      pageSize: limit,
    });
    const normalizedSearch = searchQuery.toLowerCase();
    const filteredDrivers = queue.drivers.filter((driver) => {
      if (
        guidanceFilter !== 'all' &&
        driver.decisionGuidance.level !== guidanceFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableText = [
        driver.driverName,
        driver.email,
        driver.phoneNumber ?? '',
        driver.verificationStatus,
        driver.reviewStatus,
        driver.decisionGuidance.level,
        driver.decisionGuidance.label,
        ...driver.decisionGuidance.blockers,
        ...driver.documents.flatMap((document) => [
          document.type,
          document.status,
          document.fileName,
          document.integrity.uploadSource ?? '',
        ]),
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
    const headers = [
      'driver_id',
      'driver_name',
      'email',
      'phone',
      'verification_status',
      'review_status',
      'guidance',
      'recommended_status',
      'approved_documents',
      'total_documents',
      'pending_documents',
      'rejected_documents',
      'missing_required',
      'integrity_warnings',
      'average_integrity_score',
      'active_vehicle_count',
      'service_radius_km',
      'blockers',
      'latest_decision_reason',
    ];
    const rows = filteredDrivers.map((driver) => [
      driver.id,
      driver.driverName,
      driver.email,
      driver.phoneNumber,
      driver.verificationStatus,
      driver.reviewStatus,
      driver.decisionGuidance.level,
      driver.decisionGuidance.recommendedStatus,
      driver.documentSummary.approved,
      driver.documentSummary.total,
      driver.documentSummary.pending,
      driver.documentSummary.rejected,
      driver.documentSummary.missingRequired,
      driver.documentSummary.integrityWarnings,
      driver.documentSummary.averageIntegrityScore,
      driver.activeVehicleCount,
      driver.serviceRadiusKm,
      driver.decisionGuidance.blockers.join(' | '),
      driver.latestDecisionReason,
    ]);

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_ONBOARDING_QUEUE_EXPORTED',
        entityType: 'DRIVER_PROFILE',
        entityId: guidanceFilter,
        metadata: {
          format: 'csv',
          guidanceFilter,
          searchQuery: searchQuery || null,
          exportedCount: filteredDrivers.length,
          scannedCount: queue.drivers.length,
          limit,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return [
      headers.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n');
  }

  async driverOnboardingExportHistory(
    query: PageQueryDto = new PageQueryDto(),
  ) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const where: Prisma.AuditLogWhereInput = {
      action: 'DRIVER_ONBOARDING_QUEUE_EXPORTED',
      entityType: 'DRIVER_PROFILE',
    };
    const [exports, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        skip,
        take,
        where,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      exports: exports.map((entry) => {
        const metadata = isJsonRecord(entry.metadata) ? entry.metadata : {};

        return {
          id: entry.id,
          createdAt: entry.createdAt.toISOString(),
          actor: {
            id: entry.user.id,
            name: entry.user.fullName,
            role: entry.user.role,
          },
          guidanceFilter: normalizeOnboardingExportGuidanceFilter(
            metadata.guidanceFilter ?? entry.entityId ?? undefined,
          ),
          searchQuery: nullableString(metadata.searchQuery),
          exportedCount:
            nullableNonNegativeInteger(metadata.exportedCount) ?? 0,
          scannedCount: nullableNonNegativeInteger(metadata.scannedCount) ?? 0,
          limit: nullablePositiveInteger(metadata.limit) ?? null,
          format: metadata.format === 'csv' ? 'csv' : 'unknown',
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

  async updateDriverOnboardingReview(
    driverId: string,
    payload: UpdateDriverOnboardingReviewDto,
    auth: RequestAuthContext,
  ) {
    this.assertReviewAuthority(payload.status, auth);

    const profile = await this.prisma.driverProfile.findUnique({
      where: {
        id: driverId,
      },
      include: {
        user: true,
        vehicles: {
          where: {
            isActive: true,
          },
        },
        onboardingDocuments: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    if (
      (payload.status === 'REJECTED' ||
        payload.status === 'CHANGES_REQUESTED') &&
      !payload.decisionReason?.trim()
    ) {
      throw new BadRequestException(
        'A decision reason is required for rejected or changes requested reviews.',
      );
    }

    const decisionSnapshot = resolveDriverOnboardingDecisionSnapshot({
      onboardingDocuments: profile.onboardingDocuments,
      documentDecisions: payload.documentDecisions,
    });

    if (payload.documentDecisions?.length) {
      for (const decision of payload.documentDecisions) {
        const document = profile.onboardingDocuments.find(
          (candidate) => candidate.id === decision.documentId,
        );

        if (!document) {
          throw new NotFoundException(
            `Driver document ${decision.documentId} not found for this profile.`,
          );
        }

        await this.prisma.driverDocument.update({
          where: {
            id: decision.documentId,
          },
          data: {
            status: decision.status as DriverDocumentStatus,
            rejectionReason:
              decision.status === 'REJECTED'
                ? (decision.rejectionReason ?? 'Document non conforme.')
                : null,
            expiresAt: decision.expiresAt ? new Date(decision.expiresAt) : null,
            reviewedAt: new Date(),
            reviewedByUserId: auth.user.id,
          },
        });
      }
    }

    if (payload.status === 'APPROVED') {
      this.assertApprovalReadiness(profile, payload);
    }

    const verificationStatus = toVerificationStatus(
      payload.status as DriverOnboardingReviewStatus,
    );

    await this.prisma.driverProfile.update({
      where: {
        id: driverId,
      },
      data: {
        verificationStatus,
        status:
          payload.status === 'APPROVED' &&
          profile.status !== DriverStatus.SUSPENDED
            ? DriverStatus.OFFLINE
            : profile.status === DriverStatus.SUSPENDED
              ? DriverStatus.SUSPENDED
              : DriverStatus.OFFLINE,
      },
    });

    const review = await this.prisma.driverOnboardingReview.create({
      data: {
        driverProfileId: driverId,
        status: payload.status as DriverOnboardingReviewStatus,
        actorUserId: auth.user.id,
        notesInternal: payload.notesInternal?.trim(),
        decisionReason: payload.decisionReason?.trim(),
        metadata: {
          supportPriority: payload.supportPriority ?? null,
          documentDecisions: payload.documentDecisions ?? [],
          decisionGuidance: decisionSnapshot.guidance,
          documentSummary: decisionSnapshot.summary,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_ONBOARDING_REVIEW_UPDATED',
        entityType: 'DRIVER_PROFILE',
        entityId: driverId,
        metadata: {
          status: payload.status,
          decisionReason: payload.decisionReason ?? null,
          supportPriority: payload.supportPriority ?? null,
          decisionGuidance: decisionSnapshot.guidance,
          documentSummary: decisionSnapshot.summary,
        } as Prisma.InputJsonValue,
      },
    });

    if (
      payload.supportPriority !== undefined &&
      payload.supportPriority >= 2 &&
      payload.status !== 'APPROVED'
    ) {
      const supportSubject = `Revue onboarding chauffeur ${driverId}`;
      const existingSupportTicket = await this.prisma.supportTicket.findFirst({
        where: {
          userId: profile.userId,
          subject: supportSubject,
          status: {
            in: [SupportTicketStatus.OPEN, SupportTicketStatus.IN_REVIEW],
          },
        },
        select: {
          id: true,
        },
      });

      if (!existingSupportTicket) {
        await this.prisma.supportTicket.create({
          data: {
            userId: profile.userId,
            subject: supportSubject,
            description:
              payload.decisionReason?.trim() ??
              'Une action operations est requise sur le dossier chauffeur.',
            priority: payload.supportPriority,
            status: SupportTicketStatus.OPEN,
          },
        });
      }
    }

    this.realtimeService.publish({
      channel: 'admin',
      type: 'driver-onboarding.review-updated',
      entityId: driverId,
      actorRole: auth.user.role,
      payload: {
        status: payload.status,
        decisionReason: payload.decisionReason ?? null,
      },
    });

    return {
      review: {
        id: review.id,
        driverId,
        verificationStatus,
        status: review.status,
        decisionReason: review.decisionReason ?? null,
        createdAt: review.createdAt.toISOString(),
      },
    };
  }

  async getDriverDocumentViewLink(
    driverId: string,
    documentId: string,
    auth: RequestAuthContext,
  ) {
    const document = await this.prisma.driverDocument.findFirst({
      where: {
        id: documentId,
        driverProfileId: driverId,
      },
    });

    if (!document) {
      throw new NotFoundException('Driver document not found.');
    }

    return {
      documentId: document.id,
      type: document.type,
      ...this.documentLinksService.createViewLink({
        documentId: document.id,
        driverProfileId: driverId,
        storageKey: document.storageKey,
        actorRole: auth.user.role,
      }),
    };
  }

  async updateDriverDocumentObjectVerification(
    driverId: string,
    documentId: string,
    payload: UpdateDriverDocumentObjectVerificationDto,
    auth: RequestAuthContext,
  ) {
    const document = await this.prisma.driverDocument.findFirst({
      where: {
        id: documentId,
        driverProfileId: driverId,
      },
    });

    if (!document) {
      throw new NotFoundException('Driver document not found.');
    }

    if (
      payload.state === 'confirmed' &&
      (!payload.sizeBytes || !payload.sha256)
    ) {
      throw new BadRequestException(
        'Confirmed driver document object verification requires provider size and SHA-256.',
      );
    }

    if (payload.state === 'failed' && !payload.failureReason?.trim()) {
      throw new BadRequestException(
        'Failed driver document object verification requires a failure reason.',
      );
    }

    const previousMetadata =
      document.metadata && isJsonRecord(document.metadata)
        ? document.metadata
        : {};
    const objectVerification = {
      state: payload.state,
      provider: payload.provider.trim().toLowerCase(),
      objectId: payload.objectId?.trim() || null,
      verifiedAt: new Date().toISOString(),
      sizeBytes: payload.sizeBytes ?? null,
      sha256: payload.sha256?.trim().toLowerCase() ?? null,
      failureReason: payload.failureReason?.trim() || null,
      actor: {
        id: auth.user.id,
        role: auth.user.role,
      },
    };

    return this.persistDriverDocumentObjectVerification(
      document,
      driverId,
      previousMetadata,
      objectVerification,
      auth,
    );
  }

  async verifyDriverDocumentObjectFromProvider(
    driverId: string,
    documentId: string,
    auth: RequestAuthContext,
  ) {
    const document = await this.prisma.driverDocument.findFirst({
      where: {
        id: documentId,
        driverProfileId: driverId,
      },
    });

    if (!document) {
      throw new NotFoundException('Driver document not found.');
    }

    const previousMetadata =
      document.metadata && isJsonRecord(document.metadata)
        ? document.metadata
        : {};
    const previousIntegrity = previousMetadata.integrity;
    const integrity = isJsonRecord(previousIntegrity) ? previousIntegrity : {};
    const providerVerification =
      await this.documentObjectStorageService.verifyStoredDocument({
        storageKey: document.storageKey,
        expectedSizeBytes: nullablePositiveInteger(integrity.sizeBytes),
        expectedSha256: nullableString(integrity.sha256),
      });

    const objectVerification = {
      ...providerVerification,
      actor: {
        id: auth.user.id,
        role: auth.user.role,
      },
    };

    return this.persistDriverDocumentObjectVerification(
      document,
      driverId,
      previousMetadata,
      objectVerification,
      auth,
    );
  }

  async suspendDriver(
    driverId: string,
    payload: { reason: string },

  async reactivateDriver(driverId: string, auth: RequestAuthContext) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      select: { id: true, userId: true, status: true },
    });

    if (!profile) {
      throw new NotFoundException('Driver profile not found.');
    }

    if (profile.status !== DriverStatus.SUSPENDED) {
      throw new BadRequestException('Driver is not suspended.');
    }

    await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: { status: DriverStatus.OFFLINE },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        action: 'DRIVER_REACTIVATED',
        entityType: 'DRIVER_PROFILE',
        entityId: driverId,
        metadata: {} satisfies Prisma.InputJsonObject,
      },
    });

    void this.notificationsService.enqueue({
      userId: profile.userId,
      title: 'Compte reactivé',
      body: 'Votre compte chauffeur est de nouveau actif. Bon retour sur Orbi !',
      channel: NotificationChannel.PUSH,
      dedupeKey: `driver-reactivated:${driverId}:${Date.now()}`,
      data: { type: 'driver_account_reactivated' },
    });

    return { driverId, status: 'OFFLINE' };
  }

  private assertReviewAuthority(
    status: UpdateDriverOnboardingReviewDto['status'],
    auth: RequestAuthContext,
  ) {
    if (status !== 'UNDER_REVIEW' && !reviewDecisionRoles.has(auth.user.role)) {
      throw new ForbiddenException(
        'Only admin or ops can approve, reject, or request onboarding changes.',
      );
    }
  }

  private assertApprovalReadiness(
    profile: {
      user: { isPhoneVerified?: boolean | null };
      licenseNumber?: string | null;
      vehicles: Array<{ id: string }>;
      onboardingDocuments: Array<{
        id: string;
        type: string;
        status: DriverDocumentStatus;
        expiresAt: Date | null;
        metadata?: Prisma.JsonValue | null;
      }>;
    },

  private async persistDriverDocumentObjectVerification(
    document: {
      id: string;
      type: string;
      fileName?: string | null;
      storageKey: string;
    },

  private resolveDriverDocumentSafetyScan(
    document: {
      type: string;
      fileName?: string | null;
      storageKey: string;
    },

  private resolveDocumentExtension(value: string) {
    const leafName = value.trim().split(/[\\/]/).pop()?.trim() ?? '';

    if (!leafName.includes('.')) {
      return null;
    }

    return leafName.split('.').pop()?.toLowerCase() ?? null;
  }
}
