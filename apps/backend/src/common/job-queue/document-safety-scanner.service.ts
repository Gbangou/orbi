import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type DocumentSafetyScanInput = {
  documentId: string;
  type: string;
  fileName: string | null;
  storageKey: string;
  metadata: unknown;
};

export type DocumentSafetyScanResult = {
  state: 'clear' | 'quarantined';
  engine: string;
  scannedAt: string;
  findings: string[];
  quarantineReason: string | null;
};

const documentSafetyPolicies: Record<
  string,
  {
    allowedExtensions: string[];
    maxBytes: number;
  }
> = {
  IDENTITY_DOCUMENT: {
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  DRIVER_LICENSE: {
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  VEHICLE_REGISTRATION: {
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  INSURANCE_PROOF: {
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    maxBytes: 5_000_000,
  },
  SELFIE_VERIFICATION: {
    allowedExtensions: ['jpg', 'jpeg', 'png'],
    maxBytes: 3_000_000,
  },
};

@Injectable()
export class DocumentSafetyScannerService {
  constructor(private readonly configService: ConfigService) {}

  async scan(input: DocumentSafetyScanInput): Promise<DocumentSafetyScanResult> {
    this.assertScanInput(input);
    const engine = this.resolveEngine();

    if (engine !== 'local-policy') {
      throw new BadRequestException(
        'Document safety scanner provider is not configured.',
      );
    }

    const scannedAt = new Date().toISOString();
    const metadata = this.record(input.metadata);
    const objectVerification = this.record(metadata.objectVerification);

    if (objectVerification.state !== 'confirmed') {
      return {
        state: 'quarantined',
        engine,
        scannedAt,
        findings: ['object-verification-failed'],
        quarantineReason:
          this.stringValue(objectVerification.failureReason) ??
          'Provider object verification failed.',
      };
    }

    const policy = documentSafetyPolicies[input.type];
    const extension = this.resolveDocumentExtension(
      input.storageKey || input.fileName || '',
    );
    const integrity = this.record(metadata.integrity);
    const capturedSha256 = this.stringValue(integrity.sha256);
    const capturedSizeBytes = this.positiveInteger(integrity.sizeBytes);
    const objectSizeBytes = this.positiveInteger(objectVerification.sizeBytes);
    const objectSha256 = this.stringValue(objectVerification.sha256);
    const findings = [
      !policy ? 'unsupported-document-type' : null,
      !extension || !policy?.allowedExtensions.includes(extension)
        ? 'unsupported-file-extension'
        : null,
      policy && objectSizeBytes && objectSizeBytes > policy.maxBytes
        ? 'object-size-exceeds-policy'
        : null,
      capturedSizeBytes && objectSizeBytes !== capturedSizeBytes
        ? 'captured-size-mismatch'
        : null,
      capturedSha256 && objectSha256 !== capturedSha256
        ? 'captured-sha256-mismatch'
        : null,
      !/^[a-f0-9]{64}$/.test(objectSha256 ?? '')
        ? 'invalid-provider-sha256'
        : null,
    ].filter((finding): finding is string => Boolean(finding));

    if (findings.length > 0) {
      return {
        state: 'quarantined',
        engine,
        scannedAt,
        findings,
        quarantineReason:
          'Document kept in quarantine because local safety policy found one or more anomalies.',
      };
    }

    return {
      state: 'clear',
      engine,
      scannedAt,
      findings: [],
      quarantineReason: null,
    };
  }

  private resolveEngine() {
    return (
      this.configService.get<string>('documents.safetyScannerProvider') ??
      'local-policy'
    )
      .trim()
      .toLowerCase();
  }

  private assertScanInput(input: DocumentSafetyScanInput) {
    if (!input.documentId.trim()) {
      throw new BadRequestException('Driver document id is required.');
    }

    if (!input.type.trim()) {
      throw new BadRequestException('Driver document type is required.');
    }

    if (!input.storageKey.trim()) {
      throw new BadRequestException('Driver document storage key is required.');
    }
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim()
      ? value.trim().toLowerCase()
      : null;
  }

  private positiveInteger(value: unknown) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      return null;
    }

    return value;
  }

  private resolveDocumentExtension(value: string) {
    const leafName = value.trim().split(/[\\/]/).pop()?.trim() ?? '';

    if (!leafName.includes('.')) {
      return null;
    }

    return leafName.split('.').pop()?.toLowerCase() ?? null;
  }
}
