"use server";

import { revalidatePath } from "next/cache";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { prisma } from "@/lib/prisma";
import {
  type EmailContent,
  formatTotalForEmail,
  renderCancellationEmail,
  renderEmail,
  sendEmail,
} from "@/lib/email";
import { getStripe } from "@/lib/stripe";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type GuestInfoInput = {
  reservationId: string;
  name: string;
  email: string;
  phone: string;
  rvMake: string;
  rvModel: string;
  rvYear: string; // empty | digits
  rvLengthFt: string;
  licensePlate: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Update the Guest row that this reservation points to. Property-scoped:
 * we never let an operator edit a guest belonging to another property.
 *
 * Email is the unique key together with propertyId, so changing it can
 * collide with another guest at the same property — surface that cleanly
 * rather than letting the DB constraint bubble up as a 500.
 */
export async function updateGuestInfoAction(
  input: GuestInfoInput,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (!name) return { ok: false, error: "Name is required." };
  if (!EMAIL_RE.test(email))
    return { ok: false, error: "Enter a valid email." };

  const reservation = await prisma.reservation.findFirst({
    where: { id: input.reservationId, propertyId: ctx.propertyId },
    select: { guestId: true, guest: { select: { email: true } } },
  });
  if (!reservation)
    return { ok: false, error: "Reservation not found." };

  // Email collision check — only matters if the operator actually changed it.
  if (email !== reservation.guest.email) {
    const conflict = await prisma.guest.findUnique({
      where: {
        propertyId_email: { propertyId: ctx.propertyId, email },
      },
      select: { id: true },
    });
    if (conflict && conflict.id !== reservation.guestId) {
      return {
        ok: false,
        error:
          "Another guest at this property already has that email. Pick a different email.",
      };
    }
  }

  const rvYear = input.rvYear.trim();
  const rvLengthFt = input.rvLengthFt.trim();

  await prisma.guest.update({
    where: { id: reservation.guestId },
    data: {
      name,
      email,
      phone: phone || null,
      rvMake: input.rvMake.trim() || null,
      rvModel: input.rvModel.trim() || null,
      rvYear: rvYear ? Number.parseInt(rvYear, 10) || null : null,
      rvLengthFt: rvLengthFt ? Number.parseInt(rvLengthFt, 10) || null : null,
      licensePlate: input.licensePlate.trim() || null,
    },
  });

  revalidatePath(`/admin/reservations/${input.reservationId}`);
  return { ok: true };
}

/**
 * Operator-only Guest.notes — distinct from Reservation.guestNotes (which is
 * what the guest typed at booking time and is read-only on this page).
 */
export async function updateOperatorNotesAction(
  reservationId: string,
  notes: string,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const reservation = await prisma.reservation.findFirst({
    where: { id: reservationId, propertyId: ctx.propertyId },
    select: { guestId: true },
  });
  if (!reservation)
    return { ok: false, error: "Reservation not found." };

  await prisma.guest.update({
    where: { id: reservation.guestId },
    data: { notes: notes.trim() || null },
  });

  revalidatePath(`/admin/reservations/${reservationId}`);
  return { ok: true };
}

/**
 * Re-send the guest's RESERVATION_CONFIRMATION email. Useful when guest
 * claims they didn't receive it. Always logs to EmailLog so the operator
 * can see what fired.
 *
 * Only allowed for reservations that have actually confirmed; resending
 * for a HELD or CANCELLED reservation makes no sense.
 */
export async function resendConfirmationAction(
  reservationId: string,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();

  const reservation = await prisma.reservation.findFirst({
    where: { id: reservationId, propertyId: ctx.propertyId },
    include: {
      property: true,
      site: { include: { siteType: true } },
      guest: { select: { email: true, name: true } },
    },
  });
  if (!reservation) return { ok: false, error: "Reservation not found." };
  if (
    reservation.status !== "CONFIRMED" &&
    reservation.status !== "CHECKED_IN" &&
    reservation.status !== "CHECKED_OUT"
  ) {
    return {
      ok: false,
      error: `Can only resend confirmations for confirmed reservations (current status: ${reservation.status}).`,
    };
  }

  const checkInDate = reservation.checkIn.toISOString().slice(0, 10);
  const checkOutDate = reservation.checkOut.toISOString().slice(0, 10);
  const nights = Math.round(
    (reservation.checkOut.getTime() - reservation.checkIn.getTime()) /
      86_400_000,
  );

  const override = await prisma.emailTemplate.findUnique({
    where: {
      propertyId_type: {
        propertyId: reservation.propertyId,
        type: "RESERVATION_CONFIRMATION",
      },
    },
  });

  const content: EmailContent = renderEmail(
    "RESERVATION_CONFIRMATION",
    {
      guestName: reservation.guest.name,
      confirmationCode: reservation.confirmationCode,
      propertyName: reservation.property.name,
      siteLabel: reservation.site.label,
      siteTypeName: reservation.site.siteType.name,
      checkInDate,
      checkOutDate,
      checkInTime: reservation.property.checkInTime,
      checkOutTime: reservation.property.checkOutTime,
      nights,
      totalCents: reservation.totalCents,
      totalFormatted: formatTotalForEmail(reservation.totalCents),
    },
    override && override.active ? override : null,
  );

  const log = await prisma.emailLog.create({
    data: {
      propertyId: reservation.propertyId,
      reservationId: reservation.id,
      type: "RESERVATION_CONFIRMATION",
      toEmail: reservation.guest.email,
      subject: content.subject,
      status: "QUEUED",
    },
  });

  const send = await sendEmail({
    to: reservation.guest.email,
    subject: content.subject,
    bodyHtml: content.bodyHtml,
    bodyText: content.bodyText,
  });

  await prisma.emailLog.update({
    where: { id: log.id },
    data: send.ok
      ? {
          status: "SENT",
          providerMessageId: send.messageId,
          sentAt: new Date(),
        }
      : { status: "FAILED", errorMessage: send.error },
  });

  revalidatePath(`/admin/reservations/${reservationId}`);

  if (!send.ok) {
    return {
      ok: false,
      error: `Email send failed: ${send.error}. The attempt is logged.`,
    };
  }
  return { ok: true };
}

export type CancelReservationInput = {
  reservationId: string;
  /** Refund amount in cents. 0 means cancel without refunding. */
  refundCents: number;
  /** Required free-text reason; goes to Reservation.cancellationReason. */
  reason: string;
  /** When true, send a cancellation email to the guest. */
  notifyGuest: boolean;
};

/**
 * Cancel a reservation, optionally refunding via Stripe. The Stripe call
 * happens outside the DB transaction (it's a network call to a third
 * party; can't be rolled back). Order is:
 *   1. Pre-flight validation
 *   2. Stripe refund (if any) — if this fails, the reservation is NOT
 *      cancelled. Operator sees the Stripe error and can retry.
 *   3. DB transaction: flip status, update Payment, update refundedCents
 *   4. Email dispatch (best-effort, logged to EmailLog)
 *
 * The Stripe refund uses reverse_transfer:true to pull funds back from
 * the operator's connected account, and refund_application_fee:false to
 * keep the platform fee — both must agree with computeRefund's
 * retainPlatformFee:true caller-side or the books drift.
 */
export async function cancelReservationAction(
  input: CancelReservationInput,
): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();

  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Reason is required." };

  const refundCents = Math.max(0, Math.floor(input.refundCents));

  const reservation = await prisma.reservation.findFirst({
    where: { id: input.reservationId, propertyId: ctx.propertyId },
    include: {
      property: true,
      site: { include: { siteType: true } },
      guest: true,
      payments: true,
    },
  });
  if (!reservation) return { ok: false, error: "Reservation not found." };

  if (
    reservation.status === "CANCELLED" ||
    reservation.status === "DRAFT"
  ) {
    return {
      ok: false,
      error: `Reservation is already ${reservation.status.toLowerCase()}; nothing to cancel.`,
    };
  }

  const remainingRefundable =
    reservation.paidCents - reservation.refundedCents;
  if (refundCents > remainingRefundable) {
    return {
      ok: false,
      error: `Refund amount exceeds remaining refundable (${remainingRefundable} cents).`,
    };
  }

  const stripePayment = reservation.payments.find(
    (p) =>
      p.paymentMethod === "STRIPE" &&
      p.stripePaymentIntentId &&
      p.status === "SUCCEEDED",
  );

  if (refundCents > 0 && !stripePayment) {
    return {
      ok: false,
      error:
        "No successful Stripe payment to refund. Cancel without a refund and return any cash/check payments directly.",
    };
  }

  // Fire the Stripe refund first; if it errors we don't want to mark the
  // reservation cancelled with a phantom refund.
  let stripeRefundId: string | null = null;
  if (refundCents > 0 && stripePayment?.stripePaymentIntentId) {
    try {
      const refund = await getStripe().refunds.create({
        payment_intent: stripePayment.stripePaymentIntentId,
        amount: refundCents,
        reverse_transfer: true,
        refund_application_fee: false,
        metadata: {
          reservationId: reservation.id,
          operatorId: ctx.operator.id,
        },
      });
      stripeRefundId = refund.id;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown Stripe error";
      return {
        ok: false,
        error: `Stripe refund failed: ${message}. Reservation was NOT cancelled.`,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: reason,
        refundedCents: { increment: refundCents },
        heldUntil: null,
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
          notes: stripeRefundId
            ? appendNote(stripePayment.notes, `Refund ${stripeRefundId}`)
            : stripePayment.notes,
        },
      });
    }
  });

  if (input.notifyGuest) {
    const propertyContact = [
      reservation.property.email
        ? `Email: ${reservation.property.email}`
        : null,
      reservation.property.phone
        ? `Phone: ${reservation.property.phone}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const content = renderCancellationEmail({
      guestName: reservation.guest.name,
      confirmationCode: reservation.confirmationCode,
      propertyName: reservation.property.name,
      siteLabel: reservation.site.label,
      siteTypeName: reservation.site.siteType.name,
      checkInDate: reservation.checkIn.toISOString().slice(0, 10),
      checkOutDate: reservation.checkOut.toISOString().slice(0, 10),
      refundCents,
      propertyContact,
      reason,
    });

    const log = await prisma.emailLog.create({
      data: {
        propertyId: reservation.propertyId,
        reservationId: reservation.id,
        type: "CANCELLATION",
        toEmail: reservation.guest.email,
        subject: content.subject,
        status: "QUEUED",
      },
    });

    const send = await sendEmail({
      to: reservation.guest.email,
      subject: content.subject,
      bodyHtml: content.bodyHtml,
      bodyText: content.bodyText,
    });

    await prisma.emailLog.update({
      where: { id: log.id },
      data: send.ok
        ? {
            status: "SENT",
            providerMessageId: send.messageId,
            sentAt: new Date(),
          }
        : { status: "FAILED", errorMessage: send.error },
    });
  }

  revalidatePath(`/admin/reservations/${reservation.id}`);
  revalidatePath("/admin/reservations");

  return { ok: true };
}

function appendNote(prev: string | null, addition: string): string {
  if (!prev) return addition;
  return `${prev}\n${addition}`;
}
