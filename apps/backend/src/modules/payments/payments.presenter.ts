import { CINETPAY_NETWORKS, FLUTTERWAVE_NETWORKS } from './payments.constants';
import type { PaymentChannel, PaymentProviderCode } from './payments.types';

export function serializeCheckoutIntent(params: {
  provider: PaymentProviderCode;
  transactionRef: string;
  amount: number;
  currency: string;
  channel: PaymentChannel;
  callbackUrl?: string | null;
  notifyUrl?: string | null;
  publicKeyPresent?: boolean;
  siteIdPresent?: boolean;
}) {
  if (params.provider === 'FLUTTERWAVE') {
    return {
      provider: 'FLUTTERWAVE' as const,
      transactionRef: params.transactionRef,
      checkoutMode: 'REDIRECT_OR_INLINE' as const,
      amount: params.amount,
      currency: params.currency,
      channel: params.channel,
      supportedMobileMoneyNetworks: [...FLUTTERWAVE_NETWORKS],
      providerMetadata: {
        publicKeyPresent: params.publicKeyPresent ?? false,
        callbackUrl: params.callbackUrl ?? null,
      },
      trustNotes: {
        providerAbstractionEnabled: true,
        webhookVerificationRequired: true,
        settlementModel: 'aggregator' as const,
      },
    };
  }

  return {
    provider: 'CINETPAY' as const,
    transactionRef: params.transactionRef,
    checkoutMode: 'REDIRECT_OR_WIDGET' as const,
    amount: params.amount,
    currency: params.currency,
    channel: params.channel,
    supportedMobileMoneyNetworks: [...CINETPAY_NETWORKS],
    providerMetadata: {
      siteIdPresent: params.siteIdPresent ?? false,
      notifyUrl: params.notifyUrl ?? null,
    },
    trustNotes: {
      providerAbstractionEnabled: true,
      webhookVerificationRequired: true,
      settlementModel: 'aggregator' as const,
    },
  };
}
