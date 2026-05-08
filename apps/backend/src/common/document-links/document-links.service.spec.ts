import { BadRequestException } from '@nestjs/common';
import { DocumentLinksService } from './document-links.service';

describe('DocumentLinksService', () => {
  function createService(overrides: Record<string, unknown> = {}) {
    const config: Record<string, unknown> = {
      'documents.ttlSeconds': 30,
      'documents.uploadBaseUrl': 'https://storage.mobilis.local/upload',
      'documents.viewBaseUrl': 'https://storage.mobilis.local/view',
      'documents.signingSecret': 'test-document-secret',
      ...overrides,
    };

    return new DocumentLinksService({
      get: jest.fn((key: string) => config[key]),
    } as never);
  }

  it('creates constrained upload links with sanitized storage keys', () => {
    const service = createService({
      'documents.ttlSeconds': 1,
    });

    const link = service.createUploadLink({
      driverProfileId: 'driver-1',
      documentType: 'IDENTITY_DOCUMENT',
      fileName: '..\\Carte Nationale 2026.pdf',
      mimeType: ' application/pdf ',
    });
    const url = new URL(link.uploadUrl);
    const payload = JSON.parse(
      Buffer.from(url.searchParams.get('payload') ?? '', 'base64url').toString(
        'utf8',
      ),
    );

    expect(link.storageKey).toMatch(
      /^driver-1\/identity_document\/[a-f0-9-]+-carte-nationale-2026\.pdf$/,
    );
    expect(link.headers['content-type']).toBe('application/pdf');
    expect(link.constraints).toEqual(
      expect.objectContaining({
        allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        maxBytes: 5_000_000,
      }),
    );
    expect(payload).toEqual(
      expect.objectContaining({
        kind: 'driver-document-upload',
        fileName: 'carte-nationale-2026.pdf',
        maxBytes: 5_000_000,
      }),
    );
    expect(
      Date.parse(link.expiresAt) - Date.parse(payload.issuedAt),
    ).toBeGreaterThanOrEqual(60_000);
  });

  it('rejects risky MIME types and unsupported selfie file formats', () => {
    const service = createService();

    expect(
      service.createUploadLink({
        driverProfileId: 'driver-1',
        documentType: 'SELFIE_VERIFICATION',
        fileName: 'selfie.jpg',
      }).headers['content-type'],
    ).toBe('image/jpeg');

    expect(() =>
      service.createUploadLink({
        driverProfileId: 'driver-1',
        documentType: 'DRIVER_LICENSE',
        fileName: 'license.svg',
        mimeType: 'image/svg+xml',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.createUploadLink({
        driverProfileId: 'driver-1',
        documentType: 'SELFIE_VERIFICATION',
        fileName: 'selfie.pdf',
        mimeType: 'application/pdf',
      }),
    ).toThrow(BadRequestException);
  });

  it('validates uploaded artifacts before they are attached to onboarding', () => {
    const service = createService();

    expect(
      service.validateUploadedArtifact({
        documentType: 'DRIVER_LICENSE',
        fileName: 'Permis Conducteur.JPG',
        storageKey: 'driver-1/driver_license/key-permis.jpg',
        sizeBytes: 1_024_000,
        sha256:
          'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        uploadSource: 'driver-app',
      }),
    ).toEqual(
      expect.objectContaining({
        fileName: 'permis-conducteur.jpg',
        mimeType: 'image/jpeg',
        integrity: expect.objectContaining({
          sizeBytes: 1_024_000,
          sha256:
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          uploadSource: 'driver-app',
          capturedAt: expect.any(String),
        }),
        objectVerification: {
          state: 'pending_provider_confirmation',
          provider: null,
          objectId: null,
          verifiedAt: null,
          sizeBytes: null,
          sha256: null,
          failureReason: null,
        },
        constraints: expect.objectContaining({
          maxBytes: 5_000_000,
        }),
      }),
    );

    expect(() =>
      service.validateUploadedArtifact({
        documentType: 'IDENTITY_DOCUMENT',
        fileName: 'identity.pdf',
        storageKey: 'driver-1/identity_document/key-identity.png',
        mimeType: 'application/pdf',
      }),
    ).toThrow(
      'Driver document storage extension does not match its MIME type.',
    );
  });

  it('rejects oversized or malformed uploaded artifact integrity signals', () => {
    const service = createService();

    expect(() =>
      service.validateUploadedArtifact({
        documentType: 'SELFIE_VERIFICATION',
        fileName: 'selfie.jpg',
        storageKey: 'driver-1/selfie_verification/key-selfie.jpg',
        sizeBytes: 3_000_001,
      }),
    ).toThrow('Driver document size exceeds the 3000000 byte upload limit.');

    expect(() =>
      service.validateUploadedArtifact({
        documentType: 'IDENTITY_DOCUMENT',
        fileName: 'identity.pdf',
        storageKey: 'driver-1/identity_document/key-identity.pdf',
        sha256: 'not-a-sha',
      }),
    ).toThrow(
      'Driver document SHA-256 must be a 64 character hexadecimal digest.',
    );
  });
});
