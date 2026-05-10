import { prisma } from "@/lib/prisma";
import {
  formatTotalForEmail,
  renderReminderEmail,
  type ReminderKind,
} from "@/lib/email";
import { dispatchEmail } from "@/lib/email-dispatch";
import { loadEmailTemplateOverride } from "@/lib/email-templates/load";
import {
  planReminders,
  type PropertyReminderConfig,
} from "@/lib/reminder-dispatcher";

const ONE_DAY_MS = 86_400_000;

/**
 * Daily reminder cron at 14:00 UTC (~9am ET / 6am PT). Walks all
 * CONFIRMED+ reservations across all properties whose toggles are on,
 * matches them against the day-distance rules in planReminders, and
 * dispatches one EmailLog row + one Resend send per match.
 *
 * Idempotency: before sending each (reservation, type) pair, the
 * handler checks for an existing EmailLog row of that type for that
 * reservation already created today. If one exists, skip — protects
 * against deploy-timing double-fires.
 *
 * Auth: same Bearer-CRON_SECRET pattern as the hold sweeper.
 *
 * Vercel Cron only fires on Production. The handler still works in
 * any environment if you call it manually with the right header.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET not set; refusing to send reminders");
    return new Response("Cron secret not configured", { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const todayMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // Bound the reservation query so we don't walk the entire table:
  // anything possibly relevant has checkIn within ±10 days of today
  // (covers 7-day pre-stay through 1-day post-stay with margin).
  const windowStart = new Date(todayMidnight.getTime() - 10 * ONE_DAY_MS);
  const windowEnd = new Date(todayMidnight.getTime() + 10 * ONE_DAY_MS);

  const properties = await prisma.property.findMany({
    where: {
      OR: [
        { reminder7DaysEnabled: true },
        { reminder3DaysEnabled: true },
        { reminderArrivalDayEnabled: true },
        { reminderPostStayEnabled: true },
      ],
    },
    select: {
      id: true,
      reminder7DaysEnabled: true,
      reminder3DaysEnabled: true,
      reminderArrivalDayEnabled: true,
      reminderPostStayEnabled: true,
    },
  });
  const propertyIds = properties.map((p) => p.id);
  if (propertyIds.length === 0) {
    return Response.json({ planned: 0, sent: 0, skipped: 0 });
  }

  const propertiesById = new Map<string, PropertyReminderConfig>();
  for (const p of properties) {
    propertiesById.set(p.id, p);
  }

  const reservations = await prisma.reservation.findMany({
    where: {
      propertyId: { in: propertyIds },
      status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
      OR: [
        { checkIn: { gte: windowStart, lte: windowEnd } },
        { checkOut: { gte: windowStart, lte: windowEnd } },
      ],
    },
    select: {
      id: true,
      propertyId: true,
      status: true,
      checkIn: true,
      checkOut: true,
    },
  });

  const planned = planReminders({
    today: todayMidnight,
    reservations,
    propertiesById,
  });

  if (planned.length === 0) {
    return Response.json({ planned: 0, sent: 0, skipped: 0 });
  }

  // Idempotency check: skip any (reservation, type) pair that already
  // has an EmailLog row created today (regardless of status — we don't
  // want to double-send even if the previous attempt failed; operator
  // can resend manually if needed).
  const existing = await prisma.emailLog.findMany({
    where: {
      reservationId: { in: planned.map((p) => p.reservationId) },
      type: {
        in: [
          "REMINDER_7_DAYS",
          "REMINDER_3_DAYS",
          "REMINDER_ARRIVAL_DAY",
          "THANK_YOU_POST_STAY",
        ],
      },
      createdAt: { gte: todayMidnight },
    },
    select: { reservationId: true, type: true },
  });
  const sentToday = new Set(
    existing.map(
      (e) => `${e.reservationId}:${e.type}` as const,
    ),
  );

  // Load full reservation data only for the ones we're actually sending.
  const toSend = planned.filter(
    (p) => !sentToday.has(`${p.reservationId}:${p.type}`),
  );
  if (toSend.length === 0) {
    return Response.json({
      planned: planned.length,
      sent: 0,
      skipped: planned.length,
    });
  }

  const fullReservations = await prisma.reservation.findMany({
    where: { id: { in: toSend.map((p) => p.reservationId) } },
    include: {
      property: true,
      site: { include: { siteType: true } },
      guest: true,
    },
  });
  const fullById = new Map(fullReservations.map((r) => [r.id, r]));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Send sequentially within each reservation/type pair. Doing
  // Promise.allSettled across all of them is fine for Monument-Point
  // scale (handful of sends per day) and avoids hammering Resend with
  // thousands of parallel requests in a hypothetical large property.
  const dispatches: Promise<unknown>[] = [];
  let sentCount = 0;

  for (const item of toSend) {
    const r = fullById.get(item.reservationId);
    if (!r) continue;
    const nights = Math.round(
      (r.checkOut.getTime() - r.checkIn.getTime()) / ONE_DAY_MS,
    );
    const propertyContact = [
      r.property.email ? `Email: ${r.property.email}` : null,
      r.property.phone ? `Phone: ${r.property.phone}` : null,
      [r.property.addressLine1, r.property.addressLine2, r.property.city]
        .filter(Boolean)
        .join(", ") || null,
    ]
      .filter(Boolean)
      .join("\n");

    const reminderOverride = await loadEmailTemplateOverride(
      r.propertyId,
      item.type,
    );
    const content = renderReminderEmail(
      item.type as ReminderKind,
      {
        guestName: r.guest.name,
        propertyName: r.property.name,
        confirmationCode: r.confirmationCode,
        siteLabel: r.site.label,
        siteTypeName: r.site.siteType.name,
        checkInDate: r.checkIn.toISOString().slice(0, 10),
        checkOutDate: r.checkOut.toISOString().slice(0, 10),
        checkInTime: r.property.checkInTime,
        checkOutTime: r.property.checkOutTime,
        nights,
        totalCents: r.totalCents,
        checkInInstructions: r.property.checkInInstructions ?? "",
        propertyContact,
        manageUrl: `${appUrl}/p/${r.property.slug}/booking/${r.confirmationCode}`,
        mapImageUrl: r.property.mapImageUrl ?? "",
      },
      reminderOverride,
    );

    dispatches.push(
      dispatchEmail({
        propertyId: r.propertyId,
        reservationId: r.id,
        type: item.type,
        to: r.guest.email,
        content,
      }).then(() => {
        sentCount++;
      }),
    );
  }

  await Promise.allSettled(dispatches);

  return Response.json({
    planned: planned.length,
    sent: sentCount,
    skipped: planned.length - toSend.length,
  });
}
