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
import { ProfileAccessGuard } from '../auth/profile-access.guard';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { RidersController } from './riders.controller';
import { RidersService } from './riders.service';
import { WalletTopUpService } from './wallet-topup.service';

class AuthStub implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest().auth = {
      token: 'tok',
      session: { id: 's1', userId: 'u1', expiresAt: new Date('2027-01-01'), revokedAt: null },
      user: { id: 'u1', role: 'RIDER', email: 'r@test.com', fullName: 'Rider Test', riderProfile: { id: 'rp1' }, driverProfile: null },
    };
    return true;
  }
}

class PassStub implements CanActivate {
  canActivate() { return true; }
}

describe('RidersController (HTTP e2e)', () => {
  let app: INestApplication<App>;

  const ridersService = {
    getMe: jest.fn().mockResolvedValue({ profile: { id: 'rp1', fullName: 'Rider Test' } }),
    overview: jest.fn().mockResolvedValue({ riders: 0 }),
    createSavedPlace: jest.fn(),
    updateSavedPlace: jest.fn(),
    deleteSavedPlace: jest.fn(),
    updateTrustedContact: jest.fn(),
  };

  const walletTopUpService = {
    getWalletBalance: jest.fn().mockResolvedValue({ balance: 5000, currency: 'XOF', isLocked: false, lastUpdatedAt: null }),
    getTopUpHistory: jest.fn().mockResolvedValue([]),
    initiateTopUp: jest.fn().mockResolvedValue({
      topUpId: 'tu-1',
      depositId: 'dep-1',
      amount: 2000,
      currency: 'XOF',
      status: 'PENDING',
      awaitingPhoneConfirmation: true,
      message: 'Vérifiez votre téléphone.',
    }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [RidersController],
      providers: [
        { provide: RidersService, useValue: ridersService },
        { provide: WalletTopUpService, useValue: walletTopUpService },
        Reflector,
      ],
    })
      .overrideGuard(SessionAuthGuard).useClass(AuthStub)
      .overrideGuard(RolesGuard).useClass(PassStub)
      .overrideGuard(ProfileAccessGuard).useClass(PassStub)
      .overrideGuard(RateLimitGuard).useClass(PassStub)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => { await app.close(); });

  describe('GET /api/v1/riders/me/wallet', () => {
    it('returns the current wallet balance', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/riders/me/wallet');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ balance: 5000, currency: 'XOF', isLocked: false });
      expect(walletTopUpService.getWalletBalance).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/riders/me/wallet/topup-history', () => {
    it('returns empty history for new riders', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/riders/me/wallet/topup-history');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/v1/riders/me/wallet/topup', () => {
    it('initiates a top-up and returns PENDING status', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/riders/me/wallet/topup')
        .send({
          amountXof: 2000,
          mobileMoneyNetwork: 'ORANGE_BFA',
          customerPhoneNumber: '70123456',
        });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'PENDING',
        awaitingPhoneConfirmation: true,
        currency: 'XOF',
      });
      expect(walletTopUpService.initiateTopUp).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountXof: 2000, mobileMoneyNetwork: 'ORANGE_BFA' }),
      );
    });
  });

  describe('GET /api/v1/riders/me', () => {
    it('delegates to ridersService.getMe', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/riders/me');
      expect(res.status).toBe(200);
      expect(ridersService.getMe).toHaveBeenCalled();
    });
  });
});
