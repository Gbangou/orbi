import {
  buildSavedPlacePayload,
  buildTrustedContactPayload,
  parseWalletTopUpAmount,
} from '../lib/account-safety';
import {
  maskEmailForDisplay,
  maskPhoneForDisplay,
} from '@orbi/domain';

describe('rider account safety helpers', () => {
  it('masks account identity values for default on-screen display', () => {
    expect(maskEmailForDisplay('rider@orbi.app')).toBe('ri***@orbi.app');
    expect(maskPhoneForDisplay('+22670000000')).toBe('*** 0000');
  });

  it('handles incomplete account identity values without leaking raw input', () => {
    expect(maskEmailForDisplay('not-an-email')).toBe('Adresse masquée');
    expect(maskPhoneForDisplay('12')).toBe('Téléphone masqué');
    expect(maskPhoneForDisplay(null)).toBeNull();
  });

  it('normalizes a valid Burkina trusted contact payload', () => {
    expect(
      buildTrustedContactPayload({
        phoneNumber: '  +22670000001  ',
        shareMode: 'ALL_TRIPS',
        notes: '  Mere du rider  ',
      }),
    ).toEqual({
      ok: true,
      payload: {
        phoneNumber: '+22670000001',
        shareMode: 'ALL_TRIPS',
        notes: 'Mere du rider',
      },
    });
  });

  it('rejects automatic sharing without a trusted contact phone number', () => {
    expect(
      buildTrustedContactPayload({
        phoneNumber: '',
        shareMode: 'NIGHT',
        notes: '',
      }),
    ).toEqual({
      ok: false,
      message: "Ajoutez un numéro Burkina avant d'activer le partage automatique.",
    });
  });

  it('normalizes decimal comma coordinates for saved places', () => {
    expect(
      buildSavedPlacePayload({
        label: '  Maison  ',
        address: '  Patte d Oie, Ouagadougou  ',
        latitude: '12,3412',
        longitude: '-1,5601',
      }),
    ).toEqual({
      ok: true,
      payload: {
        label: 'Maison',
        address: 'Patte d Oie, Ouagadougou',
        latitude: 12.3412,
        longitude: -1.5601,
      },
    });
  });

  it('rejects unsafe saved place text before it reaches the API', () => {
    expect(
      buildSavedPlacePayload({
        label: '<script>',
        address: 'Ouaga 2000',
        latitude: '12.3',
        longitude: '-1.5',
      }),
    ).toEqual({
      ok: false,
      message: 'Le lieu contient des caractères non autorisés.',
    });
  });

  it('parses wallet top-up amounts without accepting partial dirty values', () => {
    expect(parseWalletTopUpAmount('1 500')).toBe(1500);
    expect(parseWalletTopUpAmount('0500')).toBe(500);
    expect(parseWalletTopUpAmount('500abc')).toBeNull();
    expect(parseWalletTopUpAmount('500,5')).toBeNull();
    expect(parseWalletTopUpAmount('')).toBeNull();
  });
});
