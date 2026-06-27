import { ConfigService } from '@nestjs/config';
import { PawaPayService } from './pawapay.service';

function makeService(env = 'test') {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'NODE_ENV') return env;
      if (key === 'PAWAPAY_API_TOKEN') return 'test-api-token';
      if (key === 'PAWAPAY_WEBHOOK_SECRET') return 'test-webhook-secret';
      return undefined;
    }),
  } as unknown as ConfigService;

  return new PawaPayService(configService);
}

describe('PawaPayService', () => {
  describe('isDepositEvent', () => {
    it('recognises deposit events by depositId without refundId', () => {
      const service = makeService();
      expect(
        service.isDepositEvent({ depositId: 'uuid-1', status: 'COMPLETED' }),
      ).toBe(true);
    });

    it('rejects refund events', () => {
      const service = makeService();
      expect(
        service.isDepositEvent({ depositId: 'uuid-1', refundId: 'ref-1', status: 'COMPLETED' }),
      ).toBe(false);
    });
  });

  describe('isRefundEvent', () => {
    it('recognises refund events', () => {
      const service = makeService();
      expect(
        service.isRefundEvent({ refundId: 'ref-1', depositId: 'dep-1', status: 'COMPLETED' }),
      ).toBe(true);
    });

    it('rejects deposit-only payloads', () => {
      const service = makeService();
      expect(service.isRefundEvent({ depositId: 'dep-1', status: 'COMPLETED' })).toBe(false);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('returns false when no secret is configured', () => {
      const configService = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService;
      const service = new PawaPayService(configService);
      expect(service.verifyWebhookSignature('body', 'sig')).toBe(false);
    });

    it('returns false for mismatched signature', () => {
      const service = makeService();
      expect(service.verifyWebhookSignature('{"event":"test"}', 'wrong-sig')).toBe(false);
    });

    it('returns false for undefined signature', () => {
      const service = makeService();
      expect(service.verifyWebhookSignature('{"event":"test"}', undefined)).toBe(false);
    });
  });
});
