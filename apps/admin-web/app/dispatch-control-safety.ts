type DispatchSettingsFormValues = {
  lookbackHours: string;
  halfLifeHours: string;
  declineCooldownMinutes: string;
  historyLimit: string;
};

type DispatchSettingsPayload = {
  lookbackHours: number;
  halfLifeHours: number;
  declineCooldownMinutes: number;
  historyLimit: number;
};

type DispatchControlConstraint = {
  label: string;
  min: number;
  max: number;
};

const strictIntegerPattern = /^[0-9]+$/;
const dispatchControlConstraints: Record<
  keyof DispatchSettingsFormValues,
  DispatchControlConstraint
> = {
  lookbackHours: {
    label: 'Lookback hours',
    min: 6,
    max: 336,
  },
  halfLifeHours: {
    label: 'Half-life hours',
    min: 1,
    max: 168,
  },
  declineCooldownMinutes: {
    label: 'Decline cooldown min',
    min: 1,
    max: 240,
  },
  historyLimit: {
    label: 'History limit',
    min: 8,
    max: 200,
  },
};

function parseStrictBoundedFormInteger(
  value: string,
  constraint: DispatchControlConstraint,
) {
  const trimmed = value.trim();

  if (!strictIntegerPattern.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < constraint.min ||
    parsed > constraint.max
  ) {
    return null;
  }

  return parsed;
}

export function resolveDispatchSettingsFormPayload(
  values: DispatchSettingsFormValues,
):
  | { payload: DispatchSettingsPayload; error: null }
  | { payload: null; error: string } {
  const payload = {} as DispatchSettingsPayload;

  for (const key of Object.keys(dispatchControlConstraints) as Array<
    keyof DispatchSettingsFormValues
  >) {
    const constraint = dispatchControlConstraints[key];
    const parsed = parseStrictBoundedFormInteger(values[key], constraint);

    if (parsed === null) {
      return {
        payload: null,
        error: `${constraint.label} doit etre un entier entre ${constraint.min} et ${constraint.max}.`,
      };
    }

    payload[key] = parsed;
  }

  return { payload, error: null };
}
