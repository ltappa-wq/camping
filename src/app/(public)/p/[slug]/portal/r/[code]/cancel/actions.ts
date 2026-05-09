"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { computeRefund } from "@/lib/refunds";
import { checkModificationCutoff } from "@/lib/booking-modification";
import { requireGuestSession } from "@/lib/guest-auth";
import { renderCancellationEmail } from "@/lib/email";
import { dispatchEmail } from "@/lib/email-dispatch";

type CancelPolicy = {
  cancelFullRefundDays: number;
  cancelPartialRefundDays: number;
  cancelPartialRefundPct: number;
};

function parseCancelPolicy(json: unknown): CancelPolicy | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (
    typeof o.cancelFullRefundDays !== "number" ||
    typeof o.cancelPartialRefundDays !== "number" ||
    typeof o.cancelPartialRefundPct !== "number"
  ) {
    return null;
  }
  return o as CancelPolicy;
}

function todayMidnightUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export type GuestCancelResult =
  | { ok: true; refundCents: number }
  | { ok: false; error: string };

/**
 * Guest-initiated cancellation. Mirrors the operator-side cancel action
 * from Phase 4 step 4 with two intentional differences:
 *   1. Cutoff gate runs first — operator can always cancel; guest can't
 *      cancel within the property's modification cutoff window.
 *   2. No override option — the guest gets exactly the policy refund.
 *      Operator can post-hoc override on their side if they want to be
 *      generous (Phase 4's operator cancel flow).
 *
 * Order of operations matches the operator side: pre-flight checks →
 * Stripe refund (outside transaction) → DB transaction → emails best-
 * effort. If Stripe refund fails the reservation stays CONFIRMED so
 * the guest can try again or contact the property.
 */
