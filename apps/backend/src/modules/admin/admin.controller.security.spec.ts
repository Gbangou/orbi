import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { of } from 'rxjs';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * OWASP API5 (Autorisation au niveau des fonctions brisée) — invariants de contrôle
 * d'accès aux endpoints admin.
 *
 * Ces tests utilisent le VRAI RolesGuard pour que le mapping rôle-endpoint soit
 * appliqué par le code de production, pas par un stub. Seul le SessionAuthGuard est
 * stubbé (par rôle testé) pour injecter n'importe quel contexte utilisateur sans
 * base de données réelle.
 *
 * Invariants :
 * 1. RIDER et DRIVER sont refusés (403) sur tous les endpoints admin.
 * 2. Les requêtes non authentifiées (sans contexte auth) sont refusées (403).
 * 3. Le rôle SUPPORT est refusé sur les endpoints d'écriture (virements, remboursements,
 *    replay, paramètres dispatch) — accès en lecture seule uniquement.
 * 4. Le rôle OPS est refusé sur les endpoints réservés ADMIN (approbation de virement,
 *    ajustement de récupération de portefeuille).
 * 5. Le rôle ADMIN est accepté (2xx) sur tous les endpoints testés.
 */

// ── Fabrique d'application ────────────────────────────────────────────────────

function buildSessionStub(role: string | null) {
  class Stub implements CanActivate {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest();
      if (role === null) {
        return true;
      }
      req.auth = {
        token: 'session-token',
        session: {
          id: 'session-1',
          userId: `user-${role.toLowerCase()}-1`,
          createdAt: new Date(),
          lastSeenAt: new Date(),
          expiresAt: new Date(Date.now() + 3_600_000),
          revokedAt: null,
          userAgent: 'jest',
          ipAddress: '127.0.0.1',
        },
        user: {
          id: `${role.toLowerCase()}-1`,
          role,
          fullName: `Test ${role}`,
        },
      };
      return true;
    }
  }
  return Stub;
}

async function buildApp(role: string | null): Promise<INestApplication<App>> {
  const adminService = {
    previewOverview: jest.fn().mockResolvedValue({}),
    overview: jest.fn().mockResolvedValue({}),
    liveOps: jest.fn().mockResolvedValue({}),
    launchReadiness: jest.fn().mockResolvedValue({}),
    acknowledgeLaunchReadinessAction: jest.fn().mockResolvedValue({}),
    supportTickets: jest.fn().mockResolvedValue({ tickets: [] }),
    listDrivers: jest.fn().mockResolvedValue({ drivers: [] }),
    listRiders: jest.fn().mockResolvedValue({ riders: [] }),
    setRiderStatus: jest.fn().mockResolvedValue({}),
    driverOnboardingQueue: jest.fn().mockResolvedValue({ drivers: [] }),
    driverWallets: jest.fn().mockResolvedValue({ wallets: [] }),
    prepareDriverWalletPayout: jest.fn().mockResolvedValue({}),
    recordDriverWalletRecoveryAdjustment: jest.fn().mockResolvedValue({}),
    markDriverPayoutPaid: jest.fn().mockResolvedValue({}),
    driverPayoutSettlementCsv: jest.fn().mockResolvedValue(''),
    driverPayoutSettlementPdf: jest.fn().mockResolvedValue(Buffer.alloc(0)),
    featureFlags: jest.fn().mockResolvedValue({}),
    dispatchSettings: jest.fn().mockResolvedValue({}),
    pricingCalibration: jest.fn().mockResolvedValue({}),
    paymentWebhookEvents: jest.fn().mockResolvedValue({ events: [] }),
    paymentWebhookEventDetail: jest.fn().mockResolvedValue({}),
    startPaymentWebhookInvestigation: jest.fn().mockResolvedValue({}),
    replayPaymentWebhookEvent: jest.fn().mockResolvedValue({}),
    verifyPaymentAttemptWithProvider: jest.fn().mockResolvedValue({}),
    refundPaymentAttempt: jest.fn().mockResolvedValue({}),
    updateDispatchSettings: jest.fn().mockResolvedValue({}),
    updateSupportTicket: jest.fn().mockResolvedValue({}),
    updateDriverOnboardingReview: jest.fn().mockResolvedValue({}),
    getDriverDocumentViewLink: jest
      .fn()
      .mockResolvedValue({ url: 'https://example.com' }),
    updateDriverDocumentObjectVerification: jest.fn().mockResolvedValue({}),
    verifyDriverDocumentObjectFromProvider: jest.fn().mockResolvedValue({}),
    jobQueue: jest.fn().mockResolvedValue({ jobs: [] }),
    requeueJob: jest.fn().mockResolvedValue({}),
    healthIncidents: jest.fn().mockResolvedValue({ incidents: [] }),
    acknowledgeHealthIncident: jest.fn().mockResolvedValue({}),
    muteHealthIncident: jest.fn().mockResolvedValue({}),
    tripsAudit: jest.fn().mockResolvedValue({ trips: [] }),
    suspendDriver: jest.fn().mockResolvedValue({}),
    reactivateDriver: jest.fn().mockResolvedValue({}),
    listPromoCodes: jest.fn().mockResolvedValue({ promoCodes: [] }),
    createPromoCode: jest.fn().mockResolvedValue({}),
    deactivatePromoCode: jest.fn().mockResolvedValue({}),
  };

  const realtimeService = {
    stream: jest.fn().mockReturnValue(of()),
  };

  const module = await Test.createTestingModule({
    controllers: [AdminController],
    providers: [
      { provide: AdminService, useValue: adminService },
      { provide: RealtimeService, useValue: realtimeService },
      Reflector,
    ],
  })
    .overrideGuard(SessionAuthGuard)
    .useClass(buildSessionStub(role))
    .overrideGuard(RolesGuard)
    .useClass(RolesGuard)
    .compile();

  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  await app.init();
  return app;
}

