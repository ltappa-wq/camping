// Pure logic for guest-initiated booking modifications and self-
// cancellations. Both share the same cutoff gate; modifications layer
// quote recompute on top. No I/O, no Prisma, no React.

const ONE_HOUR_MS = 60 * 60 * 1000;

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