export async function cancelReservationByGuestAction(
  slug: string,
  code: string,
): Promise<GuestCancelResult> {
  const session = await requireGuestSession(slug);

  const reservation = await prisma.reservation.findFirst({
    where: {
      confirmationCode: code,
      guestId: session.guestId,
      propertyId: session.propertyId,
    },
    include: {
      property: {
        include: {
          // operatorUsers belongs to Organization, not Property — nest the
          // include accordingly so the OWNER recipient lookup is in the
          // single round-trip rather than a separate query.
          organization: {
            select: {
              platformFeeFlatCents: true,
              customerPaysPlatformFee: true,
              operatorUsers: {
                where: { role: "OWNER" },
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { email: true },
              },
            },
          },
        },
      },
      site: { include: { siteType: true } },
      guest: true,
      payments: true,
    },
  });
  if (!reservation) return { ok: false, error: "Reservation not found." };

  // Destructure once — TypeScript was narrowing the relations away
  // somewhere between the renderCancellationEmail and
  // renderGuestCancellationOperatorNotice calls below. Pulling these
  // into locals keeps the types stable across the function.
  const { property, site, guest, payments } = reservation;

  if (reservation.status !== "CONFIRMED") {
    return {
      ok: false,
      error: `This reservation is ${reservation.status.toLowerCase().replace("_", "-")}; no further changes can be made online.`,
    };
  }

  // Cutoff gate. Use checkIn (midnight UTC) as the reference point —
  // finer granularity would need a property timezone we don't store.
  const cutoff = checkModificationCutoff({
    guestModificationCutoffHours:
      property.guestModificationCutoffHours,
    checkInAt: reservation.checkIn,
  });
  if (!cutoff.allowed) {
    return { ok: false, error: cutoff.reason };
  }

  // Compute refund using the snapshot policy at booking time.
  const policy =
    parseCancelPolicy(reservation.cancelPolicySnapshot) ?? {
      cancelFullRefundDays: property.cancelFullRefundDays,
      cancelPartialRefundDays: property.cancelPartialRefundDays,
      cancelPartialRefundPct: property.cancelPartialRefundPct,
    };

  // Decision: retain the platform fee on refund only when the customer
  // explicitly paid it on top at booking. With customerPaysPlatformFee
  // = false (operator absorbed the fee), the customer never saw a $3
  // line item and shouldn't have $3 deducted from their refund. This
  // matches what guests expect ("half" means half, not "half minus
  // unseen processing fee"). Same rule on the portal preview.
  const refundResult = computeRefund({
    paidCents: reservation.paidCents,
    alreadyRefundedCents: reservation.refundedCents,
    checkInDate: reservation.checkIn,
    cancellationDate: todayMidnightUtc(),
    policy,
    retainPlatformFee: property.organization.customerPaysPlatformFee,
    platformFeeCents: property.organization.platformFeeFlatCents,
  });
  const refundCents = refundResult.suggestedRefundCents;

  // If a refund is owed and the booking was paid via something other
  // than Stripe (cash/check/manual card), we can't process it from the
  // portal — punt to the operator. Self-cancel without refund (NONE
  // tier) still works for non-Stripe bookings.
  const stripePayment = payments.find(
    (p) =>
      p.paymentMethod === "STRIPE" &&
      p.stripePaymentIntentId &&
      p.status === "SUCCEEDED",
  );
  if (refundCents > 0 && !stripePayment) {
    return {
      ok: false,
      error:
        "A refund is owed but the booking wasn't paid via card. Please contact the property directly to cancel and arrange a refund.",
    };
  }

  // Fire the Stripe refund first; if it errors we don't want to mark
  // the reservation cancelled with a phantom refund.
  if (refundCents > 0 && stripePayment?.stripePaymentIntentId) {
    try {
      await getStripe().refunds.create({
        payment_intent: stripePayment.stripePaymentIntentId,
        amount: refundCents,
        reverse_transfer: true,
        refund_application_fee: false,
        metadata: {
          reservationId: reservation.id,
          source: "guest-portal",
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown Stripe error";
      return {
        ok: false,
        error: `Refund failed: ${message}. Please try again or contact the property.`,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: "Cancelled by guest via portal",
        refundedCents: { increment: refundCents },
      },
    });
    if (refundCents > 0 && stripePayment) {
      const newRefunded = stripePayment.refundedAmountCents + refundCents;
      const fullyRefunded = newRefunded >= stripePayment.amountCents;
      await tx.payment.update({
        where: { id: stripePayment.id },
        data: {
          refundedAmountCents: newRefunded,
          status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
        },
      });
    }
  });

  // ---- Emails (best-effort) ----
  const propertyContact = [
    property.email
      ? `Email: ${property.email}`
      : null,
    property.phone
      ? `Phone: ${property.phone}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const guestContent = renderCancellationEmail({
    guestName: guest.name,
    confirmationCode: reservation.confirmationCode,
    propertyName: property.name,
    siteLabel: site.label,
    siteTypeName: site.siteType.name,
    checkInDate: reservation.checkIn.toISOString().slice(0, 10),
    checkOutDate: reservation.checkOut.toISOString().slice(0, 10),
    refundCents,
    propertyContact,
    reason: null,
  });

  const operatorRecipient =
    property.email ??
    property.organization.operatorUsers[0]?.email ??
    null;

  const operatorContent = renderGuestCancellationOperatorNotice({
    propertyName: property.name,
    confirmationCode: reservation.confirmationCode,
    guestName: guest.name,
    guestEmail: guest.email,
    siteLabel: site.label,
    siteTypeName: site.siteType.name,
    checkInDate: reservation.checkIn.toISOString().slice(0, 10),
    checkOutDate: reservation.checkOut.toISOString().slice(0, 10),
    refundCents,
    paidCents: reservation.paidCents,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    reservationId: reservation.id,
  });

  const dispatches: Promise<unknown>[] = [
    dispatchEmail({
      propertyId: reservation.propertyId,
      reservationId: reservation.id,
      type: "CANCELLATION",
      to: guest.email,
      content: guestContent,
    }),
  ];
  if (operatorRecipient) {
    dispatches.push(
      dispatchEmail({
        propertyId: reservation.propertyId,
        reservationId: reservation.id,
        type: "CANCELLATION",
        to: operatorRecipient,
        content: operatorContent,
      }),
    );
  }
  await Promise.allSettled(dispatches);

  revalidatePath(`/p/${slug}/portal`);
  revalidatePath(`/p/${slug}/portal/r/${code}`);
  return { ok: true, refundCents };
}

// ---- Operator-facing cancel notice for guest-initiated cancels ----
// Plain text, lives here rather than email.ts because it's a thin
// composition of formatted lines specific to this flow.

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function renderGuestCancellationOperatorNotice(v: {
  propertyName: string;
  confirmationCode: string;
  guestName: string;
  guestEmail: string;
  siteLabel: string;
  siteTypeName: string;
  checkInDate: string;
  checkOutDate: string;
  refundCents: number;
  paidCents: number;
  appUrl: string;
  reservationId: string;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const bodyText = `Guest cancellation at ${v.propertyName}.

  Confirmation: ${v.confirmationCode}
  Guest: ${v.guestName} (${v.guestEmail})
  Site: ${v.siteLabel} (${v.siteTypeName})
  Dates: ${v.checkInDate} → ${v.checkOutDate}
  Paid:    ${formatCents(v.paidCents)}
  Refund:  ${formatCents(v.refundCents)} (per cancellation policy)

The reservation has been marked CANCELLED in the operator dashboard.
The refund (if any) was processed via Stripe with reverse_transfer
so it pulls from your connected balance — the platform fee stays
with the platform per the standard cancellation policy.

View: ${v.appUrl}/admin/reservations/${v.reservationId}`;

  const bodyHtml = `<pre style="font-family: ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; margin: 0;">${escapeHtml(bodyText)}</pre>`;

  return {
    subject: `Guest cancellation: ${v.guestName} — ${v.confirmationCode}`,
    bodyHtml,
    bodyText,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
