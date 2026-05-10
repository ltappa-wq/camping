import { FROM_EMAIL, getResend } from "./resend";
import { formatCents } from "./money";
import {
  fill,
  renderEmailTemplate,
  textToHtml,
  type EmailContent,
  type TemplateOverride,
} from "./email-templates/render";
import { TEMPLATE_DEFAULTS } from "./email-templates/defaults";

// Email rendering + send. Each operator-customizable renderer accepts an
// optional `override` (loaded by callers via loadEmailTemplateOverride);
// when present, it wins over the hardcoded default. The default-path
// rendering keeps its rich structured layout (tables, links). The
// override path uses the operator's plain-text body and auto-derives the
// HTML so they don't have to write any markup.

export type { EmailContent, TemplateOverride };

export type EmailVars = {
  guestName: string;
  confirmationCode: string;
  propertyName: string;
  siteLabel: string;
  siteTypeName: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string;
  checkInTime: string;
  checkOutTime: string;
  nights: number;
  totalFormatted: string;
  totalCents: number;
  /** Public-facing URL the guest can revisit to see their booking
   *  (state machine identical to the post-checkout page). */
  manageUrl: string;
  /** Phase 5 portal section, pre-rendered to text. Empty string when
   *  there's nothing to show (e.g. claimed-guest with no working URL). */
  portalSectionText: string;
  portalSectionHtml: string;
};

function reservationConfirmationBag(vars: EmailVars): Record<string, string> {
  return {
    guestName: vars.guestName,
    confirmationCode: vars.confirmationCode,
    propertyName: vars.propertyName,
    siteLabel: vars.siteLabel,
    // Operator-facing variable name from the template editor is `siteType`;
    // alias to siteTypeName so existing internal callers stay typed.
    siteType: vars.siteTypeName,
    siteTypeName: vars.siteTypeName,
    checkInDate: vars.checkInDate,
    checkOutDate: vars.checkOutDate,
    checkInTime: vars.checkInTime,
    checkOutTime: vars.checkOutTime,
    nights: String(vars.nights),
    totalFormatted: vars.totalFormatted,
    totalAmount: vars.totalFormatted,
    totalCents: String(vars.totalCents),
    manageUrl: vars.manageUrl,
    manageBookingUrl: vars.manageUrl,
    portalSectionText: vars.portalSectionText,
    portalSectionHtml: vars.portalSectionHtml,
  };
}

/**
 * Render the reservation confirmation email. Pass an override (loaded
 * from the operator's EmailTemplate row) to honor operator customizations;
 * pass null/undefined to use the system default.
 */
export function renderEmail(
  _type: "RESERVATION_CONFIRMATION",
  vars: EmailVars,
  override?: TemplateOverride | null,
): EmailContent {
  return renderEmailTemplate(
    "RESERVATION_CONFIRMATION",
    reservationConfirmationBag(vars),
    override,
  );
}

/** Send an email via Resend; returns the provider message ID on success.
 *
 * `from` defaults to the platform fallback (RESEND_FROM_EMAIL) so callers
 * that don't have a property context still work; production callers always
 * route through dispatchEmail() which selects the verified-domain address
 * via fromAddressForProperty(). `replyTo` is optional — set when the
 * property has a contact email so guest replies land in the operator's
 * inbox instead of bouncing.
 */
