import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RideRequestsController } from './ride-requests.controller';
import { RideRequestsService } from './ride-requests.service';

/**
 * Integration tests verifying that rate limiting is enforced on the
 * ride-requests endpoints (OWASP API4 — Unrestricted Resource Consumption).
 *
 * Strategy: use the real RateLimitGuard wired to a mock RateLimitService
 * so we can control the allow/deny decision without a real Redis/Postgres backend.
 */

class SessionAuthGuardStub implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.auth = {
      token: 'tok',
      session: {
        id: 'sess-1',
        userId: 'user-rider-1',
        createdAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
        revokedAt: null,
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      },
      user: {
        id: 'user-rider-1',
        role: 'RIDER',
        fullName: 'Test Rider',
        riderProfile: { id: 'rider-1' },
        driverProfile: null,
      },
    };
    return true;
  }
}

describe('RideRequestsController — Rate Limiting (integration)', () => {
  let app: INestApplication<App>;
  let rateLimitService: { consume: jest.Mock; snapshot: jest.Mock };
  let rideRequestsService: {
    create: jest.Mock;
    findActive: jest.Mock;
    cancel: jest.Mock;
  };

  beforeEach(async () => {
    rateLimitService = {
      consume: jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetAt: Date.now() + 60_000,
      }),
      snapshot: jest.fn(),
    };

    rideRequestsService = {
      create: jest.fn().mockResolvedValue({ rideRequest: { id: 'req-1' } }),
      findActive: jest.fn().mockResolvedValue([]),
      cancel: jest.fn().mockResolvedValue({
        rideRequest: { id: 'req-1', status: 'CANCELLED' },
      }),
    };

    const moduleFixture = await Test.createTestingModule({
      controllers: [RideRequestsController],
      providers: [
        { provide: RideRequestsService, useValue: rideRequestsService },
        { provide: RateLimitService, useValue: rateLimitService },
        RateLimitGuard,
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useClass(SessionAuthGuardStub)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── POST /ride-requests ────────────────────────────────────────────────────

  describe('POST /ride-requests — creation rate limit', () => {
    it('returns 429 when the per-user creation limit is exceeded', async () => {
      rateLimitService.consume.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 30_000,
      });

      await request(app.getHttpServer())
        .post('/api/v1/ride-requests')
        .send({})
        .expect(429);
    });

    it('sets X-RateLimit-Limit header to the configured limit (10)', async () => {
      rateLimitService.consume.mockResolvedValue({
        allowed: true,
        remaining: 7,
        resetAt: Date.now() + 60_000,
      });
      // Service will throw due to invalid body — we only care about headers set by guard
      rideRequestsService.create.mockRejectedValue(new Error('validation'));

      const res = await request(app.getHttpServer())
        .post('/api/v1/ride-requests')
        .send({});

      expect(res.headers['x-ratelimit-limit']).toBe('10');
      expect(res.headers['x-ratelimit-remaining']).toBe('7');
    });

    it('rate-limit key is scoped to user — different users have independent counters', async () => {
      rateLimitService.consume.mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetAt: Date.now() + 60_000,
      });
      rideRequestsService.create.mockRejectedValue(new Error('skip'));

      await request(app.getHttpServer())
        .post('/api/v1/ride-requests')
        .send({});

      const callKey: string = rateLimitService.consume.mock.calls[0][0] as string;
      expect(callKey).toContain('user:user-rider-1');
    });

    it('passes the configured limit (10) and window (60s) to the store', async () => {
      rideRequestsService.create.mockRejectedValue(new Error('skip'));

      await request(app.getHttpServer())
        .post('/api/v1/ride-requests')
        .send({});

      expect(rateLimitService.consume).toHaveBeenCalledWith(
        expect.stringContaining('POST:'),
        10,
        60_000,
      );
    });
  });

  // ── DELETE /ride-requests/:id — cancel rate limit ─────────────────────────

  describe('DELETE /ride-requests/:id — cancel rate limit', () => {
    it('returns 429 when the cancel limit is exceeded', async () => {
      rateLimitService.consume.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 10_000,
      });

      await request(app.getHttpServer())
        .delete('/api/v1/ride-requests/req-1')
        .expect(429);
    });

    it('sets X-RateLimit-Limit header to the configured cancel limit (20)', async () => {
      rateLimitService.consume.mockResolvedValue({
        allowed: true,
        remaining: 19,
        resetAt: Date.now() + 60_000,
      });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/ride-requests/req-1');

      expect(res.headers['x-ratelimit-limit']).toBe('20');
    });
  });
});
