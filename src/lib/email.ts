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
  };
  return {
    subject: fill(tpl.subject, stringVars),
    bodyHtml: fill(tpl.bodyHtml, stringVars),
    bodyText: fill(tpl.bodyText, stringVars),
  };
}

/** Send an email via Resend; returns the provider message ID on success. */
export async function sendEmail(args: {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: args.to,
      subject: args.subject,
      html: args.bodyHtml,
      text: args.bodyText,
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
