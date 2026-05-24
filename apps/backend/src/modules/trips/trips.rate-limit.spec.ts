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
import { of } from 'rxjs';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

/**
 * OWASP API4 (Unrestricted Resource Consumption) — rate limiting on trip
 * endpoints, especially the GPS route-position endpoint which receives the
 * highest request volume and must not allow unbounded writes per user.
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

class RolesGuardPassStub implements CanActivate {
  canActivate() {
    return true;
  }
}

describe('TripsController — Rate Limiting (integration)', () => {
  let app: INestApplication<App>;
  let rateLimitService: { consume: jest.Mock; snapshot: jest.Mock };
  let tripsService: {
    acceptRideRequest: jest.Mock;
    recordRoutePosition: jest.Mock;
    reportIncident: jest.Mock;
    rateTripByRider: jest.Mock;
  };

  async function buildApp(rateLimitResponse: {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }) {
    rateLimitService = {
      consume: jest.fn().mockResolvedValue(rateLimitResponse),
      snapshot: jest.fn(),
    };

    tripsService = {
      acceptRideRequest: jest
        .fn()
        .mockResolvedValue({ trip: { id: 'trip-1' } }),
      recordRoutePosition: jest.fn().mockResolvedValue({ recorded: true }),
      reportIncident: jest
        .fn()
        .mockResolvedValue({ incident: { id: 'inc-1' } }),
      rateTripByRider: jest.fn().mockResolvedValue({ rated: true }),
    };

    const moduleFixture = await Test.createTestingModule({
      controllers: [TripsController],
      providers: [
        { provide: TripsService, useValue: tripsService },
        {
          provide: RealtimeService,
          useValue: { stream: jest.fn().mockReturnValue(of()) },
        },
        { provide: RateLimitService, useValue: rateLimitService },
        Reflector,
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useClass(SessionAuthGuardStub)
      .overrideGuard(RolesGuard)
      .useClass(RolesGuardPassStub)
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

  // ── Route position (GPS update) ────────────────────────────────────────────

  describe('POST :tripId/route-position', () => {
    it('returns 429 when rate limit is exceeded for route position updates', async () => {
      app = await buildApp({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60_000,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/trips/trip-abc-1/route-position')
        .send({ latitude: 12.37, longitude: -1.52 });

      expect(res.status).toBe(429);
      expect(tripsService.recordRoutePosition).not.toHaveBeenCalled();
    });

    it('allows route position recording when under the rate limit', async () => {
      app = await buildApp({
        allowed: true,
        remaining: 59,
        resetAt: Date.now() + 60_000,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/trips/trip-abc-1/route-position')
        .send({ latitude: 12.37, longitude: -1.52 });

      expect(res.status).toBe(201);
      expect(tripsService.recordRoutePosition).toHaveBeenCalledTimes(1);
    });

    it('sets X-RateLimit-Limit to 60 (1 update/second × 60 seconds)', async () => {
      app = await buildApp({
        allowed: true,
        remaining: 59,
        resetAt: Date.now() + 60_000,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/trips/trip-abc-1/route-position')
        .send({ latitude: 12.37, longitude: -1.52 });

      expect(res.headers['x-ratelimit-limit']).toBe('60');
    });

    it('rate limit key includes the authenticated user id (user-scoped, not IP-scoped)', async () => {
      app = await buildApp({
        allowed: true,
        remaining: 59,
        resetAt: Date.now() + 60_000,
      });

      await request(app.getHttpServer())
        .post('/api/v1/trips/trip-abc-1/route-position')
        .send({ latitude: 12.37, longitude: -1.52 });

      const consumeArg = rateLimitService.consume.mock.calls[0][0] as string;
      expect(consumeArg).toContain('user-driver-1');
    });
  });

  // ── Trip acceptance ────────────────────────────────────────────────────────

  describe('POST accept/:rideRequestId', () => {
    it('returns 429 when rate limit is exceeded for trip acceptance', async () => {
      app = await buildApp({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60_000,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/trips/accept/request-abc-1')
        .send({});

      expect(res.status).toBe(429);
      expect(tripsService.acceptRideRequest).not.toHaveBeenCalled();
    });

    it('sets X-RateLimit-Limit to 30 for trip acceptance', async () => {
      app = await buildApp({
        allowed: true,
        remaining: 29,
        resetAt: Date.now() + 60_000,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/trips/accept/request-abc-1')
        .send({});

      expect(res.headers['x-ratelimit-limit']).toBe('30');
    });
  });
});
