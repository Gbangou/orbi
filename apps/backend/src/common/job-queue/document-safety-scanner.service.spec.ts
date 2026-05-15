import { BadRequestException } from '@nestjs/common';
import { DocumentSafetyScannerService } from './document-safety-scanner.service';

describe('DocumentSafetyScannerService', () => {
  const validSha = 'a'.repeat(64);

  function createService(provider = 'local-policy') {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'documents.safetyScannerProvider' ? provider : undefined,
      ),
    };

    return new DocumentSafetyScannerService(configService as never);
  }

  it('clears documents that match provider verification and local policy', async () => {
    const service = createService();

    const result = await service.scan({
      documentId: 'document-1',
      type: 'DRIVER_LICENSE',
      fileName: 'permis.pdf',
      storageKey: 'drivers/driver-1/permis.pdf',
      metadata: {
        integrity: {
          sizeBytes: 100_000,
          sha256: validSha,
        },
        objectVerification: {
          state: 'confirmed',
          sizeBytes: 100_000,
          sha256: validSha,
        },
      },
    });

    expect(result).toEqual({
      state: 'clear',
      engine: 'local-policy',
      scannedAt: expect.any(String),
      findings: [],
      quarantineReason: null,
    });
  });

  it('quarantines documents with mismatched provider proof', async () => {
    const service = createService();

    const result = await service.scan({
      documentId: 'document-1',
      type: 'DRIVER_LICENSE',
      fileName: 'permis.pdf',
      storageKey: 'drivers/driver-1/permis.pdf',
      metadata: {
        integrity: {
          sizeBytes: 100_000,
          sha256: validSha,
        },
        objectVerification: {
          state: 'confirmed',
          sizeBytes: 120_000,
          sha256: 'b'.repeat(64),
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        state: 'quarantined',
        engine: 'local-policy',
        findings: ['captured-size-mismatch', 'captured-sha256-mismatch'],
      }),
    );
  });

  it('quarantines documents when object verification failed', async () => {
    const service = createService();

    const result = await service.scan({
      documentId: 'document-1',
      type: 'DRIVER_LICENSE',
      fileName: 'permis.pdf',
      storageKey: 'drivers/driver-1/permis.pdf',
      metadata: {
        objectVerification: {
          state: 'failed',
          failureReason: 'Object not found',
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        state: 'quarantined',
        findings: ['object-verification-failed'],
        quarantineReason: 'object not found',
      }),
    );
  });

  it('fails closed when an external scanner provider is not implemented', async () => {
    const service = createService('clamav');

    await expect(
      service.scan({
        documentId: 'document-1',
        type: 'DRIVER_LICENSE',
        fileName: 'permis.pdf',
        storageKey: 'drivers/driver-1/permis.pdf',
        metadata: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
