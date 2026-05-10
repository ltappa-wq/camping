import { FROM_EMAIL, getResend } from "./resend";
import { formatCents } from "./money";

// Email sender + system default templates. Operators can override per
// property via the EmailTemplate model — a property-scoped row of the
// matching type is preferred over the system default.

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

export type EmailContent = {
  subject: string;
  bodyHtml: string;
  bodyText: string;
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_m, key: string) => vars[key] ?? "");
}

const SYSTEM_DEFAULTS = {
  RESERVATION_CONFIRMATION: {
    subject: "Booking confirmed — {{confirmationCode}} at {{propertyName}}",
    bodyText: `Hi {{guestName}},

Your booking at {{propertyName}} is confirmed.

  Confirmation: {{confirmationCode}}
  Site: {{siteLabel}} ({{siteTypeName}})
  Check-in:  {{checkInDate}} at {{checkInTime}}
  Check-out: {{checkOutDate}} at {{checkOutTime}}
  Total: {{totalFormatted}}

View or manage your booking: {{manageUrl}}

{{portalSectionText}}

If you need to make changes, reply to this email.

— {{propertyName}}`,
    bodyHtml: `<p>Hi {{guestName}},</p>
<p>Your booking at <strong>{{propertyName}}</strong> is confirmed.</p>
<table cellpadding="4" style="border-collapse:collapse">
<tr><td style="color:#666">Confirmation</td><td><strong>{{confirmationCode}}</strong></td></tr>
<tr><td style="color:#666">Site</td><td>{{siteLabel}} ({{siteTypeName}})</td></tr>
<tr><td style="color:#666">Check-in</td><td>{{checkInDate}} at {{checkInTime}}</td></tr>
<tr><td style="color:#666">Check-out</td><td>{{checkOutDate}} at {{checkOutTime}}</td></tr>
<tr><td style="color:#666">Total</td><td><strong>{{totalFormatted}}</strong></td></tr>
</table>
<p><a href="{{manageUrl}}">View or manage your booking</a></p>
{{portalSectionHtml}}
<p>If you need to make changes, reply to this email.</p>
<p>— {{propertyName}}</p>`,
  },
} as const;

/**
 * Render an email's subject + bodies for a given variable set. Pass the
 * operator's override (a row from EmailTemplate) if one exists; otherwise
 * the system default for that type is used.
 */
export function renderEmail(
  type: keyof typeof SYSTEM_DEFAULTS,
  vars: EmailVars,
  override?: { subject: string; bodyHtml: string; bodyText: string } | null,
): EmailContent {
  const tpl = override ?? SYSTEM_DEFAULTS[type];
  const stringVars: Record<string, string> = {
    guestName: vars.guestName,
    confirmationCode: vars.confirmationCode,
    propertyName: vars.propertyName,
    siteLabel: vars.siteLabel,
    siteTypeName: vars.siteTypeName,
    checkInDate: vars.checkInDate,
    checkOutDate: vars.checkOutDate,
    checkInTime: vars.checkInTime,
    checkOutTime: vars.checkOutTime,
    nights: String(vars.nights),
    totalFormatted: vars.totalFormatted,
    totalCents: String(vars.totalCents),
    manageUrl: vars.manageUrl,
    portalSectionText: vars.portalSectionText,
    portalSectionHtml: vars.portalSectionHtml,
  };
  return {
    subject: fill(tpl.subject, stringVars),
    bodyHtml: fill(tpl.bodyHtml, stringVars),
    bodyText: fill(tpl.bodyText, stringVars),
  };
}

/**
 * Send an email via Resend; returns the provider message ID on success.
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
 * Hardcoded for v1 (no operator EmailTemplate override path).
 */
