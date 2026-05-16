import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DocumentObjectStorageService } from './document-object-storage.service';

describe('DocumentObjectStorageService', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'orbi-documents-'));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  function createService(overrides: Record<string, unknown> = {}) {
    const config: Record<string, unknown> = {
      'documents.objectProvider': 'local-provider',
      'documents.localProviderRoot': tempRoot,
      ...overrides,
    };

    return new DocumentObjectStorageService({
      get: jest.fn((key: string) => config[key]),
    } as never);
  }

  it('confirms local provider objects with computed size and SHA-256', async () => {
    const service = createService();
    const content = Buffer.from('orbi-driver-document');
    const expectedSha256 = createHash('sha256').update(content).digest('hex');
    const objectPath = path.join(
      tempRoot,
      'driver-1',
      'identity_document',
      'doc.pdf',
    );

    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, content);

    const result = await service.verifyStoredDocument({
      storageKey: 'driver-1/identity_document/doc.pdf',
      expectedSizeBytes: content.length,
      expectedSha256,
    });

    expect(result).toEqual(
      expect.objectContaining({
        state: 'confirmed',
        provider: 'local-provider',
        objectId: 'driver-1/identity_document/doc.pdf',
        sizeBytes: content.length,
        sha256: expectedSha256,
        failureReason: null,
      }),
    );
  });

  it('fails closed for missing, escaped or mismatched local objects', async () => {
    const service = createService();
    const content = Buffer.from('orbi-driver-document');
    const objectPath = path.join(
      tempRoot,
      'driver-1',
      'identity_document',
      'doc.pdf',
    );

    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, content);

    await expect(
      service.verifyStoredDocument({
        storageKey: '../identity_document/doc.pdf',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        state: 'failed',
        failureReason:
          'Document storage key is outside the configured provider root.',
      }),
    );

    await expect(
      service.verifyStoredDocument({
        storageKey: 'driver-1/identity_document/missing.pdf',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        state: 'failed',
        failureReason:
          'Document object was not found in the configured provider.',
      }),
    );

    await expect(
      service.verifyStoredDocument({
        storageKey: 'driver-1/identity_document/doc.pdf',
        expectedSha256:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        state: 'failed',
        failureReason:
          'Document object SHA-256 does not match captured upload integrity.',
      }),
    );
  });
});
