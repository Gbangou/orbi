import { serializeCheckoutIntent } from './payments.presenter';
import { CINETPAY_NETWORKS, FLUTTERWAVE_NETWORKS } from './payments.constants';

const baseParams = {
  transactionRef: 'txn-001',
  amount: 1800,
  currency: 'XOF',
  channel: 'MOBILE_MONEY' as never,
};

describe('serializeCheckoutIntent', () => {
  describe('FLUTTERWAVE provider', () => {
    it('returns REDIRECT_OR_INLINE checkout mode', () => {
      const result = serializeCheckoutIntent({
        ...baseParams,
        provider: 'FLUTTERWAVE',
      });

      expect(result.provider).toBe('FLUTTERWAVE');
      expect(result.checkoutMode).toBe('REDIRECT_OR_INLINE');
    });

    it('includes all Flutterwave supported mobile money networks', () => {
      const result = serializeCheckoutIntent({
        ...baseParams,
        provider: 'FLUTTERWAVE',
      });

      expect(result.supportedMobileMoneyNetworks).toEqual(FLUTTERWAVE_NETWORKS);
    });

    it('surfaces publicKeyPresent in providerMetadata', () => {
      const result = serializeCheckoutIntent({
        ...baseParams,
        provider: 'FLUTTERWAVE',
        publicKeyPresent: true,
        callbackUrl: 'https://example.com/callback',
      });

      expect(
        (result as { providerMetadata: { publicKeyPresent: boolean } })
          .providerMetadata.publicKeyPresent,
      ).toBe(true);
    });

    it('defaults publicKeyPresent to false when not provided', () => {
      const result = serializeCheckoutIntent({
        ...baseParams,
        provider: 'FLUTTERWAVE',
      });

      expect(
        (result as { providerMetadata: { publicKeyPresent: boolean } })
          .providerMetadata.publicKeyPresent,
      ).toBe(false);
    });

    it('requires webhook verification', () => {
      const result = serializeCheckoutIntent({
        ...baseParams,
        provider: 'FLUTTERWAVE',
      });

      expect(result.trustNotes.webhookVerificationRequired).toBe(true);
      expect(result.trustNotes.settlementModel).toBe('aggregator');
    });
  });

  describe('CINETPAY provider', () => {
    it('returns REDIRECT_OR_WIDGET checkout mode', () => {
      const result = serializeCheckoutIntent({
        ...baseParams,
        provider: 'CINETPAY',
      });

      expect(result.provider).toBe('CINETPAY');
      expect(result.checkoutMode).toBe('REDIRECT_OR_WIDGET');
    });

    it('includes all CinetPay supported mobile money networks', () => {
      const result = serializeCheckoutIntent({
        ...baseParams,
        provider: 'CINETPAY',
      });

      expect(result.supportedMobileMoneyNetworks).toEqual(CINETPAY_NETWORKS);
    });

    it('surfaces siteIdPresent in providerMetadata', () => {
      const result = serializeCheckoutIntent({
        ...baseParams,
        provider: 'CINETPAY',
        siteIdPresent: true,
        notifyUrl: 'https://example.com/notify',
      });

      expect(
        (result as { providerMetadata: { siteIdPresent: boolean } })
          .providerMetadata.siteIdPresent,
      ).toBe(true);
    });

    it('requires webhook verification', () => {
      const result = serializeCheckoutIntent({
        ...baseParams,
        provider: 'CINETPAY',
      });

      expect(result.trustNotes.webhookVerificationRequired).toBe(true);
    });
  });

  it('echoes the transaction reference and amount unchanged', () => {
    const result = serializeCheckoutIntent({
      ...baseParams,
      provider: 'FLUTTERWAVE',
    });

    expect(result.transactionRef).toBe('txn-001');
    expect(result.amount).toBe(1800);
    expect(result.currency).toBe('XOF');
  });
});