export async function sendEmail(args: {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  from?: string;
  replyTo?: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const result = await getResend().emails.send({
      from: args.from ?? FROM_EMAIL,
      to: args.to,
      subject: args.subject,
      html: args.bodyHtml,
      text: args.bodyText,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, messageId: result.data?.id ?? "" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
}

/** Convenience: format a cents total into the variable-ready string. */
export function formatTotalForEmail(totalCents: number): string {
  return formatCents(totalCents);
}

/**
 * Build the portal section that goes into the guest confirmation
 * email. Two flavors:
 *   - Unclaimed guest: "Save your info for next time" + a 30-day
 *     magic-link to /portal/claim?token=…. Clicking signs them in
 *     and stamps profileClaimedAt.
 *   - Claimed guest: just a "View your booking online" link to
 *     /portal/r/[code]. They'll be sign-in-prompted if their session
 *     expired.
 *
 * Caller is responsible for issuing the magic-link token (when
 * needed) and passing it in. Pure rendering helper — no DB writes.
 */
export function buildGuestPortalSection(args: {
  appUrl: string;
  slug: string;
  code: string;
  alreadyClaimed: boolean;
  /** Required when alreadyClaimed is false. */
  claimToken?: string;
}): { text: string; html: string } {
  if (args.alreadyClaimed) {
    const url = `${args.appUrl}/p/${args.slug}/portal/r/${args.code}`;
    return {
      text: `View your booking online: ${url}`,
      html: `<p><a href="${escapeHtml(url)}">View your booking online</a></p>`,
    };
  }

  if (!args.claimToken) {
    // Defensive — shouldn't happen, but better to render nothing than a
    // half-built link.
    return { text: "", html: "" };
  }

  const url = `${args.appUrl}/p/${args.slug}/portal/claim?token=${encodeURIComponent(args.claimToken)}`;
  return {
    text: `Save your info for next time: ${url}\nClick the link to view your booking online and check in faster on future trips. The link is good for 30 days.`,
    html: `<p style="margin-top:16px"><strong>Save your info for next time</strong></p>
<p><a href="${escapeHtml(url)}">View your booking online</a> — click to save your details so future bookings auto-fill. Good for 30 days.</p>`,
  };
}

export type GuestMagicLinkVars = {
  propertyName: string;
  /** "Sign in to view your booking" vs. "Save your booking for next time" — caller picks. */
  intentLabel: string;
  /** One-paragraph context line shown below the headline. */
  intro: string;
  /** Fully-qualified URL the guest clicks to sign in. */
  link: string;
  /** Human-readable expiry, e.g. "1 hour" or "30 days". */
  expiresIn: string;
};

/**
 * Renders the guest sign-in / profile-claim email. One template covers
 * both flows — the difference is the intent label and intro paragraph.
 * Operators can override per-property; default mirrors the legacy markup.
 */
export function renderGuestMagicLinkEmail(
  v: GuestMagicLinkVars,
  override?: TemplateOverride | null,
): EmailContent {
  return renderEmailTemplate(
    "GUEST_PROFILE_CLAIM",
    {
      propertyName: v.propertyName,
      intentLabel: v.intentLabel,
      intro: v.intro,
      magicLink: v.link,
      // Legacy alias for any old templates that referenced `link`.
      link: v.link,
      expiresIn: v.expiresIn,
    },
    override,
  );
}

export type ModificationGuestVars = {
  guestName: string;
  propertyName: string;
  confirmationCode: string;
  oldSiteLabel: string;
  oldCheckIn: string; // YYYY-MM-DD
  oldCheckOut: string;
  oldNights: number;
  oldTotalCents: number;
  newSiteLabel: string;
  newCheckIn: string;
  newCheckOut: string;
  newNights: number;
  newTotalCents: number;
  refundCents: number;
  upchargeCents: number;
  /** Pre-formatted property contact lines, "" when none. */
  propertyContact: string;
};

/**
 * Render the guest-facing modification confirmation email. Covers all
 * three branches — refund, upcharge, and equal — by computing a
 * `moneyLine` variable and substituting it into the template.
 *
 * The default markup gets the rich tabled layout from defaults.ts; an
 * operator override gets the same vars in plain text.
 */
export function renderModificationGuestEmail(
  v: ModificationGuestVars,
  override?: TemplateOverride | null,
): EmailContent {
  const moneyLine =
    v.refundCents > 0
      ? `A refund of ${formatCents(v.refundCents)} is on its way back to your card. Refunds typically take 5–10 business days.`
      : v.upchargeCents > 0
        ? `Your additional charge of ${formatCents(v.upchargeCents)} has been processed.`
        : "No money changed hands for this update.";

  const contactSuffix = v.propertyContact
    ? ` or reach the property:\n\n${v.propertyContact}`
    : ".";
  const contactSuffixHtml = v.propertyContact
    ? `<br><br>${escapeHtml(v.propertyContact).replace(/\n/g, "<br>")}`
    : ".";

  return renderEmailTemplate(
    "MODIFICATION_GUEST",
    {
      guestName: v.guestName,
      propertyName: v.propertyName,
      confirmationCode: v.confirmationCode,
      oldSiteLabel: v.oldSiteLabel,
      oldCheckIn: v.oldCheckIn,
      oldCheckOut: v.oldCheckOut,
      oldNights: String(v.oldNights),
      oldTotal: formatCents(v.oldTotalCents),
      newSiteLabel: v.newSiteLabel,
      newCheckIn: v.newCheckIn,
      newCheckOut: v.newCheckOut,
      newNights: String(v.newNights),
      newTotal: formatCents(v.newTotalCents),
      refundAmount: v.refundCents > 0 ? formatCents(v.refundCents) : "",
      upchargeAmount: v.upchargeCents > 0 ? formatCents(v.upchargeCents) : "",
      moneyLine,
      contactSuffix,
      contactSuffixHtml,
      propertyContact: v.propertyContact,
    },
    override,
  );
}

export type ModificationOperatorVars = {
  propertyName: string;
  confirmationCode: string;
  guestName: string;
  guestEmail: string;
  oldSiteLabel: string;
  oldCheckIn: string;
  oldCheckOut: string;
  oldTotalCents: number;
  newSiteLabel: string;
  newCheckIn: string;
  newCheckOut: string;
  newTotalCents: number;
  refundCents: number;
  upchargeCents: number;
  appUrl: string;
  reservationId: string;
};

export function renderModificationOperatorEmail(
  v: ModificationOperatorVars,
): EmailContent {
  const moneyLine =
    v.refundCents > 0
      ? `Refund issued: ${formatCents(v.refundCents)} (per cancellation policy applied per removed night)`
      : v.upchargeCents > 0
        ? `Upcharge collected: ${formatCents(v.upchargeCents)}`
        : "No money changed hands.";

  const bodyText = `Guest modification at ${v.propertyName}.

  Confirmation: ${v.confirmationCode}
  Guest: ${v.guestName} (${v.guestEmail})

  Was:  Site ${v.oldSiteLabel} · ${v.oldCheckIn} → ${v.oldCheckOut} · ${formatCents(v.oldTotalCents)}
  Now:  Site ${v.newSiteLabel} · ${v.newCheckIn} → ${v.newCheckOut} · ${formatCents(v.newTotalCents)}

${moneyLine}

View: ${v.appUrl}/admin/reservations/${v.reservationId}`;

  const bodyHtml = `<pre style="font-family: ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; margin: 0;">${escapeHtml(bodyText)}</pre>`;

  return {
    subject: `Guest modified: ${v.guestName} — ${v.confirmationCode}`,
    bodyHtml,
    bodyText,
  };
}

export type ReminderEmailVars = {
  guestName: string;
  propertyName: string;
  confirmationCode: string;
  siteLabel: string;
  siteTypeName: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string;
  checkInTime: string;
  checkOutTime: string;
  nights: number;
  totalCents: number;
  /** Operator-supplied check-in instructions; empty string = none. */
  checkInInstructions: string;
  /** Pre-formatted property contact lines, "" when none. */
  propertyContact: string;
  /** Public URL the guest can revisit (matches manageUrl on the
   *  confirmation email). */
  manageUrl: string;
  /** Optional map link (URL only — emails don't embed images well). */
  mapImageUrl: string;
};

export type ReminderKind =
  | "REMINDER_7_DAYS"
  | "REMINDER_3_DAYS"
  | "REMINDER_ARRIVAL_DAY"
  | "THANK_YOU_POST_STAY";

const REMINDER_HEADLINES: Record<ReminderKind, string> = {
  REMINDER_7_DAYS: "Your stay is one week away",
  REMINDER_3_DAYS: "Three days until your stay",
  REMINDER_ARRIVAL_DAY: "Welcome — we're ready for you today",
  THANK_YOU_POST_STAY: "Thanks for staying with us",
};

const REMINDER_INTROS: Record<ReminderKind, string> = {
  REMINDER_7_DAYS:
    "Just a heads-up that your visit is coming up next week. Here's what to expect when you arrive.",
  REMINDER_3_DAYS:
    "We're getting ready for your visit. Here are the practical details for check-in.",
  REMINDER_ARRIVAL_DAY:
    "Today's the day. Here's everything you need for a smooth arrival.",
  THANK_YOU_POST_STAY:
    "We hope you had a great stay. Thanks for choosing us — we'd love to see you back.",
};

/**
 * Render one of the four scheduled reminder emails. Pure — caller
 * decides which ReminderKind to render based on the dispatcher output.
 *
 * `headline` and `intro` come from the kind; the conditional block
 * variables (instructions / map / manage / contact) get rendered as
 * pre-formatted text/HTML snippets so the default template just splices
 * them in without conditionals. Operator overrides reference any of the
 * documented vars they care about.
 */
export function renderReminderEmail(
  kind: ReminderKind,
  v: ReminderEmailVars,
  override?: TemplateOverride | null,
): EmailContent {
  const headline = REMINDER_HEADLINES[kind];
  const intro = REMINDER_INTROS[kind];

  const showInstructions =
    kind !== "THANK_YOU_POST_STAY" && v.checkInInstructions.length > 0;

  const instructionsBlock = showInstructions
    ? `\n\nCheck-in instructions:\n${v.checkInInstructions}`
    : "";
  const instructionsHtml = showInstructions
    ? `<p><strong>Check-in instructions:</strong></p><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(v.checkInInstructions)}</pre>`
    : "";

  const mapBlock = v.mapImageUrl ? `\n\nCampground map: ${v.mapImageUrl}` : "";
  const mapHtml = v.mapImageUrl
    ? `<p><a href="${escapeHtml(v.mapImageUrl)}">View campground map</a></p>`
    : "";

  const manageBlock = v.manageUrl
    ? `\n\nView your booking: ${v.manageUrl}`
    : "";
  const manageHtml = v.manageUrl
    ? `<p><a href="${escapeHtml(v.manageUrl)}">View your booking</a></p>`
    : "";

  const contactBlock = v.propertyContact ? `\n\n${v.propertyContact}` : "";
  const contactHtml = v.propertyContact
    ? `<p>${escapeHtml(v.propertyContact).replace(/\n/g, "<br>")}</p>`
    : "";

  const bag: Record<string, string> = {
    headline,
    intro,
    guestName: v.guestName,
    propertyName: v.propertyName,
    confirmationCode: v.confirmationCode,
    siteLabel: v.siteLabel,
    siteType: v.siteTypeName,
    siteTypeName: v.siteTypeName,
    checkInDate: v.checkInDate,
    checkOutDate: v.checkOutDate,
    checkInTime: v.checkInTime,
    checkOutTime: v.checkOutTime,
    nights: String(v.nights),
    totalAmount: formatCents(v.totalCents),
    checkInInstructions: v.checkInInstructions,
    mapImageUrl: v.mapImageUrl,
    manageBookingUrl: v.manageUrl,
    propertyContact: v.propertyContact,
    instructionsBlock,
    instructionsHtml,
    mapBlock,
    mapHtml,
    manageBlock,
    manageHtml,
    contactBlock,
    contactHtml,
  };

  return renderEmailTemplate(kind, bag, override);
}

export type CancellationEmailVars = {
  guestName: string;
  confirmationCode: string;
  propertyName: string;
  siteLabel: string;
  siteTypeName: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string;
  /** 0 if no refund issued. */
  refundCents: number;
  /** Property contact lines (email/phone), already formatted; empty if none. */
  propertyContact: string;
  reason: string | null;
};

/**
 * Renders the cancellation email sent to the guest after their reservation
 * is cancelled (operator- or guest-initiated). The "5–10 business days"
 * line covers Stripe's typical refund timing. Operators can override.
 */
export function renderCancellationEmail(
  v: CancellationEmailVars,
  override?: TemplateOverride | null,
): EmailContent {
  const refundLine =
    v.refundCents > 0
      ? `A refund of ${formatCents(v.refundCents)} is on its way back to your card. Refunds typically take 5–10 business days to appear on your statement.`
      : `No refund will be issued per the cancellation policy in effect at the time of booking.`;

  const cancellationReasonLine = v.reason
    ? `\nNote from the operator: ${v.reason}\n`
    : "";
  const cancellationReasonHtml = v.reason
    ? `<p><em>Note from the operator:</em> ${escapeHtml(v.reason)}</p>`
    : "";

  const contactSuffix = v.propertyContact
    ? ` or reach the property directly:\n\n${v.propertyContact}`
    : ".";
  const contactSuffixHtml = v.propertyContact
    ? `<br><br>${escapeHtml(v.propertyContact).replace(/\n/g, "<br>")}`
    : ".";

  return renderEmailTemplate(
    "CANCELLATION",
    {
      guestName: v.guestName,
      confirmationCode: v.confirmationCode,
      propertyName: v.propertyName,
      siteLabel: v.siteLabel,
      siteType: v.siteTypeName,
      siteTypeName: v.siteTypeName,
      checkInDate: v.checkInDate,
      checkOutDate: v.checkOutDate,
      refundAmount: v.refundCents > 0 ? formatCents(v.refundCents) : "",
      refundLine,
      cancellationReason: v.reason ?? "",
      cancellationReasonLine,
      cancellationReasonHtml,
      propertyContact: v.propertyContact,
      contactSuffix,
      contactSuffixHtml,
    },
    override,
  );
}

export type OperatorBookingNotificationVars = {
  propertyName: string;
  confirmationCode: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  rvInfo: string | null;
  guestNotes: string | null;
  siteLabel: string;
  siteTypeName: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string;
  nights: number;
  totalCents: number;
  payoutCents: number;
  adminUrl: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Re-export for callers that need to reach the rendering primitives.
export { fill, textToHtml, renderEmailTemplate, TEMPLATE_DEFAULTS };

/**
 * Internal notification sent to the operator when a booking confirms. Plain
 * text is the source of truth; the HTML body is the same content wrapped in
 * a monospace block so layout is preserved in clients that prefer HTML.
 *
 * Operators cannot customize this template (no EmailTemplate override); it's
 * an internal alert, not a guest-facing message.
 */
export function renderOperatorBookingNotification(
  v: OperatorBookingNotificationVars,
): EmailContent {
  const lines: string[] = [
    `New booking received at ${v.propertyName}.`,
    "",
    `Confirmation: ${v.confirmationCode}`,
    `Site: ${v.siteLabel} (${v.siteTypeName})`,
    `Dates: ${v.checkInDate} → ${v.checkOutDate} (${v.nights} night${
      v.nights === 1 ? "" : "s"
    })`,
    "",
    `Guest: ${v.guestName}`,
    `Email: ${v.guestEmail}`,
  ];
  if (v.guestPhone) lines.push(`Phone: ${v.guestPhone}`);
  if (v.rvInfo) {
    lines.push("", `RV: ${v.rvInfo}`);
  }
  if (v.guestNotes) {
    lines.push("", "Note from guest:", v.guestNotes);
  }
  lines.push(
    "",
    `Total charged: ${formatCents(v.totalCents)}`,
    `Your payout: ${formatCents(v.payoutCents)}`,
    "",
    `Manage: ${v.adminUrl}`,
  );
  const bodyText = lines.join("\n");
  const bodyHtml = `<pre style="font-family: ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; margin: 0;">${escapeHtml(
    bodyText,
  )}</pre>`;
  return {
    subject: `New booking: ${v.guestName} — ${v.checkInDate} → ${v.checkOutDate}`,
    bodyHtml,
    bodyText,
  };
}
