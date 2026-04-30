export const DEFAULT_PAYMENT_CURRENCY = 'XOF';
export const DEFAULT_PAYMENT_PROVIDER = 'flutterwave';

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
