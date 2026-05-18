export type TrustedContactShareMode = 'MANUAL' | 'NIGHT' | 'ALL_TRIPS';

export type PlaceForm = {
  label: string;
  address: string;
  latitude: string;
  longitude: string;
};

export type SavedPlacePayload = {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
};

export type TrustedContactPayload = {
  phoneNumber?: string;
  shareMode: TrustedContactShareMode;
  notes?: string;
};

export type FormValidationResult<TPayload> =
  | { ok: true; payload: TPayload }
  | { ok: false; message: string };

const burkinaPhonePattern = /^\+226[0-9]{8}$/;
const unsafeTextPattern = /[\u0000-\u001f<>{}\[\]\\]/;

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function hasUnsafeText(value: string) {
  return unsafeTextPattern.test(value);
}

export function buildTrustedContactPayload(input: {
  phoneNumber: string;
  shareMode: TrustedContactShareMode;
  notes: string;
}): FormValidationResult<TrustedContactPayload> {
  const phoneNumber = normalizeText(input.phoneNumber);
  const notes = normalizeText(input.notes);

  if (phoneNumber && !burkinaPhonePattern.test(phoneNumber)) {
    return {
      ok: false,
      message: 'Le contact de confiance doit etre un numero Burkina au format +226XXXXXXXX.',
    };
  }

  if (!phoneNumber && input.shareMode !== 'MANUAL') {
    return {
      ok: false,
      message: 'Ajoutez un numero Burkina avant d activer le partage automatique.',
    };
  }

  if (notes.length > 120) {
    return {
      ok: false,
      message: 'La note ops doit rester limitee a 120 caracteres.',
    };
  }

  if (hasUnsafeText(notes)) {
    return {
      ok: false,
      message: 'La note ops contient des caracteres non autorises.',
    };
  }

  return {
    ok: true,
    payload: {
      phoneNumber: phoneNumber || undefined,
      shareMode: input.shareMode,
      notes: notes || undefined,
    },
  };
}

export function buildSavedPlacePayload(
  form: PlaceForm,
): FormValidationResult<SavedPlacePayload> {
  const label = normalizeText(form.label);
  const address = normalizeText(form.address);
  const latitudeText = normalizeText(form.latitude).replace(',', '.');
  const longitudeText = normalizeText(form.longitude).replace(',', '.');

  if (!label || !address) {
    return {
      ok: false,
      message: 'Le libelle et l adresse du lieu sont obligatoires.',
    };
  }

  if (label.length < 2 || label.length > 60) {
    return {
      ok: false,
      message: 'Le libelle du lieu doit contenir entre 2 et 60 caracteres.',
    };
  }

  if (address.length < 4 || address.length > 160) {
    return {
      ok: false,
      message: 'L adresse du lieu doit contenir entre 4 et 160 caracteres.',
    };
  }

  if (hasUnsafeText(label) || hasUnsafeText(address)) {
    return {
      ok: false,
      message: 'Le lieu contient des caracteres non autorises.',
    };
  }

  if (!latitudeText || !longitudeText) {
    return {
      ok: false,
      message: 'Les coordonnees sont obligatoires pour enregistrer un lieu.',
    };
  }

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      ok: false,
      message: 'Les coordonnees doivent etre numeriques.',
    };
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return {
      ok: false,
      message: 'Les coordonnees doivent rester dans des bornes GPS valides.',
    };
  }

  return {
    ok: true,
    payload: {
      label,
      address,
      latitude,
      longitude,
    },
  };
}
