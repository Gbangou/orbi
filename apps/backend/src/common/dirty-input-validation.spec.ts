import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SignInDto } from '../modules/auth/dto/sign-in.dto';
import { SignUpDto, SignUpRole } from '../modules/auth/dto/sign-up.dto';
import { PaymentWebhookDto } from '../modules/payments/dto/payment-webhook.dto';
import { UpsertDriverOnboardingDto } from '../modules/drivers/dto/upsert-driver-onboarding.dto';
import { ReportTripIncidentDto } from '../modules/trips/dto/report-trip-incident.dto';

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

    expect(validScriptText).toEqual([]);
    expect(tooLongDetails.length).toBeGreaterThan(0);
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
});
