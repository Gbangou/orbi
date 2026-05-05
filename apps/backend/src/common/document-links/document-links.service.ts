import { createHmac, randomUUID } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type UploadIntentInput = {
  driverProfileId: string;
  documentType: string;
  fileName: string;
  mimeType?: string;
  expiresAt?: string;
};

type ViewIntentInput = {
  documentId: string;
  driverProfileId: string;
  storageKey: string;
  actorRole: string;
};

type UploadedArtifactInput = {
  documentType: string;
  fileName: string;
  storageKey: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  uploadSource?: string;
};

const documentUploadPolicies: Record<
  string,
  {
    allowedMimeTypes: string[];
    allowedExtensions: string[];
    maxBytes: number;
  }
> = {
  IDENTITY_DOCUMENT: {
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  DRIVER_LICENSE: {
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  VEHICLE_REGISTRATION: {
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  INSURANCE_PROOF: {
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  SELFIE_VERIFICATION: {
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    allowedExtensions: ['jpg', 'jpeg', 'png'],
    maxBytes: 3_000_000,
  },
};

const extensionByMimeType: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const mimeTypeByExtension: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

@Injectable()
export class DocumentLinksService {
  constructor(private readonly configService: ConfigService) {}

  createUploadLink(input: UploadIntentInput) {
    const issuedAt = new Date();
    const ttlSeconds = this.resolveTtlSeconds();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
    const policy = this.resolveUploadPolicy(input.documentType);
    const mimeType = this.normalizeMimeType(
      input.mimeType,
      input.fileName,
      policy,
    );
    const fileName = this.normalizeFileName(input.fileName, mimeType, policy);
    const storageKey = `${input.driverProfileId}/${input.documentType.toLowerCase()}/${randomUUID()}-${fileName}`;
    const payload = {
      kind: 'driver-document-upload',
      driverProfileId: input.driverProfileId,
      documentType: input.documentType,
      storageKey,
      fileName,
      mimeType,
      maxBytes: policy.maxBytes,
      declaredExpiry: input.expiresAt ?? null,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    return {
      storageKey,
      expiresAt: expiresAt.toISOString(),
      uploadUrl: this.buildSignedUrl(
        this.configService.get<string>('documents.uploadBaseUrl') ??
          'https://storage.mobilis.local/upload',
        storageKey,
        payload,
      ),
      method: 'PUT',
      headers: {
        'content-type': mimeType,
      },
      constraints: {
        allowedMimeTypes: policy.allowedMimeTypes,
        allowedExtensions: policy.allowedExtensions,
        maxBytes: policy.maxBytes,
      },
    };
  }

  createViewLink(input: ViewIntentInput) {
    const issuedAt = new Date();
    const ttlSeconds = this.resolveTtlSeconds();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
    const payload = {
      kind: 'driver-document-view',
      documentId: input.documentId,
      driverProfileId: input.driverProfileId,
      storageKey: input.storageKey,
      actorRole: input.actorRole,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    return {
      expiresAt: expiresAt.toISOString(),
      signedUrl: this.buildSignedUrl(
        this.configService.get<string>('documents.viewBaseUrl') ??
          'https://storage.mobilis.local/view',
        input.storageKey,
        payload,
      ),
    };
  }

  validateUploadedArtifact(input: UploadedArtifactInput) {
    const policy = this.resolveUploadPolicy(input.documentType);
    const mimeType = this.normalizeMimeType(
      input.mimeType,
      input.fileName,
      policy,
    );
    const fileName = this.normalizeFileName(input.fileName, mimeType, policy);
    const storageExtension = this.resolveExtension(input.storageKey);

    if (
      !storageExtension ||
      !policy.allowedExtensions.includes(storageExtension)
    ) {
      throw new BadRequestException(
        `Unsupported driver document storage extension ${storageExtension || 'unknown'}.`,
      );
    }

    if (mimeTypeByExtension[storageExtension] !== mimeType) {
      throw new BadRequestException(
        'Driver document storage extension does not match its MIME type.',
      );
    }

    const sizeBytes = this.normalizeSizeBytes(input.sizeBytes, policy.maxBytes);
    const sha256 = this.normalizeSha256(input.sha256);
    const uploadSource = this.normalizeUploadSource(input.uploadSource);

    return {
      fileName,
      mimeType,
      integrity: {
        sizeBytes,
        sha256,
        uploadSource,
        capturedAt: new Date().toISOString(),
      },
      constraints: {
        allowedMimeTypes: policy.allowedMimeTypes,
        allowedExtensions: policy.allowedExtensions,
        maxBytes: policy.maxBytes,
      },
    };
  }

  private buildSignedUrl(baseUrl: string, key: string, payload: object) {
    const serializedPayload = JSON.stringify(payload);
    const signature = createHmac(
      'sha256',
      this.configService.get<string>('documents.signingSecret') ??
        'mobilis_dev_document_secret',
    )
      .update(serializedPayload)
      .digest('hex');

    const url = new URL(`${baseUrl}/${encodeURIComponent(key)}`);
    url.searchParams.set(
      'payload',
      Buffer.from(serializedPayload, 'utf8').toString('base64url'),
    );
    url.searchParams.set('signature', signature);

    return url.toString();
  }

  private resolveUploadPolicy(documentType: string) {
    const policy = documentUploadPolicies[documentType];

    if (!policy) {
      throw new BadRequestException(
        `Unsupported driver document type ${documentType}.`,
      );
    }

    return policy;
  }

  private normalizeMimeType(
    mimeType: string | undefined,
    fileName: string,
    policy: (typeof documentUploadPolicies)[string],
  ) {
    const fileExtension = fileName
      .trim()
      .split(/[\\/]/)
      .pop()
      ?.split('.')
      .pop();
    const inferredMimeType = fileExtension
      ? mimeTypeByExtension[fileExtension.toLowerCase()]
      : undefined;
    const normalized =
      mimeType?.trim().toLowerCase() ?? inferredMimeType ?? 'application/pdf';

    if (!policy.allowedMimeTypes.includes(normalized)) {
      throw new BadRequestException(
        `Unsupported driver document MIME type ${normalized}.`,
      );
    }

    return normalized;
  }

  private normalizeFileName(
    fileName: string,
    mimeType: string,
    policy: (typeof documentUploadPolicies)[string],
  ) {
    const leafName = fileName.trim().split(/[\\/]/).pop()?.trim() ?? '';
    const extension = leafName.includes('.')
      ? (leafName.split('.').pop() ?? '').toLowerCase()
      : extensionByMimeType[mimeType];

    if (
      !leafName ||
      !extension ||
      !policy.allowedExtensions.includes(extension)
    ) {
      throw new BadRequestException(
        `Unsupported driver document file extension ${extension || 'unknown'}.`,
      );
    }

    const baseName =
      leafName
        .slice(0, Math.max(0, leafName.length - extension.length - 1))
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 72) || 'document';

    return `${baseName}.${extension}`;
  }

  private resolveExtension(value: string) {
    const leafName = value.trim().split(/[\\/]/).pop()?.trim() ?? '';

    if (!leafName.includes('.')) {
      return null;
    }

    return leafName.split('.').pop()?.toLowerCase() ?? null;
  }

  private normalizeSizeBytes(sizeBytes: number | undefined, maxBytes: number) {
    if (sizeBytes === undefined) {
      return null;
    }

    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException(
        'Driver document size must be a positive integer.',
      );
    }

    if (sizeBytes > maxBytes) {
      throw new BadRequestException(
        `Driver document size exceeds the ${maxBytes} byte upload limit.`,
      );
    }

    return sizeBytes;
  }

  private normalizeSha256(sha256: string | undefined) {
    const normalized = sha256?.trim().toLowerCase();

    if (!normalized) {
      return null;
    }

    if (!/^[a-f0-9]{64}$/.test(normalized)) {
      throw new BadRequestException(
        'Driver document SHA-256 must be a 64 character hexadecimal digest.',
      );
    }

    return normalized;
  }

  private normalizeUploadSource(uploadSource: string | undefined) {
    const normalized = uploadSource?.trim().toLowerCase();

    if (!normalized) {
      return null;
    }

    if (!/^[a-z0-9_.:-]{2,40}$/.test(normalized)) {
      throw new BadRequestException(
        'Driver document upload source is not valid.',
      );
    }

    return normalized;
  }

  private resolveTtlSeconds() {
    const configuredTtl =
      this.configService.get<number>('documents.ttlSeconds') ?? 900;

    if (!Number.isFinite(configuredTtl)) {
      return 900;
    }

    return Math.min(Math.max(Math.round(configuredTtl), 60), 3600);
  }
}
