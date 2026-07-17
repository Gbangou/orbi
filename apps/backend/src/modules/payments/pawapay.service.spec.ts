import { ConfigService } from '@nestjs/config';
import { PawaPayService } from './pawapay.service';

function makeService(
  env = 'test',
  overrides: Record<string, string | undefined> = {},
) {
  const configService = {
    get: jest.fn((key: string) => {
      if (key in overrides) return overrides[key];
      if (key === 'NODE_ENV') return env;
      if (key === 'PAWAPAY_API_TOKEN') return 'test-api-token';
      if (key === 'PAWAPAY_WEBHOOK_SECRET') return 'test-webhook-secret';
      return undefined;
    }),
  } as unknown as ConfigService;

  return new PawaPayService(configService);
}

describe('PawaPayService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sandbox v2 API contract', () => {
    it('initiates deposits against the sandbox v2 endpoint with the official MMO payload shape', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            depositId: 'f4401bd2-1568-4140-bf2d-eb77d2b2b639',
            status: 'ACCEPTED',
            created: '2026-07-17T09:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      const service = makeService('production', {
        PAWAPAY_ENVIRONMENT: 'sandbox',
      });

      await expect(
        service.initiateDeposit({
          depositId: 'f4401bd2-1568-4140-bf2d-eb77d2b2b639',
          amount: '2400',
          currency: 'XOF',
          correspondent: 'ORANGE_BFA',
          payer: { type: 'MSISDN', address: { value: '22670112233' } },
          customerTimestamp: '2026-07-17T09:00:00Z',
          statementDescription: 'Orbi Course #ABC12345',
          clientReferenceId: 'ride-request-1',
          metadata: [
            { fieldName: 'rideRequestId', fieldValue: 'ride-request-1' },
          ],
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          depositId: 'f4401bd2-1568-4140-bf2d-eb77d2b2b639',
          status: 'ACCEPTED',
        }),
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.sandbox.pawapay.io/v2/deposits',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-token',
          }),
          body: JSON.stringify({
            depositId: 'f4401bd2-1568-4140-bf2d-eb77d2b2b639',
            payer: {
              type: 'MMO',
              accountDetails: {
                phoneNumber: '22670112233',
                provider: 'ORANGE_BFA',
              },
            },
            amount: '2400',
            currency: 'XOF',
            country: 'BFA',
            preAuthorisationCode: undefined,
            clientReferenceId: 'ride-request-1',
            customerMessage: 'Orbi Course #ABC12345',
            metadata: [{ rideRequestId: 'ride-request-1' }],
          }),
        }),
      );
    });

    it('does not call PawaPay when no API token is configured', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const service = makeService('test', { PAWAPAY_API_TOKEN: '' });

      await expect(
        service.initiateDeposit({
          depositId: 'f4401bd2-1568-4140-bf2d-eb77d2b2b639',
          amount: '2400',
          currency: 'XOF',
          correspondent: 'ORANGE_BFA',
          payer: { type: 'MSISDN', address: { value: '22670112233' } },
          customerTimestamp: '2026-07-17T09:00:00Z',
          statementDescription: 'Orbi Course',
        }),
      ).rejects.toThrow('PawaPay API token is not configured.');

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('normalizes v2 deposit status lookup responses for reconciliation', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'FOUND',
            data: {
              depositId: 'f4401bd2-1568-4140-bf2d-eb77d2b2b639',
              status: 'COMPLETED',
              amount: '2400',
              currency: 'XOF',
              payer: {
                type: 'MMO',
                accountDetails: {
                  phoneNumber: '22670112233',
                  provider: 'ORANGE_BFA',
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      const service = makeService();

      await expect(
        service.getDepositStatus('f4401bd2-1568-4140-bf2d-eb77d2b2b639'),
      ).resolves.toEqual(
        expect.objectContaining({
          depositId: 'f4401bd2-1568-4140-bf2d-eb77d2b2b639',
          status: 'COMPLETED',
          payer: { type: 'MMO', address: { value: '22670112233' } },
          correspondent: 'ORANGE_BFA',
        }),
      );
    });
  });

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
        service.isDepositEvent({
          depositId: 'uuid-1',
          refundId: 'ref-1',
          status: 'COMPLETED',
        }),
      ).toBe(false);
    });
  });

  describe('isRefundEvent', () => {
    it('recognises refund events', () => {
      const service = makeService();
      expect(
        service.isRefundEvent({
          refundId: 'ref-1',
          depositId: 'dep-1',
          status: 'COMPLETED',
        }),
      ).toBe(true);
    });

    it('rejects deposit-only payloads', () => {
      const service = makeService();
      expect(
        service.isRefundEvent({ depositId: 'dep-1', status: 'COMPLETED' }),
      ).toBe(false);
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
      expect(
        service.verifyWebhookSignature('{"event":"test"}', 'wrong-sig'),
      ).toBe(false);
    });

    it('returns false for undefined signature', () => {
      const service = makeService();
      expect(
        service.verifyWebhookSignature('{"event":"test"}', undefined),
      ).toBe(false);
    });
  });
});
