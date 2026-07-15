type PromoCodeFormValues = {
  code: string;
  description: string;
  discountBps: string;
  maxUses: string;
  validFrom: string;
  validTo: string;
  firstTripOnly: boolean;
};

type PromoCodePayload = {
  code: string;
  description?: string;
  discountBps: number;
  maxUses?: number;
  validFrom: string;
  validTo: string;
  firstTripOnly: boolean;
};

const strictIntegerPattern = /^[0-9]+$/;
const isoDateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseStrictBoundedInteger(value: string, min: number, max: number) {
  const trimmed = value.trim();

  if (!strictIntegerPattern.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function parseStrictDateOnly(value: string) {
  const match = isoDateOnlyPattern.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function resolvePromoCodeFormPayload(
  form: PromoCodeFormValues,
): { payload: PromoCodePayload; error: null } | { payload: null; error: string } {
  const code = form.code.trim().toUpperCase();
  const validFrom = parseStrictDateOnly(form.validFrom);
  const validTo = parseStrictDateOnly(form.validTo);

  if (!code || !form.validFrom || !form.validTo) {
    return { payload: null, error: 'Remplissez tous les champs obligatoires.' };
  }

  if (code.length < 3 || code.length > 32) {
    return {
      payload: null,
      error: 'Le code promo doit contenir entre 3 et 32 caracteres.',
    };
  }

  const discountBps = parseStrictBoundedInteger(form.discountBps, 1, 10000);

  if (discountBps === null) {
    return {
      payload: null,
      error: 'La remise doit etre un entier entre 1 et 10000 bps.',
    };
  }

  let maxUses: number | undefined;

  if (form.maxUses.trim()) {
    const parsedMaxUses = parseStrictBoundedInteger(form.maxUses, 1, 100000);

    if (parsedMaxUses === null) {
      return {
        payload: null,
        error: 'Le nombre maximum d utilisations doit etre entre 1 et 100000.',
      };
    }

    maxUses = parsedMaxUses;
  }

  if (!validFrom || !validTo || validTo.getTime() <= validFrom.getTime()) {
    return {
      payload: null,
      error: 'La date de fin doit etre apres la date de debut.',
    };
  }

  const description = form.description.trim();

  return {
    payload: {
      code,
      description: description || undefined,
      discountBps,
      maxUses,
      validFrom: validFrom.toISOString(),
      validTo: validTo.toISOString(),
      firstTripOnly: form.firstTripOnly,
    },
    error: null,
  };
}
