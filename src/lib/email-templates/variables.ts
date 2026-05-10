// Per-template metadata for the operator-facing template editor:
// the variable list each template type supports, a human label and a
// short description for the list view, plus a sample variable bag the
// preview pane uses to render a representative email.

import type { EmailTemplateType } from "@prisma/client";

/**
 * The subset of EmailTemplateType operators can customize. Operator-internal
 * notifications (OPERATOR_BOOKING_NOTIFICATION, MODIFICATION_OPERATOR) and
 * helpers we don't surface (ARRIVAL_REMINDER, BALANCE_DUE) stay hardcoded.
 */
export const CUSTOMIZABLE_TEMPLATE_TYPES = [
  "RESERVATION_CONFIRMATION",
  "CANCELLATION",
  "GUEST_PROFILE_CLAIM",
  "REMINDER_7_DAYS",
  "REMINDER_3_DAYS",
  "REMINDER_ARRIVAL_DAY",
  "THANK_YOU_POST_STAY",
  "MODIFICATION_GUEST",
] as const satisfies readonly EmailTemplateType[];

export type CustomizableTemplateType =
  (typeof CUSTOMIZABLE_TEMPLATE_TYPES)[number];

export function isCustomizableType(
  type: string,
): type is CustomizableTemplateType {
  return (CUSTOMIZABLE_TEMPLATE_TYPES as readonly string[]).includes(type);
}

export const TEMPLATE_LABELS: Record<CustomizableTemplateType, string> = {
  RESERVATION_CONFIRMATION: "Reservation confirmation",
  CANCELLATION: "Cancellation notice",
  GUEST_PROFILE_CLAIM: "Guest sign-in / profile claim",
  REMINDER_7_DAYS: "Reminder — 7 days before arrival",
  REMINDER_3_DAYS: "Reminder — 3 days before arrival",
  REMINDER_ARRIVAL_DAY: "Reminder — arrival day",
  THANK_YOU_POST_STAY: "Thank-you (post-stay)",
  MODIFICATION_GUEST: "Booking modification confirmation",
};

export const TEMPLATE_DESCRIPTIONS: Record<CustomizableTemplateType, string> = {
  RESERVATION_CONFIRMATION:
    "Sent right after a guest's booking confirms. The most-read message a guest gets from you.",
  CANCELLATION:
    "Sent when a reservation is cancelled (by you or by the guest). Includes refund details when applicable.",
  GUEST_PROFILE_CLAIM:
    "Sent when a guest follows a sign-in or profile-claim link. Used for both first-time profile creation and returning sign-ins.",
  REMINDER_7_DAYS: "Sent automatically a week before arrival.",
  REMINDER_3_DAYS: "Sent automatically three days before arrival.",
  REMINDER_ARRIVAL_DAY:
    "Sent the morning of check-in. Best place to put gate codes and last-minute instructions.",
  THANK_YOU_POST_STAY: "Sent the day after check-out.",
  MODIFICATION_GUEST:
    "Sent after a guest changes their reservation (date, site, etc.). Includes refund or upcharge details.",
};

// Common vars that show up in most stay-related templates.
const STAY_VARS = [
  "guestName",
  "confirmationCode",
  "propertyName",
  "siteLabel",
  "siteType",
  "checkInDate",
  "checkOutDate",
  "checkInTime",
  "checkOutTime",
  "nights",
  "totalAmount",
  "propertyPhone",
  "propertyEmail",
  "propertyAddress",
  "manageBookingUrl",
] as const;

export const TEMPLATE_VARIABLES: Record<
  CustomizableTemplateType,
  readonly string[]
