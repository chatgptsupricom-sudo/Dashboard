const MAX_DECIMAL_PLACES = 2;

export function getTodayCaracas(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isValidMovementDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= getTodayCaracas();
}

function validateNumber(value: unknown, allowsDecimal: boolean, allowZero: boolean): string | null {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || (allowZero ? quantity < 0 : quantity <= 0)) {
    return allowZero ? "Cantidad real inválida" : "Cantidad inválida";
  }
  if (!allowsDecimal && !Number.isInteger(quantity)) {
    return "Esta unidad de medida solo permite cantidades enteras";
  }
  const decimals = String(value).split(/[.,]/)[1]?.length ?? 0;
  if (decimals > MAX_DECIMAL_PLACES) {
    return "La cantidad no puede tener más de 2 decimales";
  }
  return null;
}

export function validateQuantity(value: unknown, allowsDecimal: boolean): string | null {
  return validateNumber(value, allowsDecimal, false);
}

export function validateNonNegativeQuantity(value: unknown, allowsDecimal: boolean): string | null {
  return validateNumber(value, allowsDecimal, true);
}
