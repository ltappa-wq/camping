// Pure logic for guest-initiated booking modifications and self-
// cancellations. Both share the same cutoff gate; modifications layer
// quote recompute on top. No I/O, no Prisma, no React.

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export type CutoffCheckInput = {
  /** Property.guestModificationCutoffHours. 0 disables guest self-service. */
  guestModificationCutoffHours: number;
  /** Timestamp the stay starts. Typically the reservation's checkIn at
   *  midnight UTC — finer granularity (e.g. property checkInTime) would
   *  require a property timezone we don't store in v1. */
  checkInAt: Date;
  /** "Now" — injectable for tests. */
  now?: Date;
};

export type CutoffCheckResult =
  | { allowed: true; hoursUntilCheckIn: number }
  | { allowed: false; reason: string };

/**
 * Gate self-service modifications and cancellations against the property's
 * cutoff window. Returns a structured result rather than throwing because
 * callers (server actions, UI guards) want to show the rejection reason
 * verbatim.
 *
 * Special case: cutoffHours=0 disables guest self-service entirely.
 * Setting it to 0 is the operator's signal that they want to handle
 * every change themselves.
 */
export function checkModificationCutoff(
  input: CutoffCheckInput,
): CutoffCheckResult {
  if (input.guestModificationCutoffHours === 0) {
    return {
      allowed: false,
      reason:
        "Online changes aren't available for this property. Please contact the property directly.",
    };
  }

  const now = (input.now ?? new Date()).getTime();
  const cutoffMs = input.guestModificationCutoffHours * ONE_HOUR_MS;
  const checkIn = input.checkInAt.getTime();

  if (now + cutoffMs > checkIn) {
    const hoursAway = Math.max(0, Math.floor((checkIn - now) / ONE_HOUR_MS));
    const cutoff = input.guestModificationCutoffHours;
    return {
      allowed: false,
      reason:
        hoursAway > 0
          ? `Online changes aren't allowed within ${cutoff} hours of check-in. Your stay starts in ${hoursAway} hour${hoursAway === 1 ? "" : "s"}. Please contact the property directly.`
          : `Online changes aren't allowed within ${cutoff} hours of check-in. Your stay has already started or is imminent — please contact the property directly.`,
    };
  }

  const hoursUntilCheckIn = Math.max(
    0,
    Math.floor((checkIn - now) / ONE_HOUR_MS),
  );
  return { allowed: true, hoursUntilCheckIn };
}

// === Modification price-diff and refund proration ==========================

export type ModificationPolicy = {
  cancelFullRefundDays: number;
  cancelPartialRefundDays: number;
  cancelPartialRefundPct: number;
};

export type ModificationDiffInput = {
  /** What the guest paid against this booking minus prior refunds. */
  currentPaidCents: number;
  /** Re-quoted total for the new dates/site. */
  newTotalCents: number;
};

export type ModificationDiff =
  | { kind: "equal" }
  | { kind: "upcharge"; upchargeCents: number }
  | { kind: "refund"; rawRefundCents: number };

/** Classifies a modification by its price impact. The refund branch
 *  carries the *raw* difference; computeModificationRefund applies
 *  the policy proration. */
export function classifyModificationDiff(
  input: ModificationDiffInput,
): ModificationDiff {
  const delta = input.newTotalCents - input.currentPaidCents;
  if (delta === 0) return { kind: "equal" };
  if (delta > 0) return { kind: "upcharge", upchargeCents: delta };
  return { kind: "refund", rawRefundCents: -delta };
}

export type ModificationRefundInput = {
  /** Original booking — used to compute removed nights and per-night value. */
  oldCheckIn: Date;
  oldCheckOut: Date;
  oldTotalCents: number;
  /** New booking after the change. */
  newCheckIn: Date;
  newCheckOut: Date;
  newTotalCents: number;
  /** Today, midnight UTC — injectable for tests. */
  cancellationDate: Date;
  policy: ModificationPolicy;
  /** Subtract the platform fee from the refund just like a cancellation,
   *  per spec — "downward modifications consistent with cancellations." */
  retainPlatformFee: boolean;
  platformFeeCents: number;
  /** Refunds already issued against this reservation; we never refund
   *  more than (paid − alreadyRefunded). */
  paidCents: number;
  alreadyRefundedCents: number;
};

export type ModificationRefundOutput = {
  /** Floored at 0 and at the remaining-refundable cap. */
  refundCents: number;
  /** Sum of removed nights' raw value before policy/fee adjustments. */
  rawRemovedValueCents: number;
  /** Each removed night's contribution, for explainability in the UI. */
  removedNights: ReadonlyArray<{
    date: string; // YYYY-MM-DD
    daysFromCancellation: number;
    tier: "FULL" | "PARTIAL" | "NONE";
    /** Per-night value (uniform across the OLD stay) before tier proration. */
    nightValueCents: number;
    /** Refund this night contributes (after tier proration, before fee retention). */
    refundContributionCents: number;
  }>;
  /** Human-readable rationale for the operator UI / receipt. */
  reason: string;
};

