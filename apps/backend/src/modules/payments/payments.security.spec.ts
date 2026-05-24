import { createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Suite de régression sécurité — invariants d'authentification des webhooks.
 *
 * OWASP API2 (Authentification brisée) — les webhooks des prestataires de paiement
 * doivent être authentifiés avant toute mutation d'état. Ces tests verrouillent
 * les invariants suivants :
 *
 * 1. Secret partagé de webhook : les requêtes avec un secret absent ou incorrect
 *    sont rejetées avant tout accès à la base de données.
 * 2. HMAC fournisseur (Flutterwave) : le HMAC-SHA256 sur rawBody est vérifié avec
 *    timingSafeEqual ; un body altéré est rejeté.
 * 3. Hash de vérification fournisseur (Flutterwave) : la comparaison directe du hash
 *    est un fallback ; une valeur incorrecte est rejetée.
 * 4. Token CinetPay : HMAC-SHA256 hex sur une concaténation canonique de champs
 *    doit correspondre au x-token ; un token incorrect est rejeté.
 * 5. Passthrough : sans clé de signature configurée, la vérification est ignorée
 *    (environnements dev/test — jamais en production où les clés sont définies).
 */
describe('PaymentsService — Sécurité des webhooks', () => {
  function createService(
    provider = 'flutterwave',
    configOverrides: Record<string, string | undefined> = {},
  ) {
    const baseConfig: Record<string, string | undefined> = {
      'payments.provider': provider,
      'payments.currency': 'XOF',
      'payments.webhookSecret': 'secret_123',
      'payments.flutterwave.publicKey': 'pk_test_xxx',
      'payments.flutterwave.secretKey': 'sk_test_xxx',
      'payments.flutterwave.webhookSecretHash': undefined,
      'payments.cinetpay.siteId': 'site_123',
      'payments.cinetpay.apiKey': 'api_123',
      'payments.cinetpay.secretKey': undefined,
      'payments.defaultRedirectUrl': 'https://app.orbi.bf/payments/return',
    };

    const values = { ...baseConfig, ...configOverrides };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'app.frontendOrigins') {
          return ['https://app.orbi.bf'];
        }
        return values[key];
      }),
    };

    const prisma = {
      rideRequest: { findUnique: jest.fn().mockResolvedValue(null) },
      paymentAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      paymentWebhookEvent: {
        create: jest.fn().mockResolvedValue({ id: 'wh-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      wallet: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      walletTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      trip: { findFirst: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const featureFlagsService = {
      isEnabled: jest.fn().mockReturnValue(true),
    };

    return {
      service: new PaymentsService(
        configService as never,
        prisma as never,
        featureFlagsService as never,
      ),
      prisma,
      configService,
    };
  }

  const baseFlutterwavePayload = {
    event: 'charge.completed',
    transactionRef: 'orbi_fw_ref',
    data: { status: 'successful', id: 12345 },
  };

  const baseCinetPayPayload = {
    cpm_site_id: 'site_123',
    cpm_trans_id: 'orbi_cp_ref',
    cpm_trans_date: '2026-05-23',
    cpm_amount: '2400',
    cpm_currency: 'XOF',
    signature: '',
    payment_method: 'MOBILE_MONEY',
    cel_phone_num: '0700000000',
    cpm_phone_prefixe: '226',
    cpm_language: 'FR',
    cpm_version: 'V2',
    cpm_payment_config: 'SINGLE',
    cpm_page_action: 'PAYMENT',
    cpm_custom: '',
    cpm_designation: 'Orbi Ride',
    cpm_error_message: '',
  };

  // ── Shared webhook secret ──────────────────────────────────────────────────

  describe('Shared webhook secret', () => {
    it('rejects a request with a wrong shared secret — UnauthorizedException before any DB call', async () => {
      const { service, prisma } = createService();

      await expect(
        service.handleWebhook('wrong_secret', baseFlutterwavePayload),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.paymentWebhookEvent.create).not.toHaveBeenCalled();
    });

    it('rejects a request with undefined secret when a shared secret is configured', async () => {
      const { service } = createService();

      await expect(
        service.handleWebhook(undefined, baseFlutterwavePayload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an empty string secret when a shared secret is configured', async () => {
      const { service } = createService();

      await expect(
        service.handleWebhook('', baseFlutterwavePayload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('passes when the shared secret is correct and no provider signature is configured', async () => {
      const { service } = createService('flutterwave', {
        'payments.flutterwave.webhookSecretHash': undefined,
      });

      // Payload does not match any known transaction → stored as unknown reference
      // The important thing is that it does NOT throw UnauthorizedException
      await expect(
        service.handleWebhook('secret_123', baseFlutterwavePayload),
      ).resolves.toBeDefined();
    });

    it('passes through when no shared secret is configured in the environment', async () => {
      const { service } = createService('flutterwave', {
        'payments.webhookSecret': undefined,
        'payments.flutterwave.webhookSecretHash': undefined,
      });

      await expect(
        service.handleWebhook(undefined, baseFlutterwavePayload),
      ).resolves.toBeDefined();
    });
  });

  // ── Flutterwave provider signature (HMAC-SHA256 over rawBody) ─────────────

  describe('Flutterwave HMAC signature', () => {
    const secretHash = 'fw_secret_hash_456';
    const rawBody = JSON.stringify(baseFlutterwavePayload);
    const validHmac = createHmac('sha256', secretHash)
      .update(rawBody)
      .digest('base64');
    const validVerifHash = secretHash;

    it('accepts a request with a valid HMAC-SHA256 rawBody signature', async () => {
      const { service } = createService('flutterwave', {
        'payments.flutterwave.webhookSecretHash': secretHash,
      });

      await expect(
        service.handleWebhook('secret_123', baseFlutterwavePayload, {
          rawBody,
          flutterwaveSignature: validHmac,
        }),
      ).resolves.toBeDefined();
    });

    it('accepts a request where verif-hash directly matches the configured secret hash', async () => {
      const { service } = createService('flutterwave', {
        'payments.flutterwave.webhookSecretHash': secretHash,
      });

      await expect(
        service.handleWebhook('secret_123', baseFlutterwavePayload, {
          flutterwaveVerificationHash: validVerifHash,
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a request with a tampered rawBody — HMAC does not match', async () => {
      const { service } = createService('flutterwave', {
        'payments.flutterwave.webhookSecretHash': secretHash,
      });

      const tamperedBody = JSON.stringify({
        ...baseFlutterwavePayload,
        event: 'payment.injected',
      });
      const tamperedHmac = createHmac('sha256', 'wrong_key')
        .update(tamperedBody)
        .digest('base64');

      await expect(
        service.handleWebhook('secret_123', baseFlutterwavePayload, {
          rawBody: tamperedBody,
          flutterwaveSignature: tamperedHmac,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when verif-hash does not match the configured secret hash', async () => {
      const { service } = createService('flutterwave', {
        'payments.flutterwave.webhookSecretHash': secretHash,
      });

      await expect(
        service.handleWebhook('secret_123', baseFlutterwavePayload, {
          flutterwaveVerificationHash: 'wrong_hash_value',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when no signature or verif-hash is provided but provider key is configured', async () => {
      const { service } = createService('flutterwave', {
        'payments.flutterwave.webhookSecretHash': secretHash,
      });

      await expect(
        service.handleWebhook('secret_123', baseFlutterwavePayload, {}),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── CinetPay HMAC token ────────────────────────────────────────────────────

  describe('CinetPay HMAC token', () => {
    const cinetpaySecretKey = 'cp_secret_789';

    function computeCinetPayToken(
      payload: Record<string, string>,
      secretKey: string,
    ) {
      const fields = [
        'cpm_site_id',
        'cpm_trans_id',
        'cpm_trans_date',
        'cpm_amount',
        'cpm_currency',
        'signature',
        'payment_method',
        'cel_phone_num',
        'cpm_phone_prefixe',
        'cpm_language',
        'cpm_version',
        'cpm_payment_config',
        'cpm_page_action',
        'cpm_custom',
        'cpm_designation',
        'cpm_error_message',
      ];
      const canonical = fields.map((f) => payload[f] ?? '').join('');
      return createHmac('sha256', secretKey).update(canonical).digest('hex');
    }

    it('accepts a CinetPay webhook with the correct HMAC token', async () => {
      const { service } = createService('cinetpay', {
        'payments.cinetpay.secretKey': cinetpaySecretKey,
        'payments.cinetpay.siteId': 'site_123',
        'payments.cinetpay.apiKey': 'api_123',
      });

      const validToken = computeCinetPayToken(
        baseCinetPayPayload as unknown as Record<string, string>,
        cinetpaySecretKey,
      );

      await expect(
        service.handleWebhook('secret_123', baseCinetPayPayload, {
          cinetpayToken: validToken,
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a CinetPay webhook with a wrong token', async () => {
      const { service } = createService('cinetpay', {
        'payments.cinetpay.secretKey': cinetpaySecretKey,
        'payments.cinetpay.siteId': 'site_123',
        'payments.cinetpay.apiKey': 'api_123',
      });

      await expect(
        service.handleWebhook('secret_123', baseCinetPayPayload, {
          cinetpayToken: 'wrong_token_value',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a CinetPay webhook with an undefined token when key is configured', async () => {
      const { service } = createService('cinetpay', {
        'payments.cinetpay.secretKey': cinetpaySecretKey,
        'payments.cinetpay.siteId': 'site_123',
        'payments.cinetpay.apiKey': 'api_123',
      });

      await expect(
        service.handleWebhook('secret_123', baseCinetPayPayload, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('skips CinetPay token check when no secret key is configured', async () => {
      const { service } = createService('cinetpay', {
        'payments.cinetpay.secretKey': undefined,
        'payments.cinetpay.siteId': 'site_123',
        'payments.cinetpay.apiKey': 'api_123',
      });

      await expect(
        service.handleWebhook('secret_123', baseCinetPayPayload, {}),
      ).resolves.toBeDefined();
    });
  });

  // ── Timing-safe comparison invariant ──────────────────────────────────────

  describe('Timing-safe comparison — rejection is not content-dependent', () => {
    it('rejects a prefix-match secret with the same first bytes', async () => {
      const { service } = createService('flutterwave', {
        'payments.flutterwave.webhookSecretHash': undefined,
      });

      // 'secret_1' is a prefix of 'secret_123' — length mismatch should reject
      await expect(
        service.handleWebhook('secret_1', baseFlutterwavePayload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a padded secret with trailing characters', async () => {
      const { service } = createService('flutterwave', {
        'payments.flutterwave.webhookSecretHash': undefined,
      });

      await expect(
        service.handleWebhook('secret_123_extra', baseFlutterwavePayload),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