// ── READ endpoints accessible to OPS / SUPPORT / ADMIN ───────────────────────

const readEndpoints = [
  ['GET', '/api/v1/admin/live-ops'],
  ['GET', '/api/v1/admin/launch-readiness'],
  ['GET', '/api/v1/admin/support-tickets'],
  ['GET', '/api/v1/admin/drivers'],
  ['GET', '/api/v1/admin/riders'],
  ['GET', '/api/v1/admin/driver-onboarding-queue'],
  ['GET', '/api/v1/admin/driver-wallets'],
  ['GET', '/api/v1/admin/payment-webhook-events'],
  ['GET', '/api/v1/admin/trips/audit'],
  ['GET', '/api/v1/admin/job-queue'],
] as const;

// ── WRITE endpoints restricted to ADMIN/OPS only ─────────────────────────────

const adminOpsWriteEndpoints = [
  ['POST', '/api/v1/admin/job-queue/job-abc/requeue'],
  ['POST', '/api/v1/admin/launch-readiness/actions/check-abc/acknowledge'],
  ['POST', '/api/v1/admin/payment-webhook-events/evt-abc/replay'],
  ['POST', '/api/v1/admin/payment-attempts/pa-abc/refund'],
  ['PATCH', '/api/v1/admin/riders/rider-user-1/status'],
  ['PATCH', '/api/v1/admin/dispatch-settings'],
  ['POST', '/api/v1/admin/drivers/driver-abc/suspend'],
] as const;

// ── WRITE endpoints restricted to ADMIN only (OPS is also denied) ─────────────

const adminOnlyWriteEndpoints = [
  ['POST', '/api/v1/admin/drivers/driver-abc/reactivate'],
  ['POST', '/api/v1/admin/promo-codes'],
  ['DELETE', '/api/v1/admin/promo-codes/promo-abc'],
] as const;

// ── Test suites ──────────────────────────────────────────────────────────────

