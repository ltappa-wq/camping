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
