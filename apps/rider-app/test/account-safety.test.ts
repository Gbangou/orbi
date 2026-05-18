import {
  buildSavedPlacePayload,
  buildTrustedContactPayload,
} from '../lib/account-safety';

describe('rider account safety helpers', () => {
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
      message: 'Ajoutez un numero Burkina avant d activer le partage automatique.',
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
      message: 'Le lieu contient des caracteres non autorises.',
    });
  });
});
