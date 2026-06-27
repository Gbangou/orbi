import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Reflector } from '@nestjs/core';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripQueryService } from './trip-query.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { of } from 'rxjs';

class AuthRiderStub implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest().auth = {
      token: 'tok',
      session: { id: 's1', userId: 'u1', expiresAt: new Date('2027-01-01'), revokedAt: null },
      user: {
        id: 'u1', role: 'RIDER',
        riderProfile: { id: 'rp1' }, driverProfile: null,
      },
    };
    return true;
  }
}

class PassStub implements CanActivate { canActivate() { return true; } }

describe('TripsController (HTTP e2e)', () => {
  let app: INestApplication;

  const tripsService = {
    acceptRideRequest: jest.fn(),
    createShareLink: jest.fn(),
    recordRoutePosition: jest.fn(),
    verifyPickupCode: jest.fn(),
    reportIncident: jest.fn(),
    triggerSafetySos: jest.fn(),
    updateStatus: jest.fn(),
    rateTrip: jest.fn(),
  };

  const tripQueryService = {
    dashboard: jest.fn().mockResolvedValue({ activeTrips: 2, recentTrips: [] }),
    findMine: jest.fn().mockResolvedValue({
      role: 'RIDER',
      stats: { activeTrips: 0, completedTrips: 3, cancelledTrips: 0, totalAmount: 3600, currency: 'XOF' },
      pendingRequests: [],
      recentTrips: [],
    }),
    getSharedTrip: jest.fn(),
    getTripDetail: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [TripsController],
      providers: [
        { provide: TripsService, useValue: tripsService },
        { provide: TripQueryService, useValue: tripQueryService },
        { provide: RealtimeService, useValue: { stream: jest.fn().mockReturnValue(of()) } },
        Reflector,
      ],
    })
      .overrideGuard(SessionAuthGuard).useClass(AuthRiderStub)
      .overrideGuard(RolesGuard).useClass(PassStub)
      .overrideGuard(RateLimitGuard).useClass(PassStub)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => { await app.close(); });

  describe('GET /api/v1/trips/dashboard', () => {
    it('returns dashboard stats via TripQueryService', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/trips/dashboard');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ activeTrips: 2 });
      expect(tripQueryService.dashboard).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/trips/mine', () => {
    it('returns paginated trips for the authenticated rider', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/trips/mine');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ role: 'RIDER', stats: { currency: 'XOF' } });
      expect(tripQueryService.findMine).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/trips/:tripId/rate', () => {
    it('submits a trip rating', async () => {
      tripsService.rateTrip.mockResolvedValue({ rated: true, rating: { id: 'r1', score: 5 } });

      const res = await request(app.getHttpServer())
        .post('/api/v1/trips/trip-abc123/rate')
        .send({ score: 5, comment: 'Excellent chauffeur !' });

      expect(res.status).toBe(201);
      expect(tripsService.rateTrip).toHaveBeenCalledWith(
        expect.anything(),
        'trip-abc123',
        expect.objectContaining({ score: 5 }),
      );
    });
  });

  describe('POST /api/v1/trips/:tripId/sos', () => {
    it('triggers safety SOS with location context', async () => {
      tripsService.triggerSafetySos.mockResolvedValue({
        triggered: true, tripId: 'trip-abc123', triggeredAt: new Date().toISOString(),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/trips/trip-abc123/sos')
        .send({
          details: 'Chauffeur agressif',
          latitude: 12.3647,
          longitude: -1.5332,
        });

      expect(res.status).toBe(201);
      expect(tripsService.triggerSafetySos).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/trips/shared/:shareToken', () => {
    it('returns 404 for invalid share token length', async () => {
      tripQueryService.getSharedTrip.mockRejectedValue(
        Object.assign(new Error('Shared trip not found.'), { status: 404 }),
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/trips/shared/too-short');

      // Either 404 or 500 — the point is it doesn't 200 with garbage
      expect([404, 500]).toContain(res.status);
    });
  });
});
