import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
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
  | 'REJECTED'
  | 'DUPLICATE_IGNORED';

export type PawaPayDepositRequest = {
  depositId: string;
  amount: string;
  currency: 'XOF';
  correspondent: PawaPayCorrespondent;
  payer: { type: 'MSISDN'; address: { value: string } };
  customerTimestamp: string;
  statementDescription: string;
  clientReferenceId?: string;
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
  currency?: string;
  metadata?: Array<{ fieldName: string; fieldValue: string }>;
};

export type PawaPayRefundResponse = {
  refundId: string;
  status:
    | 'ACCEPTED'
    | 'COMPLETED'
    | 'FAILED'
    | 'REJECTED'
    | 'DUPLICATE_IGNORED';
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
const PAWAPAY_COUNTRY_BFA = 'BFA';

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
    this.baseUrl = useSandbox
      ? PAWAPAY_SANDBOX_BASE_URL
      : PAWAPAY_PROD_BASE_URL;
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
    const response = await this.post<PawaPayDepositResponse>(
      '/v2/deposits',
      this.toV2DepositRequest(req),
    );

    return {
      ...response,
      depositId: response.depositId ?? req.depositId,
    };
  }

  async getDepositStatus(depositId: string): Promise<PawaPayDepositResponse> {
    const response = await this.get<
      PawaPayStatusLookup<PawaPayDepositResponse>
    >(`/v2/deposits/${encodeURIComponent(depositId)}`);

    if (response.status === 'NOT_FOUND' || !response.data) {
      return {
        depositId,
        status: 'FAILED',
        failureReason: {
          failureCode: 'NOT_FOUND',
          failureMessage: 'PawaPay deposit was not found.',
        },
      };
    }

    return this.fromV2DepositResponse(response.data);
  }

  async initiateRefund(
    req: PawaPayRefundRequest,
  ): Promise<PawaPayRefundResponse> {
    const response = await this.post<PawaPayRefundResponse>(
      '/v2/refunds',
      this.toV2RefundRequest(req),
    );

    return {
      ...response,
      refundId: response.refundId ?? req.refundId,
      depositId: response.depositId ?? req.depositId,
    };
  }

  async getRefundStatus(refundId: string): Promise<PawaPayRefundResponse> {
    const response = await this.get<PawaPayStatusLookup<PawaPayRefundResponse>>(
      `/v2/refunds/${encodeURIComponent(refundId)}`,
    );

    if (response.status === 'NOT_FOUND' || !response.data) {
      return {
        refundId,
        depositId: '',
        status: 'FAILED',
        failureReason: {
          failureCode: 'NOT_FOUND',
          failureMessage: 'PawaPay refund was not found.',
        },
      };
    }

    return this.fromV2RefundResponse(response.data);
  }

  isConfigured(): boolean {
    return Boolean(this.apiToken.trim());
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
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'PawaPay API token is not configured.',
      );
    }

    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

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
          `PawaPay ${method} ${path} -> HTTP ${response.status}: ${this.redactSensitiveError(errorText)}`,
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

  private toV2DepositRequest(req: PawaPayDepositRequest) {
    return {
      depositId: req.depositId,
      payer: {
        type: 'MMO',
        accountDetails: {
          phoneNumber: req.payer.address.value,
          provider: req.correspondent,
        },
      },
      amount: req.amount,
      currency: req.currency,
      country: PAWAPAY_COUNTRY_BFA,
      preAuthorisationCode: req.preAuthorisationCode,
      clientReferenceId: req.clientReferenceId ?? req.depositId,
      customerMessage: this.normalizeCustomerMessage(req.statementDescription),
      metadata: this.toV2Metadata(req.metadata),
    };
  }

  private toV2RefundRequest(req: PawaPayRefundRequest) {
    return {
      refundId: req.refundId,
      depositId: req.depositId,
      amount: req.amount,
      currency: req.currency ?? 'XOF',
      clientReferenceId: req.refundId,
      metadata: this.toV2Metadata(req.metadata),
    };
  }

  private fromV2DepositResponse(
    response: PawaPayDepositResponse,
  ): PawaPayDepositResponse {
    const payer = response.payer as
      | {
          type?: string;
          accountDetails?: {
            phoneNumber?: string;
            provider?: PawaPayCorrespondent;
          };
          address?: { value?: string };
        }
      | undefined;

    return {
      ...response,
      payer: {
        type: payer?.type ?? 'MMO',
        address: {
          value:
            payer?.address?.value ?? payer?.accountDetails?.phoneNumber ?? '',
        },
      },
      correspondent: response.correspondent ?? payer?.accountDetails?.provider,
    };
  }

  private fromV2RefundResponse(
    response: PawaPayRefundResponse,
  ): PawaPayRefundResponse {
    return response;
  }

  private toV2Metadata(
    metadata?: Array<{ fieldName: string; fieldValue: string }>,
  ) {
    return metadata?.slice(0, 10).map((item) => ({
      [item.fieldName]: item.fieldValue,
    }));
  }

  private normalizeCustomerMessage(message: string) {
    return message.trim().slice(0, 22) || 'Orbi';
  }

  private redactSensitiveError(errorText: string) {
    return errorText
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(
        /"?(token|authorization|phoneNumber|address)"?\s*:\s*"[^"]*"/gi,
        '$1:"[redacted]"',
      );
  }
}

type PawaPayStatusLookup<T> = {
  status: 'FOUND' | 'NOT_FOUND';
  data?: T;
};
