// Pure logic for the daily reminder cron. Given today's date, a list of
// reservations, and the per-property toggle config, returns the list of
// (reservationId, emailType) pairs that should fire today.
//
// Idempotency (skip-if-already-sent) lives in the cron route — that
// requires DB access against EmailLog. This module just plans the
// candidates.

import type { ReservationStatus } from "@prisma/client";

const ONE_DAY_MS = 86_400_000;

export type ReminderType =
  | "REMINDER_7_DAYS"
  | "REMINDER_3_DAYS"
  | "REMINDER_ARRIVAL_DAY"
  | "THANK_YOU_POST_STAY";

export type ReservationForReminders = {
  id: string;
  propertyId: string;
  status: ReservationStatus;
  /** Date-only midnight UTC. */
  checkIn: Date;
  /** Date-only midnight UTC. */
  checkOut: Date;
};

export type PropertyReminderConfig = {
  id: string;
  reminder7DaysEnabled: boolean;
  reminder3DaysEnabled: boolean;
  reminderArrivalDayEnabled: boolean;
  reminderPostStayEnabled: boolean;
};

export type ReminderToSend = {
  reservationId: string;
  type: ReminderType;
};

export type PlanRemindersInput = {
  /** Today, midnight UTC. */
  today: Date;
  reservations: ReadonlyArray<ReservationForReminders>;
  propertiesById: Map<string, PropertyReminderConfig>;
};

/**
 * Walk reservations, classify by day-distance from today, and emit one
 * ReminderToSend per match. The same reservation can match multiple
 * types in pathological data (e.g., a 1-night stay sends arrival-day
 * one day, post-stay the next), but never two on the same day.
 *
 * Status filter: only CONFIRMED, CHECKED_IN, CHECKED_OUT trigger
 * reminders. CANCELLED and DRAFT obviously don't; HELD is mid-payment-
 * flow; NO_SHOW already happened — no point reminding.
 *
 * The 7/3/arrival reminders fire on CONFIRMED + CHECKED_IN. The post-
 * stay thank-you fires on CHECKED_OUT (or CONFIRMED if the operator
 * never marked check-in/out — hospitality reality, not every operator
 * keeps the status accurate post-stay).
 */
export function planReminders(input: PlanRemindersInput): ReminderToSend[] {
  const out: ReminderToSend[] = [];
  const todayMs = input.today.getTime();

  for (const r of input.reservations) {
    const property = input.propertiesById.get(r.propertyId);
    if (!property) continue;

    if (
      r.status === "CANCELLED" ||
      r.status === "DRAFT" ||
      r.status === "HELD" ||
      r.status === "NO_SHOW"
    ) {
      continue;
    }

    const daysUntilCheckIn = Math.round(
      (r.checkIn.getTime() - todayMs) / ONE_DAY_MS,
    );
    const daysSinceCheckOut = Math.round(
      (todayMs - r.checkOut.getTime()) / ONE_DAY_MS,
    );

    // Pre-stay reminders only meaningful for stays that haven't
    // happened yet (in CONFIRMED) or just kicked off (CHECKED_IN).
    if (r.status === "CONFIRMED" || r.status === "CHECKED_IN") {
      if (property.reminder7DaysEnabled && daysUntilCheckIn === 7) {
        out.push({ reservationId: r.id, type: "REMINDER_7_DAYS" });
      }
      if (property.reminder3DaysEnabled && daysUntilCheckIn === 3) {
        out.push({ reservationId: r.id, type: "REMINDER_3_DAYS" });
      }
      if (property.reminderArrivalDayEnabled && daysUntilCheckIn === 0) {
        out.push({ reservationId: r.id, type: "REMINDER_ARRIVAL_DAY" });
      }
    }

    // Post-stay thank-you fires the day after checkout, regardless of
    // whether the operator updated status to CHECKED_OUT — operators
    // sometimes forget, and we don't want guests left without thanks.
    if (property.reminderPostStayEnabled && daysSinceCheckOut === 1) {
      out.push({ reservationId: r.id, type: "THANK_YOU_POST_STAY" });
    }
  }

  return out;
}
