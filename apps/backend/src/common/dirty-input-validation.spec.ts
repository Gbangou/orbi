import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SignInDto } from '../modules/auth/dto/sign-in.dto';
import { SignUpDto, SignUpRole } from '../modules/auth/dto/sign-up.dto';
import { DriverOnboardingExportQueryDto } from '../modules/admin/dto/driver-onboarding-export-query.dto';
import { DriverWalletRecoveryAdjustmentDto } from '../modules/admin/dto/driver-wallet-recovery-adjustment.dto';
import { PaymentAttemptRefundDto } from '../modules/admin/dto/payment-attempt-refund.dto';
import { CreateCheckoutIntentDto } from '../modules/payments/dto/create-checkout-intent.dto';
import { PaymentWebhookDto } from '../modules/payments/dto/payment-webhook.dto';
import { UpsertDriverOnboardingDto } from '../modules/drivers/dto/upsert-driver-onboarding.dto';
import { RequestDriverDocumentUploadLinksDto } from '../modules/drivers/dto/request-driver-document-upload-links.dto';
import { CreateSavedPlaceDto } from '../modules/riders/dto/create-saved-place.dto';
import { UpdateTrustedContactDto } from '../modules/riders/dto/update-trusted-contact.dto';
import { ReportTripIncidentDto } from '../modules/trips/dto/report-trip-incident.dto';
import { VerifyPickupCodeDto } from '../modules/trips/dto/verify-pickup-code.dto';
import { SubmitMobileErrorReportsDto } from '../modules/mobile-observability/dto/submit-mobile-error-reports.dto';
import { CreateRideRequestDto } from '../modules/ride-requests/dto/create-ride-request.dto';
import { RecordRoutePositionDto } from '../modules/trips/dto/record-route-position.dto';
import { ReportTripSosDto } from '../modules/trips/dto/report-trip-sos.dto';
import { VoiceLocationIntentDto } from '../modules/voice/dto/voice-location-intent.dto';
import { RegisterPushTokenDto } from '../modules/users/dto/register-push-token.dto';

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
    email: 'awa@orbi.app',
    password: 'Orbi123!',
    role: SignUpRole.RIDER,
  };

  it.each([
    ['emoji name', { fullName: 'Awa 😎' }],
    ['script name', { fullName: '<script>alert(1)</script>' }],
    ['numeric name', { fullName: 'Awa 123' }],
    ['oversized name', { fullName: 'A'.repeat(10_000) }],
    ['email with spaces', { email: 'awa @orbi.app' }],
    ['oversized email', { email: `${'a'.repeat(245)}@orbi.app` }],
    ['weak password', { password: 'orbi123' }],
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
    ['email with spaces', { email: 'driver @orbi.app' }],
    ['oversized email', { email: `${'d'.repeat(245)}@orbi.app` }],
    ['short password', { password: '123' }],
    ['weak password', { password: 'orbi123' }],
    ['oversized password', { password: 'P'.repeat(10_000) }],
  ])('rejects dirty sign-in payload: %s', async (_label, override) => {
    const errors = await validateDto(SignInDto, {
      email: 'driver@orbi.app',
      password: 'Orbi123!',
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

  it('bounds ride booking inputs while accepting realistic Burkina trip details', async () => {
    const validRide = await validateDto(CreateRideRequestDto, {
      pickupAddress: 'Patte d Oie, Ouagadougou',
      pickupLatitude: 12.3346,
      pickupLongitude: -1.5462,
      destinationAddress: 'Universite Joseph Ki-Zerbo',
      destinationLatitude: 12.3714,
      destinationLongitude: -1.4991,
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      estimatedDistanceKm: 7.4,
      estimatedDurationMinutes: 24,
      paymentMethod: 'MOBILE_MONEY',
      city: 'OUAGADOUGOU',
      districtProfile: 'UNIVERSITY',
      notes: 'Client avec petit bagage, paiement Orange Money.',
    });
    const dirtyRide = await validateDto(CreateRideRequestDto, {
      riderId: '../admin/'.repeat(40),
      pickupAddress: '<script>alert(1)</script>'.repeat(100),
      pickupLatitude: 999,
      pickupLongitude: -999,
      destinationAddress: 'x'.repeat(10_000),
      destinationLatitude: 'not-a-coordinate',
      destinationLongitude: {},
      requestedVehicleType: 'HELICOPTER',
      requestedServiceTier: 'CAR_VIP<script>',
      estimatedDistanceKm: 1_000_000,
      estimatedDurationMinutes: 99_999,
      paymentMethod: 'FREE',
      city: 'OUAGA<script>',
      districtProfile: 'ROOT',
      notes: '<img src=x onerror=alert(1)>'.repeat(1_000),
      forceFare: 1,
    });
    const shortScriptRide = await validateDto(CreateRideRequestDto, {
      pickupAddress: '<script>alert(1)</script>',
      pickupLatitude: 12.3346,
      pickupLongitude: -1.5462,
      destinationAddress: 'Universite Joseph Ki-Zerbo',
      destinationLatitude: 12.3714,
      destinationLongitude: -1.4991,
      requestedVehicleType: 'MOTORCYCLE',
      estimatedDistanceKm: 7.4,
      estimatedDurationMinutes: 24,
    });
    const traversalRider = await validateDto(CreateRideRequestDto, {
      riderId: '../rider-1',
      pickupAddress: 'Patte d Oie, Ouagadougou',
      pickupLatitude: 12.3346,
      pickupLongitude: -1.5462,
      destinationAddress: 'Universite Joseph Ki-Zerbo',
      destinationLatitude: 12.3714,
      destinationLongitude: -1.4991,
      requestedVehicleType: 'MOTORCYCLE',
      estimatedDistanceKm: 7.4,
      estimatedDurationMinutes: 24,
    });

    expect(validRide).toEqual([]);
    expect(dirtyRide.length).toBeGreaterThan(0);
    expect(shortScriptRide.length).toBeGreaterThan(0);
    expect(traversalRider.length).toBeGreaterThan(0);
  });

  it('rejects dirty saved places while accepting realistic local labels', async () => {
    const validPlace = await validateDto(CreateSavedPlaceDto, {
      label: 'Maison Tampouy',
      address: 'Avenue de la Nation, Ouagadougou',
      latitude: 12.371,
      longitude: -1.519,
    });
    const dirtyPlace = await validateDto(CreateSavedPlaceDto, {
      label: '<img src=x onerror=alert(1)>',
      address: '..\\secrets',
      latitude: 12.371,
      longitude: -1.519,
    });

    expect(validPlace).toEqual([]);
    expect(dirtyPlace.length).toBeGreaterThan(0);
  });

  it('bounds live route and SOS coordinates without rejecting useful emergency text', async () => {
    const validSos = await validateDto(ReportTripSosDto, {
      details: "<script>alert('copied')</script> Accident pres de Koulouba.",
      latitude: '12.371',
      longitude: '-1.519',
      accuracyMeters: '35',
    });
    const dirtySos = await validateDto(ReportTripSosDto, {
      details: 'urgence '.repeat(1_000),
      latitude: 120,
      longitude: -220,
      accuracyMeters: 999_999,
      notifyPoliceDirectly: true,
    });
    const validRoutePosition = await validateDto(RecordRoutePositionDto, {
      latitude: '12.371',
      longitude: '-1.519',
      accuracyMeters: '30',
      speedKph: '42',
      distanceToDestinationKm: '3.5',
    });
    const dirtyRoutePosition = await validateDto(RecordRoutePositionDto, {
      latitude: 'Infinity',
      longitude: '<script>',
      accuracyMeters: -5,
      speedKph: 999,
      distanceToDestinationKm: 9_999,
      tripId: '../other-trip',
    });

    expect(validSos).toEqual([]);
    expect(dirtySos.length).toBeGreaterThan(0);
    expect(validRoutePosition).toEqual([]);
    expect(dirtyRoutePosition.length).toBeGreaterThan(0);
  });

  it('accepts only bounded Expo push token values', async () => {
    const validExpoToken = await validateDto(RegisterPushTokenDto, {
      token: 'ExpoPushToken[abcDEF123_-xyz]',
    });
    const validExponentToken = await validateDto(RegisterPushTokenDto, {
      token: 'ExponentPushToken[abcDEF123_-xyz]',
    });
    const dirtyToken = await validateDto(RegisterPushTokenDto, {
      token: 'Bearer secret\n<script>alert(1)</script>',
    });
    const oversizedToken = await validateDto(RegisterPushTokenDto, {
      token: `ExpoPushToken[${'A'.repeat(300)}]`,
    });

    expect(validExpoToken).toEqual([]);
    expect(validExponentToken).toEqual([]);
    expect(dirtyToken.length).toBeGreaterThan(0);
    expect(oversizedToken.length).toBeGreaterThan(0);
  });

  it('requires pickup codes to be exactly four digits', async () => {
    const validCode = await validateDto(VerifyPickupCodeDto, {
      pickupCode: '1234',
    });
    const dirtyCode = await validateDto(VerifyPickupCodeDto, {
      pickupCode: '<123',
    });

    expect(validCode).toEqual([]);
    expect(dirtyCode.length).toBeGreaterThan(0);
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
    const nestedContextErrors = await validateDto(SubmitMobileErrorReportsDto, {
      reports: [
        {
          ...validReport,
          context: {
            screen: 'book',
            token: { leaked: 'secret' },
          },
        },
      ],
    });
    const unsafeContextKeyErrors = await validateDto(
      SubmitMobileErrorReportsDto,
      {
        reports: [
          {
            ...validReport,
            context: {
              ['x'.repeat(80)]: 'too-large-key',
              retryCount: Number.POSITIVE_INFINITY,
            },
          },
        ],
      },
    );

    expect(validErrors).toEqual([]);
    expect(oversizedErrors.length).toBeGreaterThan(0);
    expect(dirtyErrors.length).toBeGreaterThan(0);
    expect(nestedContextErrors.length).toBeGreaterThan(0);
    expect(unsafeContextKeyErrors.length).toBeGreaterThan(0);
  });

  it('bounds voice transcripts while accepting real local phrasing', async () => {
    const validVoice = await validateDto(VoiceLocationIntentDto, {
      transcript: 'Je suis a Tampouy, je vais au grand marche de Rood Woko',
    });
    const dirtyVoice = await validateDto(VoiceLocationIntentDto, {
      transcript: '<script>alert(1)</script>'.repeat(1_000),
      localeOverride: 'root',
    });

    expect(validVoice).toEqual([]);
    expect(dirtyVoice.length).toBeGreaterThan(0);
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
          fileName: '../id-card.pdf',
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

  it('rejects dirty document upload link requests before signed URLs are created', async () => {
    const validUploadRequest = await validateDto(
      RequestDriverDocumentUploadLinksDto,
      {
        documents: [
          {
            type: 'DRIVER_LICENSE',
            fileName: 'permis-conducteur.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
    );
    const dirtyUploadRequest = await validateDto(
      RequestDriverDocumentUploadLinksDto,
      {
        documents: [
          {
            type: 'DRIVER_LICENSE',
            fileName: '../permis<script>.svg',
            mimeType: 'image/svg+xml',
          },
        ],
      },
    );

    expect(validUploadRequest).toEqual([]);
    expect(dirtyUploadRequest.length).toBeGreaterThan(0);
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

  it('bounds driver onboarding collection sizes before writes fan out', async () => {
    const vehicle = {
      plateNumber: '11 JD 9021',
      make: 'Yamaha',
      model: 'Crypton',
      color: 'Bleu',
      year: 2022,
      type: 'MOTORCYCLE',
      tier: 'MOTO_STANDARD',
      seats: 1,
    };
    const artifact = {
      type: 'IDENTITY_DOCUMENT',
      fileName: 'carte-identite.pdf',
      storageKey: 'driver-1/identity/carte-identite.pdf',
      mimeType: 'application/pdf',
      expiresAt: '2027-04-30T00:00:00.000Z',
    };
    const emptyVehicles = await validateDto(UpsertDriverOnboardingDto, {
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
      documentArtifacts: [artifact],
      vehicles: [],
    });
    const tooManyVehicles = await validateDto(UpsertDriverOnboardingDto, {
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
      documentArtifacts: [artifact],
      vehicles: Array.from({ length: 4 }, (_, index) => ({
        ...vehicle,
        plateNumber: `11 JD 902${index}`,
      })),
    });
    const tooManyArtifacts = await validateDto(UpsertDriverOnboardingDto, {
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
      documentArtifacts: Array.from({ length: 6 }, (_, index) => ({
        ...artifact,
        storageKey: `driver-1/identity/carte-identite-${index}.pdf`,
      })),
      vehicles: [vehicle],
    });

    expect(emptyVehicles.length).toBeGreaterThan(0);
    expect(tooManyVehicles.length).toBeGreaterThan(0);
    expect(tooManyArtifacts.length).toBeGreaterThan(0);
  });

  it('bounds admin driver onboarding export filters', async () => {
    const validExportQuery = await validateDto(DriverOnboardingExportQueryDto, {
      guidanceFilter: 'review',
      searchQuery: 'permis Ouaga',
      limit: 50,
    });
    const dirtyExportQuery = await validateDto(DriverOnboardingExportQueryDto, {
      guidanceFilter: 'approve<script>',
      searchQuery: '<script>alert(1)</script>'.repeat(20),
      limit: 1000,
      admin: true,
    });

    expect(validExportQuery).toEqual([]);
    expect(dirtyExportQuery.length).toBeGreaterThan(0);
  });

  it('keeps provider webhook payloads bounded and rejects unknown top-level fields', async () => {
    const validCinetPayWebhook = await validateDto(PaymentWebhookDto, {
      event: 'transaction.successful',
      cpm_trans_id: 'orbi_123_ride-request-1',
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

  it('keeps admin wallet recovery idempotency keys bounded and URL-safe', async () => {
    const validRecovery = await validateDto(DriverWalletRecoveryAdjustmentDto, {
      amount: 1000,
      notes: 'Paiement terrain recu.',
      idempotencyKey: 'ops-key-001',
    });
    const dirtyRecovery = await validateDto(DriverWalletRecoveryAdjustmentDto, {
      amount: 1000,
      notes: 'Paiement terrain recu.',
      idempotencyKey: 'ops key<script>',
      forceBalance: 0,
    });

    expect(validRecovery).toEqual([]);
    expect(dirtyRecovery.length).toBeGreaterThan(0);
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