function nightsInRange(checkIn: Date, checkOut: Date): Date[] {
  const out: Date[] = [];
  const start = checkIn.getTime();
  const end = checkOut.getTime();
  for (let t = start; t < end; t += ONE_DAY_MS) {
    out.push(new Date(t));
  }
  return out;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the refund owed when a modification reduces the booking total.
 * Per spec: for each removed night, apply the cancellation policy based
 * on how many days from now the night is.
 *
 * Per-night value uses uniform proration across the OLD stay
 * (oldTotalCents / oldNightCount). For nightly bookings this matches
 * the actual per-night charge; for weekly/monthly plans it's an
 * approximation. Documented as a v1 simplification.
 *
 * Decision: this differs from a "compute refund on the dollar
 * difference" approach because per-night honors WHEN nights were
 * scheduled — a removed night 30 days out gets a full refund even if
 * the booking's checkIn was 5 days away. Matches the spec's stated
 * rule: "downward modifications consistent with cancellations" applied
 * to each night individually.
 */
export function computeModificationRefund(
  input: ModificationRefundInput,
): ModificationRefundOutput {
  const oldNights = nightsInRange(input.oldCheckIn, input.oldCheckOut);
  const newNights = new Set(
    nightsInRange(input.newCheckIn, input.newCheckOut).map((d) => ymd(d)),
  );

  const oldNightCount = oldNights.length;
  if (oldNightCount === 0) {
    return {
      refundCents: 0,
      rawRemovedValueCents: 0,
      removedNights: [],
      reason: "Original booking has no nights to refund against.",
    };
  }

  const nightValueCents = Math.round(input.oldTotalCents / oldNightCount);
  const cancellationMs = input.cancellationDate.getTime();

  let rawRemovedValue = 0;
  let refundFromNights = 0;
  // Build a mutable list locally, then return it widened to ReadonlyArray
  // through the function signature.
  const removedNights: Array<{
    date: string;
    daysFromCancellation: number;
    tier: "FULL" | "PARTIAL" | "NONE";
    nightValueCents: number;
    refundContributionCents: number;
  }> = [];

  for (const night of oldNights) {
    if (newNights.has(ymd(night))) continue;
    const daysFromCancellation = Math.round(
      (night.getTime() - cancellationMs) / ONE_DAY_MS,
    );
    let tier: "FULL" | "PARTIAL" | "NONE";
    let factor: number;
    if (daysFromCancellation < 0) {
      tier = "NONE";
      factor = 0;
    } else if (daysFromCancellation >= input.policy.cancelFullRefundDays) {
      tier = "FULL";
      factor = 1;
    } else if (
      daysFromCancellation >= input.policy.cancelPartialRefundDays
    ) {
      tier = "PARTIAL";
      factor = input.policy.cancelPartialRefundPct / 100;
    } else {
      tier = "NONE";
      factor = 0;
    }
    const refundContribution = Math.round(nightValueCents * factor);
    rawRemovedValue += nightValueCents;
    refundFromNights += refundContribution;
    removedNights.push({
      date: ymd(night),
      daysFromCancellation,
      tier,
      nightValueCents,
      refundContributionCents: refundContribution,
    });
  }

  // Retain the platform fee out of the refund — but only when there's
  // any refund to retain it from. Matches the cancellation pattern.
  let refund = refundFromNights;
  if (input.retainPlatformFee && refund > 0) {
    refund = Math.max(0, refund - Math.max(0, input.platformFeeCents));
  }

  // Cap at remaining-refundable.
  const remainingRefundable = Math.max(
    0,
    input.paidCents - input.alreadyRefundedCents,
  );
  refund = Math.min(refund, remainingRefundable);
  refund = Math.max(0, refund);

  // Reason copy: pick the dominant tier to summarize.
  const tierCounts = removedNights.reduce(
    (acc, n) => {
      acc[n.tier]++;
      return acc;
    },
    { FULL: 0, PARTIAL: 0, NONE: 0 },
  );
  const removedCount = removedNights.length;
  const dominant =
    tierCounts.FULL >= tierCounts.PARTIAL && tierCounts.FULL >= tierCounts.NONE
      ? "FULL"
      : tierCounts.PARTIAL >= tierCounts.NONE
        ? "PARTIAL"
        : "NONE";
  const reason =
    removedCount === 0
      ? "No nights removed."
      : dominant === "FULL"
        ? `${removedCount} night${removedCount === 1 ? "" : "s"} removed; full refund per policy.`
        : dominant === "PARTIAL"
          ? `${removedCount} night${removedCount === 1 ? "" : "s"} removed; ${input.policy.cancelPartialRefundPct}% refund per policy.`
          : `${removedCount} night${removedCount === 1 ? "" : "s"} removed; no refund per policy (within ${input.policy.cancelPartialRefundDays} days of arrival).`;

  return {
    refundCents: refund,
    rawRemovedValueCents: rawRemovedValue,
    removedNights,
    reason,
  };
}
