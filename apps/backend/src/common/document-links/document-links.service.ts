import { createHmac, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
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

@Injectable()
export class DocumentLinksService {
  constructor(private readonly configService: ConfigService) {}

  createUploadLink(input: UploadIntentInput) {
    const issuedAt = new Date();
    const ttlSeconds =
      this.configService.get<number>('documents.ttlSeconds') ?? 900;
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
    const storageKey = `${input.driverProfileId}/${input.documentType.toLowerCase()}/${randomUUID()}-${input.fileName.trim()}`;
    const payload = {
      kind: 'driver-document-upload',
      driverProfileId: input.driverProfileId,
      documentType: input.documentType,
      storageKey,
      fileName: input.fileName.trim(),
      mimeType: input.mimeType?.trim() ?? null,
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
        'content-type': input.mimeType?.trim() ?? 'application/octet-stream',
      },
    };
  }

  createViewLink(input: ViewIntentInput) {
    const issuedAt = new Date();
    const ttlSeconds =
      this.configService.get<number>('documents.ttlSeconds') ?? 900;
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
}
