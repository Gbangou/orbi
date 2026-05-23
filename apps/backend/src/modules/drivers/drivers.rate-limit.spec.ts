import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ProfileAccessGuard } from '../auth/profile-access.guard';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

/**
 * OWASP API4 (Unrestricted Resource Consumption) — rate limiting on driver
 * mutation endpoints. The document-upload-links endpoint is the most critical:
 * each call generates pre-signed storage URLs, so unbounded calls could exhaust
 * storage quotas. Presence updates are equivalent to GPS writes.
 */

class SessionAuthGuardStub implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.auth = {
      token: 'tok',
      session: {
        id: 'sess-1',
        userId: 'user-driver-1',
        createdAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
        revokedAt: null,
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      },
      user: {
        id: 'user-driver-1',
        role: 'DRIVER',
        fullName: 'Test Driver',
        riderProfile: null,
        driverProfile: { id: 'driver-1' },
      },
    };
    return true;
  }
}

class PassStub implements CanActivate {
  canActivate() {
    return true;
  }
}

describe('DriversController — Rate Limiting (integration)', () => {
  let app: INestApplication<App>;
  let rateLimitService: { consume: jest.Mock; snapshot: jest.Mock };
  let driversService: {
    declineOffer: jest.Mock;
    updateAvailability: jest.Mock;
    updatePresence: jest.Mock;
    upsertOnboarding: jest.Mock;
    createDocumentUploadLinks: jest.Mock;
  };

  async function buildApp(
    rateLimitResponse: { allowed: boolean; remaining: number; resetAt: number },
  ) {
    rateLimitService = {
      consume: jest.fn().mockResolvedValue(rateLimitResponse),
      snapshot: jest.fn(),
    };

    driversService = {
      declineOffer: jest.fn().mockResolvedValue({ declined: true }),
      updateAvailability: jest.fn().mockResolvedValue({ status: 'AVAILABLE' }),
      updatePresence: jest.fn().mockResolvedValue({ updated: true }),
      upsertOnboarding: jest.fn().mockResolvedValue({ onboarding: {} }),
      createDocumentUploadLinks: jest.fn().mockResolvedValue({ links: [] }),
    };

    const moduleFixture = await Test.createTestingModule({
      controllers: [DriversController],
      providers: [
        { provide: DriversService, useValue: driversService },
        { provide: RateLimitService, useValue: rateLimitService },
        Reflector,
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useClass(SessionAuthGuardStub)
      .overrideGuard(RolesGuard)
      .useClass(PassStub)
      .overrideGuard(ProfileAccessGuard)
      .useClass(PassStub)
      .compile();

    const newApp = moduleFixture.createNestApplication();
    newApp.setGlobalPrefix('api');
    newApp.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await newApp.init();
    return newApp;
  }

  afterEach(async () => {
    if (app) await app.close();
  });

  // ── Document upload links (signed URL generation) ─────────────────────────

  describe('PATCH onboarding/document-upload-links', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      app = await buildApp({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/onboarding/document-upload-links')
        .send({ documentTypes: ['LICENSE'] });

      expect(res.status).toBe(429);
      expect(driversService.createDocumentUploadLinks).not.toHaveBeenCalled();
    });

    it('allows the call when under the rate limit', async () => {
      app = await buildApp({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/onboarding/document-upload-links')
        .send({ documentTypes: ['LICENSE'] });

      expect(res.status).toBe(200);
      expect(driversService.createDocumentUploadLinks).toHaveBeenCalledTimes(1);
    });

    it('sets X-RateLimit-Limit to 5 (signed URL generation is expensive)', async () => {
      app = await buildApp({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/onboarding/document-upload-links')
        .send({ documentTypes: ['LICENSE'] });

      expect(res.headers['x-ratelimit-limit']).toBe('5');
    });

    it('rate limit key includes the authenticated user id', async () => {
      app = await buildApp({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 });

      await request(app.getHttpServer())
        .patch('/api/v1/drivers/onboarding/document-upload-links')
        .send({ documentTypes: ['LICENSE'] });

      const consumeArg = rateLimitService.consume.mock.calls[0][0] as string;
      expect(consumeArg).toContain('user-driver-1');
    });
  });

  // ── Presence update (GPS equivalent) ─────────────────────────────────────

  describe('PATCH presence', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      app = await buildApp({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/presence')
        .send({ latitude: 12.37, longitude: -1.52, isOnline: true });

      expect(res.status).toBe(429);
      expect(driversService.updatePresence).not.toHaveBeenCalled();
    });

    it('sets X-RateLimit-Limit to 60 (1 update/second × 60s)', async () => {
      app = await buildApp({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/presence')
        .send({ latitude: 12.37, longitude: -1.52, isOnline: true });

      expect(res.headers['x-ratelimit-limit']).toBe('60');
    });
  });

  // ── Offer decline ─────────────────────────────────────────────────────────

  describe('POST offers/:rideRequestId/decline', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      app = await buildApp({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/drivers/offers/request-abc-1/decline')
        .send({});

      expect(res.status).toBe(429);
      expect(driversService.declineOffer).not.toHaveBeenCalled();
    });

    it('sets X-RateLimit-Limit to 30', async () => {
      app = await buildApp({ allowed: true, remaining: 29, resetAt: Date.now() + 60_000 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/drivers/offers/request-abc-1/decline')
        .send({});

      expect(res.headers['x-ratelimit-limit']).toBe('30');
    });
  });

  // ── Availability update ───────────────────────────────────────────────────

  describe('PATCH availability', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      app = await buildApp({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/availability')
        .send({ status: 'AVAILABLE' });

      expect(res.status).toBe(429);
      expect(driversService.updateAvailability).not.toHaveBeenCalled();
    });

    it('sets X-RateLimit-Limit to 20', async () => {
      app = await buildApp({ allowed: true, remaining: 19, resetAt: Date.now() + 60_000 });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/drivers/availability')
        .send({ status: 'AVAILABLE' });

      expect(res.headers['x-ratelimit-limit']).toBe('20');
    });
  });
});
