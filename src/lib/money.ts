// Money is stored as integer cents. Percentages are stored as basis points
// (100 bps = 1.00%). Conversions live here so callers never juggle floats.

/**
 * Convert a dollar amount (possibly with cents as decimals) to integer cents.
 * Accepts numbers like 12.5 or strings like "12.50". Throws on NaN or
 * negative values when allowNegative is false.
 *
 * Examples: 40 → 4000, 12.34 → 1234, "0.05" → 5
 */
export function dollarsToCents(
  input: number | string,
  opts: { allowNegative?: boolean } = {},
): number {
  const n = typeof input === "string" ? Number(input) : input;
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid dollar amount: ${input}`);
  }
  if (!opts.allowNegative && n < 0) {
    throw new Error(`Negative amount not allowed: ${input}`);
  }
  // Round at the hundredths place to avoid 12.34 * 100 → 1233.9999...
  return Math.round(n * 100);
}

/**
 * Convert integer cents back to a dollar number. 4000 → 40, 1234 → 12.34.
 * Useful for pre-filling form inputs.
 */
export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Format integer cents as a USD string. 4000 → "$40.00".
 * UI-only; never persist this.
 */
export function formatCents(
  cents: number,
  opts: { showCurrency?: boolean } = { showCurrency: true },
): string {
  const value = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return opts.showCurrency ? `$${value}` : value;
}

/**
 * Convert a human percentage (5.5 = 5.5%) to basis points.
 * 5.5 → 550, "5" → 500, "0.125" → 13 (rounds).
 */
export function percentToBasisPoints(
  input: number | string,
  opts: { allowNegative?: boolean } = {},
): number {
  const n = typeof input === "string" ? Number(input) : input;
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid percent: ${input}`);
  }
  if (!opts.allowNegative && n < 0) {
    throw new Error(`Negative percent not allowed: ${input}`);
  }
  return Math.round(n * 100);
}

/**
 * Convert basis points back to a human percent number. 550 → 5.5.
 */
export function basisPointsToPercent(bps: number): number {
  return Math.round(bps) / 100;
}

/**
 * Format basis points as a human percent string. 550 → "5.50%".
 */
export function formatBasisPoints(bps: number): string {
  return `${(bps / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}
