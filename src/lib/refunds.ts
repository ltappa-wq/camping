// Refund computation. Pure function, no I/O. The refund "policy" is the
// snapshot stored on Reservation.cancelPolicySnapshot at booking time —
// future Property edits don't retroactively change refund math for
// existing reservations.
//
// The platform fee is retained on every refund tier in v1: the platform
// keeps its $3 even when the operator gives a full refund. Stripe's
// `refund_application_fee: false` enforces the same on Stripe's side.
// Both layers must agree or the operator's payout reconciliation breaks.

const ONE_DAY_MS = 86_400_000;

export type RefundPolicySnapshot = {
  /** Days before arrival ≥ this → 100% refund tier (FULL). */
  cancelFullRefundDays: number;
  /** Days before arrival ≥ this (and < cancelFullRefundDays) → partial. */
  cancelPartialRefundDays: number;
  /** Partial refund percentage, 0–100. */
  cancelPartialRefundPct: number;
};

export type ComputeRefundInput = {
  /** Total amount the guest has paid so far (Reservation.paidCents). */
  paidCents: number;
  /** Sum of prior refunds against this reservation. */
  alreadyRefundedCents: number;
  /** Date-only midnight-UTC value; the day the guest is scheduled to arrive. */
  checkInDate: Date;
  /** Date-only midnight-UTC value; typically today. */
  cancellationDate: Date;
  /** Snapshot from Reservation.cancelPolicySnapshot (or current Property defaults). */
  policy: RefundPolicySnapshot;
  /** v1: always true. The platform fee stays with the platform regardless of tier. */
  retainPlatformFee: boolean;
  /** Per-booking platform fee in cents (Organization.platformFeeFlatCents). */
  platformFeeCents: number;
};

export type RefundTier = "FULL" | "PARTIAL" | "NONE";

export type ComputeRefundOutput = {
  /** What to actually refund the guest, in cents. Floored at 0. */
  suggestedRefundCents: number;
  /** Human-readable rationale to display in the operator UI. */
  reason: string;
  policyTier: RefundTier;
  /** Negative if cancelling on or after check-in. */
  daysBeforeCheckIn: number;
};

/** Whole-day difference between two midnight-UTC dates. Positive when
 *  `checkIn` is later than `cancel`, zero on the day-of, negative after. */
function daysBetween(cancel: Date, checkIn: Date): number {
  return Math.round((checkIn.getTime() - cancel.getTime()) / ONE_DAY_MS);
}

export function computeRefund(input: ComputeRefundInput): ComputeRefundOutput {
  const days = daysBetween(input.cancellationDate, input.checkInDate);

  let tier: RefundTier;
  let baseCents: number;
  let reason: string;

  if (days < 0) {
    // Cancelled after the guest was scheduled to arrive. Treat as NONE
    // regardless of policy — even a 0-day full-refund policy doesn't
    // forgive a no-show after the fact. Operator can always override.
    tier = "NONE";
    baseCents = 0;
    reason = `No refund: cancellation is ${Math.abs(days)} day${
      Math.abs(days) === 1 ? "" : "s"
    } after arrival.`;
  } else if (days >= input.policy.cancelFullRefundDays) {
    tier = "FULL";
    baseCents = input.paidCents;
    reason = `Full refund per policy: ${days} day${days === 1 ? "" : "s"} before arrival.`;
  } else if (days >= input.policy.cancelPartialRefundDays) {
    tier = "PARTIAL";
    baseCents = Math.round(
      (input.paidCents * input.policy.cancelPartialRefundPct) / 100,
    );
    reason = `${input.policy.cancelPartialRefundPct}% refund per policy: ${days} day${
      days === 1 ? "" : "s"
    } before arrival.`;
  } else {
    tier = "NONE";
    baseCents = 0;
    reason = `No refund per policy: ${days} day${days === 1 ? "" : "s"} before arrival.`;
  }

  // Retain the platform fee out of the refund amount before subtracting
  // prior refunds. We only retain when there's actually a refund to give —
  // a NONE-tier refund stays at 0 regardless of fee math.
  let refund = baseCents;
  if (input.retainPlatformFee && refund > 0) {
    refund = Math.max(0, refund - Math.max(0, input.platformFeeCents));
  }

  // Net out earlier refunds. Floor at 0 — refunds can't go negative even
  // if the previous operator over-refunded (the over-refund is just lost
  // headroom, not a debt to the guest).
  refund = Math.max(0, refund - Math.max(0, input.alreadyRefundedCents));

  return {
    suggestedRefundCents: refund,
    reason,
    policyTier: tier,
    daysBeforeCheckIn: days,
  };
}
