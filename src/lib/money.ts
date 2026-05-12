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

/**
 * Banker's rounding (half-to-even). Reduces statistical bias vs. half-up
 * rounding when fractional cents need to land on integers — half-up
 * always nudges totals upward over a long sequence; half-to-even averages
 * out. Used in pricing.ts for tax + percent-modifier amounts.
 *
 * Examples:
 *   bankersRound(0.5) = 0       (0 is even)
 *   bankersRound(1.5) = 2       (2 is even)
 *   bankersRound(2.5) = 2       (2 is even)
 *   bankersRound(3.5) = 4       (4 is even)
 *   bankersRound(2.4) = 2       (normal floor)
 *   bankersRound(2.6) = 3       (normal ceil)
 *
 * Negatives: floor toward -∞, then the same even-tiebreak applies.
 *   bankersRound(-0.5) = 0      (floor=-1, +1 → 0; 0 is even)
 *   bankersRound(-1.5) = -2     (floor=-2, even, return -2)
 *   bankersRound(-2.5) = -2     (floor=-3, +1 → -2; even)
 */
export function bankersRound(n: number): number {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  // Exactly 0.5 — round to even.
  return floor % 2 === 0 ? floor : floor + 1;
}
