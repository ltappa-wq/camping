import { describe, expect, it } from "vitest";

import {
  planReminders,
  type PropertyReminderConfig,
  type ReservationForReminders,
} from "./reminder-dispatcher";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

const propertyAllOn: PropertyReminderConfig = {
  id: "p1",
  reminder7DaysEnabled: true,
  reminder3DaysEnabled: true,
  reminderArrivalDayEnabled: true,
  reminderPostStayEnabled: true,
};

const propertiesById = (...configs: PropertyReminderConfig[]) =>
  new Map(configs.map((c) => [c.id, c]));

const baseRes = (
  overrides: Partial<ReservationForReminders> = {},
): ReservationForReminders => ({
  id: "r1",
  propertyId: "p1",
  status: "CONFIRMED",
  checkIn: day("2026-06-08"),
  checkOut: day("2026-06-11"),
  ...overrides,
});

describe("planReminders — pre-stay reminders", () => {
  it("queues 7-day reminder exactly 7 days before check-in", () => {
    const result = planReminders({
      today: day("2026-06-01"), // 7 days before 2026-06-08
      reservations: [baseRes()],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(result).toEqual([
      { reservationId: "r1", type: "REMINDER_7_DAYS" },
    ]);
  });

  it("does NOT queue 7-day reminder at 6 or 8 days out", () => {
    const r6 = planReminders({
      today: day("2026-06-02"),
      reservations: [baseRes()],
      propertiesById: propertiesById(propertyAllOn),
    });
    const r8 = planReminders({
      today: day("2026-05-31"),
      reservations: [baseRes()],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(r6.find((x) => x.type === "REMINDER_7_DAYS")).toBeUndefined();
    expect(r8).toEqual([]);
  });

  it("queues 3-day reminder exactly 3 days before check-in", () => {
    const result = planReminders({
      today: day("2026-06-05"),
      reservations: [baseRes()],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(result).toEqual([
      { reservationId: "r1", type: "REMINDER_3_DAYS" },
    ]);
  });

  it("queues arrival-day reminder on check-in date", () => {
    const result = planReminders({
      today: day("2026-06-08"),
      reservations: [baseRes()],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(result).toEqual([
      { reservationId: "r1", type: "REMINDER_ARRIVAL_DAY" },
    ]);
  });
});

describe("planReminders — post-stay thank-you", () => {
  it("queues thank-you exactly 1 day after check-out", () => {
    const result = planReminders({
      today: day("2026-06-12"), // checkOut is 2026-06-11
      reservations: [baseRes({ status: "CHECKED_OUT" })],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(result).toEqual([
      { reservationId: "r1", type: "THANK_YOU_POST_STAY" },
    ]);
  });

  it("queues thank-you even when operator didn't mark CHECKED_OUT", () => {
    // Reality check: many operators leave status as CONFIRMED forever.
    // Don't punish guests by withholding the thank-you.
    const result = planReminders({
      today: day("2026-06-12"),
      reservations: [baseRes({ status: "CONFIRMED" })],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(result).toEqual([
      { reservationId: "r1", type: "THANK_YOU_POST_STAY" },
    ]);
  });

  it("does NOT queue thank-you 2 days after check-out", () => {
    const result = planReminders({
      today: day("2026-06-13"),
      reservations: [baseRes({ status: "CHECKED_OUT" })],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(result).toEqual([]);
  });
});

describe("planReminders — toggle gating", () => {
  it("respects per-property toggles independently", () => {
    const onlyArrivalDay: PropertyReminderConfig = {
      id: "p1",
      reminder7DaysEnabled: false,
      reminder3DaysEnabled: false,
      reminderArrivalDayEnabled: true,
      reminderPostStayEnabled: false,
    };
    const r7 = planReminders({
      today: day("2026-06-01"),
      reservations: [baseRes()],
      propertiesById: propertiesById(onlyArrivalDay),
    });
    expect(r7).toEqual([]);
    const rArrival = planReminders({
      today: day("2026-06-08"),
      reservations: [baseRes()],
      propertiesById: propertiesById(onlyArrivalDay),
    });
    expect(rArrival).toEqual([
      { reservationId: "r1", type: "REMINDER_ARRIVAL_DAY" },
    ]);
  });

  it("emits no reminders when all toggles are off", () => {
    const allOff: PropertyReminderConfig = {
      id: "p1",
      reminder7DaysEnabled: false,
      reminder3DaysEnabled: false,
      reminderArrivalDayEnabled: false,
      reminderPostStayEnabled: false,
    };
    const result = planReminders({
      today: day("2026-06-01"),
      reservations: [
        baseRes(),
        baseRes({
          id: "r2",
          status: "CHECKED_OUT",
          checkIn: day("2026-05-25"),
          checkOut: day("2026-05-31"),
        }),
      ],
      propertiesById: propertiesById(allOff),
    });
    expect(result).toEqual([]);
  });
});

describe("planReminders — status filtering", () => {
  it("skips CANCELLED reservations regardless of date", () => {
    const result = planReminders({
      today: day("2026-06-01"),
      reservations: [baseRes({ status: "CANCELLED" })],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(result).toEqual([]);
  });

  it("skips HELD reservations", () => {
    const result = planReminders({
      today: day("2026-06-01"),
      reservations: [baseRes({ status: "HELD" })],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(result).toEqual([]);
  });

  it("skips DRAFT reservations", () => {
    const result = planReminders({
      today: day("2026-06-01"),
      reservations: [baseRes({ status: "DRAFT" })],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(result).toEqual([]);
  });

  it("skips NO_SHOW reservations", () => {
    const result = planReminders({
      today: day("2026-06-12"),
      reservations: [baseRes({ status: "NO_SHOW" })],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(result).toEqual([]);
  });
});

describe("planReminders — multiple reservations", () => {
  it("emits per-reservation entries; each gets its own type", () => {
    const result = planReminders({
      today: day("2026-06-08"),
      reservations: [
        baseRes({ id: "today", checkIn: day("2026-06-08") }), // arrival
        baseRes({
          id: "in-three",
          checkIn: day("2026-06-11"),
          checkOut: day("2026-06-15"),
        }),
        baseRes({
          id: "in-seven",
          checkIn: day("2026-06-15"),
          checkOut: day("2026-06-18"),
        }),
        baseRes({
          id: "left-yesterday",
          status: "CHECKED_OUT",
          checkIn: day("2026-06-04"),
          checkOut: day("2026-06-07"),
        }),
      ],
      propertiesById: propertiesById(propertyAllOn),
    });
    const byId = new Map(result.map((r) => [r.reservationId, r.type]));
    expect(byId.get("today")).toBe("REMINDER_ARRIVAL_DAY");
    expect(byId.get("in-three")).toBe("REMINDER_3_DAYS");
    expect(byId.get("in-seven")).toBe("REMINDER_7_DAYS");
    expect(byId.get("left-yesterday")).toBe("THANK_YOU_POST_STAY");
  });

  it("skips reservations whose property isn't in propertiesById", () => {
    const result = planReminders({
      today: day("2026-06-01"),
      reservations: [baseRes({ propertyId: "missing" })],
      propertiesById: propertiesById(propertyAllOn),
    });
    expect(result).toEqual([]);
  });
});