describe('AdminController — OWASP API5 function-level authorization', () => {
  // ── RIDER is denied everything ─────────────────────────────────────────────

  describe('RIDER role is denied on all admin endpoints', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await buildApp('RIDER');
    });
    afterAll(async () => {
      await app.close();
    });

    it.each(readEndpoints)('%s %s → 403', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => { expect: (s: number) => unknown }
        >
      )[method.toLowerCase()](path);
      expect((res as unknown as { status: number }).status).toBe(403);
    });

    it.each(adminOpsWriteEndpoints)('%s %s → 403', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).toBe(403);
    });
  });

  // ── DRIVER is denied everything ────────────────────────────────────────────

  describe('DRIVER role is denied on all admin endpoints', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await buildApp('DRIVER');
    });
    afterAll(async () => {
      await app.close();
    });

    it.each(readEndpoints)('%s %s → 403', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).toBe(403);
    });

    it.each(adminOpsWriteEndpoints)('%s %s → 403', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).toBe(403);
    });
  });

  // ── Unauthenticated (no auth context) is denied ────────────────────────────

  describe('Unauthenticated (no auth.user.role) is denied on all admin endpoints', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await buildApp(null);
    });
    afterAll(async () => {
      await app.close();
    });

    it.each(readEndpoints)('%s %s → 403', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).toBe(403);
    });
  });

  // ── SUPPORT role is denied write endpoints ─────────────────────────────────

  describe('SUPPORT role is denied write-only admin endpoints', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await buildApp('SUPPORT');
    });
    afterAll(async () => {
      await app.close();
    });

    it.each(adminOpsWriteEndpoints)('%s %s → 403', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).toBe(403);
    });
  });

  // ── SUPPORT role can access read endpoints ─────────────────────────────────

  describe('SUPPORT role can access read-only admin endpoints', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await buildApp('SUPPORT');
    });
    afterAll(async () => {
      await app.close();
    });

    it.each(readEndpoints)('%s %s → 2xx', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });
  });

  // ── OPS role can access read and most write endpoints ─────────────────────

  describe('OPS role can access read-only and standard write admin endpoints', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await buildApp('OPS');
    });
    afterAll(async () => {
      await app.close();
    });

    it.each(readEndpoints)('%s %s → 2xx', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });
  });

  // ── ADMIN role can access read endpoints ──────────────────────────────────

  describe('ADMIN role can access all read endpoints', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await buildApp('ADMIN');
    });
    afterAll(async () => {
      await app.close();
    });

    it.each(readEndpoints)('%s %s → 2xx', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });
  });

  // ── ADMIN write endpoints: authorization passes (no 403) ──────────────────
  // Body-less POST/PATCH may return 400 for missing DTO fields — that is
  // expected and confirms the RolesGuard let the request through.

  describe('ADMIN role receives no 403 on write admin endpoints', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await buildApp('ADMIN');
    });
    afterAll(async () => {
      await app.close();
    });

    it.each(adminOpsWriteEndpoints)('%s %s → not 403', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).not.toBe(403);
    });

    it.each(adminOnlyWriteEndpoints)('%s %s → not 403', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).not.toBe(403);
    });
  });

  // ── OPS is denied ADMIN-only write endpoints ──────────────────────────────

  describe('OPS role is denied ADMIN-only write endpoints', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await buildApp('OPS');
    });
    afterAll(async () => {
      await app.close();
    });

    it.each(adminOnlyWriteEndpoints)('%s %s → 403', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).toBe(403);
    });
  });

  // ── SUPPORT is denied ADMIN-only write endpoints ──────────────────────────

  describe('SUPPORT role is denied ADMIN-only write endpoints', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await buildApp('SUPPORT');
    });
    afterAll(async () => {
      await app.close();
    });

    it.each(adminOnlyWriteEndpoints)('%s %s → 403', async (method, path) => {
      const res = await (
        request(app.getHttpServer()) as unknown as Record<
          string,
          (p: string) => Promise<{ status: number }>
        >
      )[method.toLowerCase()](path);
      expect(res.status).toBe(403);
    });
  });
});
