import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export type PawaPayCorrespondent = 'ORANGE_BFA' | 'MOOV_BFA';

export const PAWAPAY_CORRESPONDENTS_BFA: PawaPayCorrespondent[] = [
  'ORANGE_BFA',
  'MOOV_BFA',
];

export type PawaPayDepositStatus =
  | 'ACCEPTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'DUPLICATE_IGNORED';

export type PawaPayDepositRequest = {
  depositId: string;
  amount: string;
  currency: 'XOF';
  correspondent: PawaPayCorrespondent;
  payer: { type: 'MSISDN'; address: { value: string } };
  customerTimestamp: string;
  statementDescription: string;
  preAuthorisationCode?: string;
  metadata?: Array<{ fieldName: string; fieldValue: string }>;
};

export type PawaPayDepositResponse = {
  depositId: string;
  status: PawaPayDepositStatus;
  created?: string;
  amount?: string;
  currency?: string;
  correspondent?: PawaPayCorrespondent;
  payer?: { type: string; address: { value: string } };
  statementDescription?: string;
  failureReason?: { failureCode: string; failureMessage: string };
};

export type PawaPayRefundRequest = {
  refundId: string;
  depositId: string;
  amount: string;
  metadata?: Array<{ fieldName: string; fieldValue: string }>;
};

export type PawaPayRefundResponse = {
  refundId: string;
  status: 'ACCEPTED' | 'COMPLETED' | 'FAILED' | 'DUPLICATE_IGNORED';
  depositId: string;
  amount?: string;
  currency?: string;
  failureReason?: { failureCode: string; failureMessage: string };
};

export type PawaPayWebhookDepositEvent = {
  depositId: string;
  status: 'COMPLETED' | 'FAILED';
  amount: string;
  currency: string;
  correspondent: PawaPayCorrespondent;
  payer: { type: string; address: { value: string } };
  statementDescription: string;
  created: string;
  respondedByPayer?: string;
  correspondentIds?: Record<string, string>;
  failureReason?: { failureCode: string; failureMessage: string };
  metadata?: Array<{ fieldName: string; fieldValue: string }>;
};

export type PawaPayWebhookRefundEvent = {
  refundId: string;
  depositId: string;
  status: 'COMPLETED' | 'FAILED';
  amount: string;
  currency: string;
  failureReason?: { failureCode: string; failureMessage: string };
};

const PAWAPAY_SANDBOX_BASE_URL = 'https://api.sandbox.pawapay.io';
const PAWAPAY_PROD_BASE_URL = 'https://api.pawapay.io';
const CONNECT_TIMEOUT_MS = 8_000;

@Injectable()
export class PawaPayService {
  private readonly logger = new Logger(PawaPayService.name);
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    // PAWAPAY_ENVIRONMENT allows forcing sandbox on the production server for
    // initial field testing without modifying NODE_ENV (which controls
    // the backend's own validation and behaviour).
    // Values: 'sandbox' | 'production'. Defaults to NODE_ENV === 'production'.
    const pawaPayEnv =
      this.configService.get<string>('payments.pawapay.environment') ??
      this.configService.get<string>('PAWAPAY_ENVIRONMENT');
    const useSandbox =
      pawaPayEnv === 'sandbox' ||
      (pawaPayEnv !== 'production' && nodeEnv !== 'production');
    this.baseUrl = useSandbox ? PAWAPAY_SANDBOX_BASE_URL : PAWAPAY_PROD_BASE_URL;
    this.apiToken =
      this.configService.get<string>('payments.pawapay.apiToken') ??
      this.configService.get<string>('PAWAPAY_API_TOKEN') ??
      '';
    this.webhookSecret =
      this.configService.get<string>('payments.pawapay.webhookSecret') ??
      this.configService.get<string>('PAWAPAY_WEBHOOK_SECRET') ??
      '';
  }

  async initiateDeposit(
    req: PawaPayDepositRequest,
  ): Promise<PawaPayDepositResponse> {
    return this.post<PawaPayDepositResponse>('/v1/deposits', req);
  }

  async getDepositStatus(depositId: string): Promise<PawaPayDepositResponse> {
    return this.get<PawaPayDepositResponse>(`/v1/deposits/${depositId}`);
  }

  async initiateRefund(
    req: PawaPayRefundRequest,
  ): Promise<PawaPayRefundResponse> {
    return this.post<PawaPayRefundResponse>('/v1/refunds', req);
  }

  async getRefundStatus(refundId: string): Promise<PawaPayRefundResponse> {
    return this.get<PawaPayRefundResponse>(`/v1/refunds/${refundId}`);
  }

  verifyWebhookSignature(
    rawBody: string,
    receivedSignature: string | undefined,
  ): boolean {
    if (!this.webhookSecret || !receivedSignature) return false;
    try {
      const expected = createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      const receivedBuf = Buffer.from(receivedSignature, 'hex');
      if (expectedBuf.length !== receivedBuf.length) return false;
      return timingSafeEqual(expectedBuf, receivedBuf);
    } catch {
      return false;
    }
  }

  isDepositEvent(body: unknown): body is PawaPayWebhookDepositEvent {
    const b = body as Record<string, unknown>;
    return typeof b?.depositId === 'string' && !('refundId' in b);
  }

  isRefundEvent(body: unknown): body is PawaPayWebhookRefundEvent {
    const b = body as Record<string, unknown>;
    return typeof b?.refundId === 'string' && typeof b?.depositId === 'string';
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CONNECT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        this.logger.error(
          `PawaPay ${method} ${path} → HTTP ${response.status}: ${errorText}`,
        );
        throw new Error(
          `PawaPay API error: HTTP ${response.status} at ${path}`,
        );
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }
}
