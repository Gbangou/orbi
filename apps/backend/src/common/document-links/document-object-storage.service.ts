import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type VerifyStoredDocumentInput = {
  storageKey: string;
  expectedSizeBytes?: number | null;
  expectedSha256?: string | null;
};

export type StoredDocumentObjectVerification = {
  state: 'confirmed' | 'failed';
  provider: string;
  objectId: string | null;
  verifiedAt: string;
  sizeBytes: number | null;
  sha256: string | null;
  failureReason: string | null;
};

@Injectable()
export class DocumentObjectStorageService {
  constructor(private readonly configService: ConfigService) {}

  async verifyStoredDocument(
    input: VerifyStoredDocumentInput,
  ): Promise<StoredDocumentObjectVerification> {
    const verifiedAt = new Date().toISOString();
    const provider =
      this.configService.get<string>('documents.objectProvider') ??
      'local-provider';

    if (provider !== 'local-provider') {
      return this.failed(
        provider,
        input.storageKey,
        verifiedAt,
        `Unsupported document object provider ${provider}.`,
      );
    }

    const resolvedPath = this.resolveLocalObjectPath(input.storageKey);

    if (!resolvedPath) {
      return this.failed(
        provider,
        input.storageKey,
        verifiedAt,
        'Document storage key is outside the configured provider root.',
      );
    }

    try {
      const objectStat = await stat(resolvedPath);

      if (!objectStat.isFile()) {
        return this.failed(
          provider,
          input.storageKey,
          verifiedAt,
          'Document object is not a file.',
        );
      }

      const sha256 = await this.hashFile(resolvedPath);
      const sizeBytes = objectStat.size;
      const expectedSha256 = input.expectedSha256?.trim().toLowerCase() ?? null;

      if (
        input.expectedSizeBytes &&
        input.expectedSizeBytes !== objectStat.size
      ) {
        return this.failed(
          provider,
          input.storageKey,
          verifiedAt,
          'Document object size does not match captured upload integrity.',
          sizeBytes,
          sha256,
        );
      }

      if (expectedSha256 && expectedSha256 !== sha256) {
        return this.failed(
          provider,
          input.storageKey,
          verifiedAt,
          'Document object SHA-256 does not match captured upload integrity.',
          sizeBytes,
          sha256,
        );
      }

      return {
        state: 'confirmed',
        provider,
        objectId: input.storageKey,
        verifiedAt,
        sizeBytes,
        sha256,
        failureReason: null,
      };
    } catch {
      return this.failed(
        provider,
        input.storageKey,
        verifiedAt,
        'Document object was not found in the configured provider.',
      );
    }
  }

  private resolveLocalObjectPath(storageKey: string) {
    if (
      !storageKey ||
      storageKey.includes('\\') ||
      storageKey.split('/').some((segment) => segment === '..')
    ) {
      return null;
    }

    const root =
      this.configService.get<string>('documents.localProviderRoot') ??
      path.resolve(process.cwd(), '.mobilis-document-store');
    const rootPath = path.resolve(root);
    const objectPath = path.resolve(rootPath, ...storageKey.split('/'));

    if (objectPath !== rootPath && objectPath.startsWith(rootPath + path.sep)) {
      return objectPath;
    }

    return null;
  }

  private async hashFile(filePath: string) {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', resolve);
    });

    return hash.digest('hex');
  }

  private failed(
    provider: string,
    storageKey: string,
    verifiedAt: string,
    failureReason: string,
    sizeBytes: number | null = null,
    sha256: string | null = null,
  ): StoredDocumentObjectVerification {
    return {
      state: 'failed',
      provider,
      objectId: storageKey || null,
      verifiedAt,
      sizeBytes,
      sha256,
      failureReason,
    };
  }
}
