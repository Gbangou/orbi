import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SignInDto } from '../modules/auth/dto/sign-in.dto';
import { SignUpDto, SignUpRole } from '../modules/auth/dto/sign-up.dto';
import { PaymentAttemptRefundDto } from '../modules/admin/dto/payment-attempt-refund.dto';
import { CreateCheckoutIntentDto } from '../modules/payments/dto/create-checkout-intent.dto';
import { PaymentWebhookDto } from '../modules/payments/dto/payment-webhook.dto';
import { UpsertDriverOnboardingDto } from '../modules/drivers/dto/upsert-driver-onboarding.dto';
import { UpdateTrustedContactDto } from '../modules/riders/dto/update-trusted-contact.dto';
import { ReportTripIncidentDto } from '../modules/trips/dto/report-trip-incident.dto';
import { SubmitMobileErrorReportsDto } from '../modules/mobile-observability/dto/submit-mobile-error-reports.dto';

async function validateDto<T extends object>(
  dtoClass: new () => T,
  payload: Record<string, unknown>,
) {
  return validate(plainToInstance(dtoClass, payload), {
    forbidUnknownValues: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('dirty input validation', () => {
  const validSignUp = {
    fullName: 'Awa Ouedraogo',
    email: 'awa@mobilis.app',
    password: 'Mobilis123!',
    role: SignUpRole.RIDER,
  };

  it.each([
    ['emoji name', { fullName: 'Awa 😎' }],
    ['script name', { fullName: '<script>alert(1)</script>' }],
    ['numeric name', { fullName: 'Awa 123' }],
    ['oversized name', { fullName: 'A'.repeat(10_000) }],
    ['email with spaces', { email: 'awa @mobilis.app' }],
    ['oversized password', { password: 'A'.repeat(10_000) }],
    ['unknown field', { admin: true }],
  ])('rejects dirty sign-up payload: %s', async (_label, override) => {
    const errors = await validateDto(SignUpDto, {
      ...validSignUp,
      ...override,
    });

    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts real-world francophone names with accents, apostrophes and hyphens', async () => {
    const errors = await validateDto(SignUpDto, {
      ...validSignUp,
      fullName: "Aissatou Ouedraogo-Sawadogo d'Abidjan",
    });

    expect(errors).toEqual([]);
  });

  it.each([
    ['email with spaces', { email: 'driver @mobilis.app' }],
    ['short password', { password: '123' }],
    ['oversized password', { password: 'P'.repeat(10_000) }],
  ])('rejects dirty sign-in payload: %s', async (_label, override) => {
    const errors = await validateDto(SignInDto, {
      email: 'driver@mobilis.app',
      password: 'Mobilis123!',
      ...override,
    });

    expect(errors.length).toBeGreaterThan(0);
  });

  it('keeps free-text incident details bounded even when users paste script text', async () => {
    const validScriptText = await validateDto(ReportTripIncidentDto, {
      incidentType: 'SAFETY_ALERT',
      details: "<script>alert('xss')</script> conducteur agressif",
      priority: 3,
    });
    const tooLongDetails = await validateDto(ReportTripIncidentDto, {
      incidentType: 'SAFETY_ALERT',
      details: '<img src=x onerror=alert(1)>'.repeat(1_000),
      priority: 3,
    });
    const invalidEvidence = await validateDto(ReportTripIncidentDto, {
      incidentType: 'SAFETY_ALERT',
      evidenceConsent: true,
      evidenceType: 'AUDIO<script>',
      evidenceRetentionHours: 999,
      priority: 3,
    });

    expect(validScriptText).toEqual([]);
    expect(tooLongDetails.length).toBeGreaterThan(0);
    expect(invalidEvidence.length).toBeGreaterThan(0);
  });

  it('bounds mobile error report ingestion and rejects unknown payload fields', async () => {
    const validReport = {
      id: 'moberr_20260503120000_abc123',
      occurredAt: '2026-05-03T12:00:00.000Z',
      appRole: 'rider',
      classification: {
        code: 'MOB-BOOKING-DISPATCH',
        surface: 'booking',
        severity: 'critical',
        owner: 'ops',
        retryPolicy: 'idempotent-retry-with-visible-status',
        userMessage:
          'La demande est en verification. Aucun double trajet ne sera cree.',
        shouldClearSessionToken: false,
        shouldNavigateToAuth: false,
        reportable: true,
      },
      fingerprint: 'abc123',
      errorName: 'Error',
      errorMessage: 'dispatch timeout',
      context: {
        screen: 'book',
      },
    };
    const validErrors = await validateDto(SubmitMobileErrorReportsDto, {
      reports: [validReport],
    });
    const oversizedErrors = await validateDto(SubmitMobileErrorReportsDto, {
      reports: Array.from({ length: 21 }, () => validReport),
    });
    const dirtyErrors = await validateDto(SubmitMobileErrorReportsDto, {
      reports: [
        {
          ...validReport,
          errorMessage: '<script>alert(1)</script>'.repeat(100),
          sessionToken: 'secret',
        },
      ],
    });

    expect(validErrors).toEqual([]);
    expect(oversizedErrors.length).toBeGreaterThan(0);
    expect(dirtyErrors.length).toBeGreaterThan(0);
  });

  it('rejects dirty driver onboarding structured fields', async () => {
    const errors = await validateDto(UpsertDriverOnboardingDto, {
      phoneNumber: '+22670ABC000',
      licenseNumber: '<script>alert(1)</script>'.repeat(20),
      city: 'OUAGADOUGOU',
      serviceRadiusKm: 999,
      documents: {
        identityDocumentProvided: true,
        driverLicenseProvided: true,
        vehicleRegistrationProvided: true,
        insuranceProofProvided: true,
        selfieMatchProvided: true,
      },
      documentArtifacts: [
        {
          type: 'IDENTITY_DOCUMENT',
          fileName: 'id-card.pdf',
          storageKey: '../secrets/'.repeat(50),
          mimeType: 'text/html<script>',
          expiresAt: 'not-a-date',
        },
      ],
      vehicles: [
        {
          plateNumber: '11 JD 9021'.repeat(20),
          make: 'Toyota',
          model: 'Corolla',
          color: 'White',
          year: 1800,
          type: 'CAR',
          tier: 'CAR_STANDARD',
          seats: 99,
        },
      ],
    });

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects dirty trusted contact structured fields', async () => {
    const errors = await validateDto(UpdateTrustedContactDto, {
      phoneNumber: '+22670ABC000',
      shareMode: 'ALWAYS<script>',
      notes: 'x'.repeat(1_000),
    });

    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a realistic Burkina driver onboarding payload', async () => {
    const errors = await validateDto(UpsertDriverOnboardingDto, {
      phoneNumber: '+22670000000',
      licenseNumber: 'BF-12345',
      city: 'OUAGADOUGOU',
      serviceRadiusKm: 8,
      documents: {
        identityDocumentProvided: true,
        driverLicenseProvided: true,
        vehicleRegistrationProvided: true,
        insuranceProofProvided: true,
        selfieMatchProvided: true,
      },
      documentArtifacts: [
        {
          type: 'IDENTITY_DOCUMENT',
          fileName: 'carte-identite.pdf',
          storageKey: 'driver-1/identity/carte-identite.pdf',
          mimeType: 'application/pdf',
          expiresAt: '2027-04-30T00:00:00.000Z',
        },
      ],
      vehicles: [
        {
          plateNumber: '11 JD 9021',
          make: 'Yamaha',
          model: 'Crypton',
          color: 'Bleu',
          year: 2022,
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
          seats: 1,
        },
      ],
    });

    expect(errors).toEqual([]);
  });

  it('keeps provider webhook payloads bounded and rejects unknown top-level fields', async () => {
    const validCinetPayWebhook = await validateDto(PaymentWebhookDto, {
      event: 'transaction.successful',
      cpm_trans_id: 'mobilis_123_ride-request-1',
      cpm_amount: '2400',
      cpm_currency: 'XOF',
      cel_phone_num: '+22670000000',
      signature: 'provider-signature',
    });
    const oversizedWebhook = await validateDto(PaymentWebhookDto, {
      event: 'transaction.successful',
      cpm_trans_id: 'x'.repeat(10_000),
      unexpected: '<script>alert(1)</script>',
    });

    expect(validCinetPayWebhook).toEqual([]);
    expect(oversizedWebhook.length).toBeGreaterThan(0);
  });

  it('rejects dirty checkout intent fields while accepting the mobile money minimum payload', async () => {
    const validCheckout = await validateDto(CreateCheckoutIntentDto, {
      rideRequestId: 'ride-request-1',
      channel: 'MOBILE_MONEY',
      mobileMoneyNetwork: 'ORANGE_MONEY',
      customerPhoneNumber: '+22670000000',
    });
    const dirtyCheckout = await validateDto(CreateCheckoutIntentDto, {
      rideRequestId: '../ride-request-1'.repeat(50),
      channel: 'MOBILE_MONEY<script>',
      amount: 1,
      mobileMoneyNetwork: 'UNKNOWN_MONEY',
      customerPhoneNumber: '<script>alert(1)</script>'.repeat(50),
      redirectUrl: 'javascript:alert(1)',
      providerSecret: 'should-not-be-accepted',
    });

    expect(validCheckout).toEqual([]);
    expect(dirtyCheckout.length).toBeGreaterThan(0);
  });

  it('keeps admin refund reasons bounded and rejects unexpected refund fields', async () => {
    const validRefund = await validateDto(PaymentAttemptRefundDto, {
      reason: 'Client reimbursed after duplicate field payment confirmation.',
    });
    const dirtyRefund = await validateDto(PaymentAttemptRefundDto, {
      reason: '<script>alert(1)</script>'.repeat(200),
      forceWalletBalance: 999999,
    });

    expect(validRefund).toEqual([]);
    expect(dirtyRefund.length).toBeGreaterThan(0);
  });

  it('bounds provider refund webhook identifiers and statuses', async () => {
    const validRefundWebhook = await validateDto(PaymentWebhookDto, {
      event: 'refund.completed',
      refund_id: 'flw-refund-123',
      transaction_id: 'provider-transaction-123',
      status: 'successful',
      AmountRefunded: '2400',
    });
    const dirtyRefundWebhook = await validateDto(PaymentWebhookDto, {
      event: 'refund.completed'.repeat(100),
      refund_id: 'x'.repeat(10_000),
      transaction_id: { nested: 'not-a-string' },
      status: '<script>alert(1)</script>'.repeat(100),
      AmountRefunded: '2400'.repeat(100),
      rawSignature: 'unexpected',
    });

    expect(validRefundWebhook).toEqual([]);
    expect(dirtyRefundWebhook.length).toBeGreaterThan(0);
  });
});
