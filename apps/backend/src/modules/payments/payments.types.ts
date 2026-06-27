import type { Prisma } from '@prisma/client';
import type { RequestAuthContext } from '../auth/auth.types';
import type {
  CINETPAY_NETWORKS,
  FLUTTERWAVE_NETWORKS,
  MOBILE_MONEY_NETWORKS,
  PAWAPAY_NETWORKS,
  PAYMENT_CHANNELS,
} from './payments.constants';

export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];
export type MobileMoneyNetwork = (typeof MOBILE_MONEY_NETWORKS)[number];
export type SupportedFlutterwaveNetwork = (typeof FLUTTERWAVE_NETWORKS)[number];
export type SupportedCinetPayNetwork = (typeof CINETPAY_NETWORKS)[number];
export type SupportedPawaPayNetwork = (typeof PAWAPAY_NETWORKS)[number];
export type PaymentProviderKey = 'flutterwave' | 'cinetpay' | 'pawapay';
export type PaymentProviderCode = 'FLUTTERWAVE' | 'CINETPAY' | 'PAWAPAY';
export type PaymentAttemptStatus =
  | 'INITIATED'
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export type CreateCheckoutIntentInput = {
  rideRequestId: string;
  channel: PaymentChannel;
  amount?: number;
  mobileMoneyNetwork?: MobileMoneyNetwork;
  customerPhoneNumber?: string;
  redirectUrl?: string;
};

export type PaymentWebhookPayload = {
  event?: string;
  transactionRef?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ProviderVerificationPayload = {
  event: string;
  transactionRef: string;
  data: {
    providerReference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    raw: Record<string, unknown>;
  };
};

export type PaymentWebhookSignatureContext = {
  rawBody?: string;
  flutterwaveSignature?: string;
  flutterwaveVerificationHash?: string;
  cinetpayToken?: string;
  pawaPaySignatureVerified?: boolean;
};

export type PaymentRequestContext = Pick<RequestAuthContext, 'user'>;

export type RideRequestPaymentOwnership = {
  id: string;
  status: string;
  estimatedFare: Prisma.Decimal | null;
  currency: string;
  rider: {
    userId: string;
  };
  trip: {
    status: string;
  } | null;
};

export type PaymentAttemptCreateData = {
  userId: string;
  rideRequestId: string;
  idempotencyKey?: string;
  idempotencyHash?: string;
  provider: PaymentProviderCode;
  channel: PaymentChannel;
  status: PaymentAttemptStatus;
  amount: Prisma.Decimal;
  currency: string;
  mobileMoneyNetwork?: MobileMoneyNetwork;
  transactionRef: string;
  customerPhoneNumber?: string;
  redirectUrl?: string;
  providerMetadata: Prisma.InputJsonValue;
};

export type PaymentRefundInput = {
  actorUserId: string;
  actorName?: string | null;
  reason?: string | null;
};

export type PaymentRefundProviderResult = {
  providerRefundReference: string;
  status: 'pending' | 'processed';
  providerMode: 'manual_or_provider_console' | 'provider_api';
  raw: Record<string, unknown>;
};
