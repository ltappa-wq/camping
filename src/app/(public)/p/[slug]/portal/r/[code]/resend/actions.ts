"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireGuestSession } from "@/lib/guest-auth";
import {
  buildGuestPortalSection,
  formatTotalForEmail,
  renderEmail,
} from "@/lib/email";
import { dispatchEmail } from "@/lib/email-dispatch";
import { issueGuestProfileClaimLink } from "@/lib/guest-magic-link";

const ONE_DAY_MS = 86_400_000;

export type ResendResult = { ok: true } | { ok: false; error: string };

/**
 * Guest-side "re-send confirmation" — re-fires the same email the guest
 * received at booking time. Useful when they can't find the original.
 *
 * Mirrors the operator's resendConfirmationAction (Phase 4) but auths
 * via guest session and scopes to the guest's own reservations. Both
 * actions go through the same renderEmail + dispatchEmail path so the
 * email content is identical regardless of who pressed the button.
 *
 * Refuses for non-confirmed states — sending a "you're booked!" email
 * for a CANCELLED reservation would be confusing.
 */
export async function resendGuestConfirmationAction(
  slug: string,
  code: string,
): Promise<ResendResult> {
  const session = await requireGuestSession(slug);

  const reservation = await prisma.reservation.findFirst({
    where: {
      confirmationCode: code,
      guestId: session.guestId,
      propertyId: session.propertyId,
    },
    include: {
      property: true,
      site: { include: { siteType: true } },
      guest: {
        select: { email: true, name: true, profileClaimedAt: true },
      },
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
      error: "This reservation isn't in a state where a confirmation can be resent.",
    };
  }

  const checkInDate = reservation.checkIn.toISOString().slice(0, 10);
  const checkOutDate = reservation.checkOut.toISOString().slice(0, 10);
  const nights = Math.round(
    (reservation.checkOut.getTime() - reservation.checkIn.getTime()) /
      ONE_DAY_MS,
  );

  const override = await prisma.emailTemplate.findUnique({
    where: {
      propertyId_type: {
        propertyId: reservation.propertyId,
        type: "RESERVATION_CONFIRMATION",
      },
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // Reuse the same portal section — the guest is signed in already so
  // we link them to /portal/r/[code] directly rather than minting a
  // fresh claim token.
  const portalSection = buildGuestPortalSection({
    appUrl,
    slug: reservation.property.slug,
    code: reservation.confirmationCode,
    alreadyClaimed: true,
  });
  // Defensive: in the rare case profileClaimedAt is null but the guest
  // is somehow signed in via a session created earlier, mint a claim
  // token anyway so the email link works for anyone who opens it.
  const portalSectionForUnclaimed = reservation.guest.profileClaimedAt
    ? portalSection
    : await (async () => {
        const claim = await issueGuestProfileClaimLink({
          propertyId: reservation.propertyId,
          email: reservation.guest.email,
        });
        return buildGuestPortalSection({
          appUrl,
          slug: reservation.property.slug,
          code: reservation.confirmationCode,
          alreadyClaimed: false,
          claimToken: claim.token,
        });
      })();

  const content = renderEmail(
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
      manageUrl: `${appUrl}/p/${reservation.property.slug}/booking/${reservation.confirmationCode}`,
      portalSectionText: portalSectionForUnclaimed.text,
      portalSectionHtml: portalSectionForUnclaimed.html,
    },
    override && override.active ? override : null,
  );

  const send = await dispatchEmail({
    propertyId: reservation.propertyId,
    reservationId: reservation.id,
    type: "RESERVATION_CONFIRMATION",
    to: reservation.guest.email,
    content,
  });

  revalidatePath(`/p/${slug}/portal/r/${code}`);

  if (!send.ok) {
    return {
      ok: false,
      error: `Couldn't send: ${send.error}. Please try again or contact the property.`,
    };
  }
  return { ok: true };
}
