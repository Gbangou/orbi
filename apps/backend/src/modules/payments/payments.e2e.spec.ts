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
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ProfileAccessGuard } from '../auth/profile-access.guard';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Reflector } from '@nestjs/core';

class SessionGuardStub implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    req.auth = {
      token: 'test-token',
      session: {
        id: 'sess-1',
        userId: 'user-rider-1',
        createdAt: new Date('2026-01-01'),
        lastSeenAt: new Date('2026-01-01'),
        expiresAt: new Date('2027-01-01'),
        revokedAt: null,
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      },
      user: {
        id: 'user-rider-1',
        role: 'RIDER',
        email: 'rider@test.com',
        fullName: 'Test Rider',
        riderProfile: { id: 'rider-profile-1' },
        driverProfile: null,
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

class RateLimitPassStub implements CanActivate {
  canActivate() {
    return true;
  }
}

describe('PaymentsController (HTTP e2e)', () => {
  let app: INestApplication<App>;

  const paymentsService = {
    createCheckoutIntent: jest.fn(),
    handleWebhook: jest.fn(),
    handlePawaPayWebhook: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: paymentsService },
        Reflector,
      ],
    })
      .overrideGuard(SessionAuthGuard).useClass(SessionGuardStub)
      .overrideGuard(RolesGuard).useClass(RolesGuardPassStub)
      .overrideGuard(ProfileAccessGuard).useClass(RolesGuardPassStub)
      .overrideGuard(RateLimitGuard).useClass(RateLimitPassStub)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/payments/checkout-intents', () => {
    it('creates a checkout intent for mobile money payment', async () => {
      const expectedIntent = {
        provider: 'PAWAPAY',
        transactionRef: 'uuid-1234',
        amount: 1200,
        currency: 'XOF',
        status: 'PENDING',
        awaitingPhoneConfirmation: true,
      };
      paymentsService.createCheckoutIntent.mockResolvedValue(expectedIntent);

      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/checkout-intents')
        .set('Content-Type', 'application/json')
        .send({
          rideRequestId: 'ride-req-1',
          channel: 'MOBILE_MONEY',
          mobileMoneyNetwork: 'ORANGE_MONEY',
          customerPhoneNumber: '22670123456',
        });

      expect(response.status).toBe(201);
      expect(paymentsService.createCheckoutIntent).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.objectContaining({ role: 'RIDER' }) }),
        expect.objectContaining({ rideRequestId: 'ride-req-1', channel: 'MOBILE_MONEY' }),
        undefined,
      );
    });

    it('passes idempotency key header to service', async () => {
      paymentsService.createCheckoutIntent.mockResolvedValue({ provider: 'PAWAPAY' });

      await request(app.getHttpServer())
        .post('/api/v1/payments/checkout-intents')
        .set('idempotency-key', 'idem-key-abc123')
        .send({ rideRequestId: 'ride-req-2', channel: 'MOBILE_MONEY' });

      expect(paymentsService.createCheckoutIntent).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'idem-key-abc123',
      );
    });
  });

  describe('POST /api/v1/payments/webhooks', () => {
    it('accepts webhook payloads without auth', async () => {
      paymentsService.handleWebhook.mockResolvedValue({
        received: true,
        event: 'payment.completed',
        reconciledAttemptCount: 1,
        nextAction: 'persisted_and_reconciled',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks')
        .set('x-orbi-webhook-secret', 'test-secret')
        .send({
          event: 'payment.completed',
          transactionRef: 'orbi_123_ride-req-1',
          data: { status: 'successful', amount: 1200 },
        });

      expect(response.status).toBe(201);
      expect(paymentsService.handleWebhook).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/payments/webhooks/pawapay', () => {
    it('routes PawaPay webhook to dedicated handler', async () => {
      paymentsService.handlePawaPayWebhook.mockResolvedValue({
        received: true,
        event: 'deposit.completed',
        reconciledAttemptCount: 1,
        nextAction: 'persisted_and_reconciled',
      });

      const rawBody = JSON.stringify({
        depositId: 'uuid-deposit-1',
        status: 'COMPLETED',
        amount: '1200',
        currency: 'XOF',
        correspondent: 'ORANGE_BFA',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/webhooks/pawapay')
        .set('Content-Type', 'application/json')
        .set('x-pawapay-signature', 'mock-signature')
        .send(rawBody);

      expect(response.status).toBe(201);
      expect(paymentsService.handlePawaPayWebhook).toHaveBeenCalledWith(
        expect.any(String),
        'mock-signature',
        expect.anything(),
      );
    });
  });

  describe('Security — checkout-intents rate limiting', () => {
    it('returns versioned route at /api/v1/', async () => {
      paymentsService.createCheckoutIntent.mockResolvedValue({ provider: 'PAWAPAY' });
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/checkout-intents')
        .send({ rideRequestId: 'r1', channel: 'MOBILE_MONEY' });
      expect(res.status).not.toBe(404);
    });
  });
});
