export const DEFAULT_PAYMENT_CURRENCY = 'XOF';
export const DEFAULT_PAYMENT_PROVIDER = 'pawapay';

export const PAYMENT_CHANNELS = ['MOBILE_MONEY', 'CARD', 'WALLET'] as const;
export const MOBILE_MONEY_NETWORKS = [
  'ORANGE_MONEY',
  'MOBICASH',
  'MOOV',
  'WAVE',
  'FREE_MONEY',
] as const;

export const FLUTTERWAVE_NETWORKS = ['ORANGE_MONEY', 'MOBICASH'] as const;
export const CINETPAY_NETWORKS = [
  'ORANGE_MONEY',
  'MOOV',
  'WAVE',
  'FREE_MONEY',
] as const;

// PawaPay correspondents available in Burkina Faso (ISO-3166-1 alpha-3: BFA)
export const PAWAPAY_NETWORKS = ['ORANGE_BFA', 'MOOV_BFA'] as const;

// Map user-facing network labels to PawaPay correspondent codes
export const PAWAPAY_NETWORK_TO_CORRESPONDENT: Record<
  string,
  (typeof PAWAPAY_NETWORKS)[number]
> = {
  ORANGE_MONEY: 'ORANGE_BFA',
  MOOV: 'MOOV_BFA',
  ORANGE_BFA: 'ORANGE_BFA',
  MOOV_BFA: 'MOOV_BFA',
};
