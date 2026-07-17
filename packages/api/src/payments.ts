// ── Payment types and API functions ───────────────────────────────────────────

import type { OrbiApiClient } from "./client";
import { apiRoutes } from "./routes";

// ── Payment types ─────────────────────────────────────────────────────────────

export type PaymentProviderCode =
  | "FLUTTERWAVE"
  | "CINETPAY"
  | "PAWAPAY"
  | "WALLET";
export type PaymentProviderKey =
  | "flutterwave"
  | "cinetpay"
  | "pawapay"
  | "wallet";

export type CheckoutIntentPayload = {
  rideRequestId: string;
  channel: "MOBILE_MONEY" | "CARD" | "WALLET";
  amount?: number;
  mobileMoneyNetwork?:
    | "ORANGE_MONEY"
    | "MOBICASH"
    | "MOOV"
    | "WAVE"
    | "FREE_MONEY";
  customerPhoneNumber?: string;
  redirectUrl?: string;
};

export type CheckoutIntentResponse = {
  provider: PaymentProviderCode;
  transactionRef: string;
  checkoutMode:
    | "REDIRECT_OR_INLINE"
    | "REDIRECT_OR_WIDGET"
    | "PUSH_USSD"
    | "WALLET_DEBIT";
  amount: number;
  currency: string;
  channel: "MOBILE_MONEY" | "CARD" | "WALLET";
  supportedMobileMoneyNetworks: Array<
    "ORANGE_MONEY" | "MOBICASH" | "MOOV" | "WAVE" | "FREE_MONEY"
  >;
  providerMetadata: {
    publicKeyPresent?: boolean;
    callbackUrl?: string | null;
    siteIdPresent?: boolean;
    notifyUrl?: string | null;
  };
  trustNotes: {
    providerAbstractionEnabled: boolean;
    webhookVerificationRequired: boolean;
    settlementModel: "aggregator" | "internal_wallet";
  };
};

// ── Payment API functions ─────────────────────────────────────────────────────

export async function createCheckoutIntentWithApi(
  client: OrbiApiClient,
  payload: CheckoutIntentPayload,
  options: { idempotencyKey?: string } = {},
) {
  return client.request<CheckoutIntentResponse>(
    apiRoutes.payments.checkoutIntents,
    {
      method: "POST",
      body: payload,
      headers: options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : undefined,
    },
  );
}