> = {
  RESERVATION_CONFIRMATION: [
    ...STAY_VARS,
    "cancellationPolicySummary",
    "mapImageUrl",
    "directionsText",
  ],
  CANCELLATION: [
    "guestName",
    "confirmationCode",
    "propertyName",
    "siteLabel",
    "siteType",
    "checkInDate",
    "checkOutDate",
    "refundAmount",
    "cancellationReason",
    "propertyPhone",
    "propertyEmail",
  ],
  GUEST_PROFILE_CLAIM: [
    "propertyName",
    "intentLabel",
    "intro",
    "magicLink",
    "expiresIn",
  ],
  REMINDER_7_DAYS: [...STAY_VARS, "checkInInstructions", "mapImageUrl"],
  REMINDER_3_DAYS: [...STAY_VARS, "checkInInstructions", "mapImageUrl"],
  REMINDER_ARRIVAL_DAY: [...STAY_VARS, "checkInInstructions", "mapImageUrl"],
  THANK_YOU_POST_STAY: [
    "guestName",
    "propertyName",
    "confirmationCode",
    "siteLabel",
    "checkInDate",
    "checkOutDate",
    "manageBookingUrl",
  ],
  MODIFICATION_GUEST: [
    "guestName",
    "propertyName",
    "confirmationCode",
    "oldSiteLabel",
    "oldCheckIn",
    "oldCheckOut",
    "oldNights",
    "oldTotal",
    "newSiteLabel",
    "newCheckIn",
    "newCheckOut",
    "newNights",
    "newTotal",
    "refundAmount",
    "upchargeAmount",
    "moneyLine",
    "propertyPhone",
    "propertyEmail",
  ],
};

/**
 * Sample data the preview pane substitutes into the operator's draft so
 * they can see what guests will read. Generic enough to make sense for
 * any property — operators recognize it as a placeholder, not their data.
 */
export function getSampleVars(
  type: CustomizableTemplateType,
): Record<string, string> {
  const common = {
    guestName: "Sam Rivera",
    propertyName: "Monument Point Camping",
    confirmationCode: "MP-A8KQ2",
    siteLabel: "12",
    siteType: "Wooded Electric",
    checkInDate: "2026-07-04",
    checkOutDate: "2026-07-07",
    checkInTime: "14:00",
    checkOutTime: "11:00",
    nights: "3",
    totalAmount: "$135.00",
    propertyPhone: "(920) 555-0142",
    propertyEmail: "hello@monumentpointcamping.com",
    propertyAddress: "1 Lighthouse Rd, Ellison Bay, WI 54210",
    manageBookingUrl:
      "https://example.com/p/monument-point/portal/r/MP-A8KQ2",
    mapImageUrl: "https://example.com/property-map.png",
    directionsText:
      "Take Hwy 42 north to Ellison Bay. Turn right on Lighthouse Rd; office is on the left.",
    cancellationPolicySummary:
      "Free cancellation up to 14 days before arrival. 50% refund 7–14 days before. No refund within 7 days.",
    checkInInstructions:
      "Office closes at 8pm. After-hours arrivals: gate code 7421; envelope on the office door has your site map.",
  };
  switch (type) {
    case "RESERVATION_CONFIRMATION":
      return common;
    case "CANCELLATION":
      return {
        ...common,
        refundAmount: "$90.00",
        cancellationReason: "Family emergency.",
      };
    case "GUEST_PROFILE_CLAIM":
      return {
        propertyName: common.propertyName,
        intentLabel: "Save your booking for next time",
        intro:
          "Click the link below to save your details so future bookings auto-fill.",
        magicLink:
          "https://example.com/p/monument-point/portal/claim?token=sample",
        expiresIn: "30 days",
      };
    case "REMINDER_7_DAYS":
    case "REMINDER_3_DAYS":
    case "REMINDER_ARRIVAL_DAY":
      return common;
    case "THANK_YOU_POST_STAY":
      return common;
    case "MODIFICATION_GUEST":
      return {
        ...common,
        oldSiteLabel: "12",
        oldCheckIn: "2026-07-04",
        oldCheckOut: "2026-07-06",
        oldNights: "2",
        oldTotal: "$90.00",
        newSiteLabel: "12",
        newCheckIn: "2026-07-04",
        newCheckOut: "2026-07-07",
        newNights: "3",
        newTotal: "$135.00",
        refundAmount: "$0.00",
        upchargeAmount: "$45.00",
        moneyLine: "Your additional charge of $45.00 has been processed.",
      };
  }
}