export function renderGuestMagicLinkEmail(
  v: GuestMagicLinkVars,
): EmailContent {
  const subject = `${v.intentLabel} — ${v.propertyName}`;
  const bodyText = `${v.intentLabel}

${v.intro}

Sign-in link (good for ${v.expiresIn}):
${v.link}

If you didn't request this email, you can safely ignore it.

— ${v.propertyName}`;

  const bodyHtml = `<p><strong>${escapeHtml(v.intentLabel)}</strong></p>
<p>${escapeHtml(v.intro)}</p>
<p><a href="${escapeHtml(v.link)}">Click here to continue</a></p>
<p style="color:#666;font-size:12px">
  This link is good for ${escapeHtml(v.expiresIn)}. If you didn't request
  this email, you can safely ignore it.
</p>
<p>— ${escapeHtml(v.propertyName)}</p>`;

  return { subject, bodyHtml, bodyText };
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
 * three branches — refund, upcharge, and equal — by reading
 * refundCents/upchargeCents and rendering the appropriate money line.
 */
export function renderModificationGuestEmail(
  v: ModificationGuestVars,
): EmailContent {
  const moneyLine =
    v.refundCents > 0
      ? `A refund of ${formatCents(v.refundCents)} is on its way back to your card. Refunds typically take 5–10 business days.`
      : v.upchargeCents > 0
        ? `Your additional charge of ${formatCents(v.upchargeCents)} has been processed.`
        : "No money changed hands for this update.";

  const bodyText = `Hi ${v.guestName},

Your booking at ${v.propertyName} has been updated.

  Confirmation: ${v.confirmationCode}

  Was:  Site ${v.oldSiteLabel} · ${v.oldCheckIn} → ${v.oldCheckOut} · ${v.oldNights} night${v.oldNights === 1 ? "" : "s"} · ${formatCents(v.oldTotalCents)}
  Now:  Site ${v.newSiteLabel} · ${v.newCheckIn} → ${v.newCheckOut} · ${v.newNights} night${v.newNights === 1 ? "" : "s"} · ${formatCents(v.newTotalCents)}

${moneyLine}

If you didn't make this change or have questions, reply to this email${
    v.propertyContact ? ` or reach the property:\n\n${v.propertyContact}` : "."
  }

— ${v.propertyName}`;

  const bodyHtml = `<p>Hi ${escapeHtml(v.guestName)},</p>
<p>Your booking at <strong>${escapeHtml(v.propertyName)}</strong> has been updated.</p>
<p><strong>Confirmation:</strong> ${escapeHtml(v.confirmationCode)}</p>
<table cellpadding="4" style="border-collapse:collapse">
<tr><td style="color:#666">Was</td><td>Site ${escapeHtml(v.oldSiteLabel)} · ${escapeHtml(v.oldCheckIn)} → ${escapeHtml(v.oldCheckOut)} · ${v.oldNights}n · ${formatCents(v.oldTotalCents)}</td></tr>
<tr><td style="color:#666">Now</td><td>Site ${escapeHtml(v.newSiteLabel)} · ${escapeHtml(v.newCheckIn)} → ${escapeHtml(v.newCheckOut)} · ${v.newNights}n · ${formatCents(v.newTotalCents)}</td></tr>
</table>
<p>${escapeHtml(moneyLine)}</p>
<p>— ${escapeHtml(v.propertyName)}</p>`;

  return {
    subject: `Booking updated: ${v.propertyName} — ${v.confirmationCode}`,
    bodyHtml,
    bodyText,
  };
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
 * Hardcoded for v1 (no operator template override). Phase 6a's
 * template-editing UI will wire in operator overrides for these.
 */
export function renderReminderEmail(
  kind: ReminderKind,
  v: ReminderEmailVars,
): EmailContent {
  const headline = REMINDER_HEADLINES[kind];
  const intro = REMINDER_INTROS[kind];

  const showInstructions =
    kind !== "THANK_YOU_POST_STAY" && v.checkInInstructions.length > 0;

  const detailsBlock = `  Confirmation: ${v.confirmationCode}
  Site:         ${v.siteLabel} (${v.siteTypeName})
  Check-in:     ${v.checkInDate} at ${v.checkInTime}
  Check-out:    ${v.checkOutDate} at ${v.checkOutTime}
  Nights:       ${v.nights}
  Total:        ${formatCents(v.totalCents)}`;

  const instructionsBlock = showInstructions
    ? `\n\nCheck-in instructions:\n${v.checkInInstructions}`
    : "";

  const mapBlock = v.mapImageUrl
    ? `\n\nCampground map: ${v.mapImageUrl}`
    : "";

  const contactBlock = v.propertyContact
    ? `\n\n${v.propertyContact}`
    : "";

  const manageBlock = v.manageUrl
    ? `\n\nView your booking: ${v.manageUrl}`
    : "";

  const subject =
    kind === "THANK_YOU_POST_STAY"
      ? `${headline} — ${v.propertyName}`
      : `${headline} — ${v.propertyName} (${v.confirmationCode})`;

  const bodyText = `${headline}.

Hi ${v.guestName},

${intro}

${detailsBlock}${instructionsBlock}${mapBlock}${manageBlock}${contactBlock}

— ${v.propertyName}`;

  const bodyHtml = `<p><strong>${escapeHtml(headline)}.</strong></p>
<p>Hi ${escapeHtml(v.guestName)},</p>
<p>${escapeHtml(intro)}</p>
<table cellpadding="4" style="border-collapse:collapse">
<tr><td style="color:#666">Confirmation</td><td><strong>${escapeHtml(v.confirmationCode)}</strong></td></tr>
<tr><td style="color:#666">Site</td><td>${escapeHtml(v.siteLabel)} (${escapeHtml(v.siteTypeName)})</td></tr>
<tr><td style="color:#666">Check-in</td><td>${escapeHtml(v.checkInDate)} at ${escapeHtml(v.checkInTime)}</td></tr>
<tr><td style="color:#666">Check-out</td><td>${escapeHtml(v.checkOutDate)} at ${escapeHtml(v.checkOutTime)}</td></tr>
<tr><td style="color:#666">Nights</td><td>${v.nights}</td></tr>
<tr><td style="color:#666">Total</td><td>${escapeHtml(formatCents(v.totalCents))}</td></tr>
</table>
${
  showInstructions
    ? `<p><strong>Check-in instructions:</strong></p><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(v.checkInInstructions)}</pre>`
    : ""
}
${
  v.mapImageUrl
    ? `<p><a href="${escapeHtml(v.mapImageUrl)}">View campground map</a></p>`
    : ""
}
${
  v.manageUrl
    ? `<p><a href="${escapeHtml(v.manageUrl)}">View your booking</a></p>`
    : ""
}
${
  v.propertyContact
    ? `<p>${escapeHtml(v.propertyContact).replace(/\n/g, "<br>")}</p>`
    : ""
}
<p>— ${escapeHtml(v.propertyName)}</p>`;

  return { subject, bodyHtml, bodyText };
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
 * Renders the cancellation email sent to the guest after an operator
 * cancels their reservation. Hardcoded for v1 — operators can't override
 * the template yet (EmailTemplate model exists for future use). The
 * "5–10 business days" line covers Stripe's typical refund timing.
 */
export function renderCancellationEmail(
  v: CancellationEmailVars,
): EmailContent {
  const refundLine =
    v.refundCents > 0
      ? `A refund of ${formatCents(v.refundCents)} is on its way back to your card. Refunds typically take 5–10 business days to appear on your statement.`
      : `No refund will be issued per the cancellation policy in effect at the time of booking.`;

  const reasonLine = v.reason ? `\nNote from the operator: ${v.reason}\n` : "";

  const bodyText = `Hi ${v.guestName},

Your booking at ${v.propertyName} has been cancelled.

  Confirmation: ${v.confirmationCode}
  Site:         ${v.siteLabel} (${v.siteTypeName})
  Dates:        ${v.checkInDate} → ${v.checkOutDate}
${reasonLine}
${refundLine}

If you have questions, reply to this email${v.propertyContact ? ` or reach the property directly:\n\n${v.propertyContact}` : "."}

— ${v.propertyName}`;

  const bodyHtml = `<p>Hi ${escapeHtml(v.guestName)},</p>
<p>Your booking at <strong>${escapeHtml(v.propertyName)}</strong> has been cancelled.</p>
<table cellpadding="4" style="border-collapse:collapse">
<tr><td style="color:#666">Confirmation</td><td><strong>${escapeHtml(v.confirmationCode)}</strong></td></tr>
<tr><td style="color:#666">Site</td><td>${escapeHtml(v.siteLabel)} (${escapeHtml(v.siteTypeName)})</td></tr>
<tr><td style="color:#666">Dates</td><td>${escapeHtml(v.checkInDate)} → ${escapeHtml(v.checkOutDate)}</td></tr>
</table>
${v.reason ? `<p><em>Note from the operator:</em> ${escapeHtml(v.reason)}</p>` : ""}
<p>${escapeHtml(refundLine)}</p>
<p>If you have questions, reply to this email${
    v.propertyContact
      ? `<br><br>${escapeHtml(v.propertyContact).replace(/\n/g, "<br>")}`
      : "."
  }</p>
<p>— ${escapeHtml(v.propertyName)}</p>`;

  return {
    subject: `Booking cancelled: ${v.propertyName} — ${v.confirmationCode}`,
    bodyHtml,
    bodyText,
  };
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
