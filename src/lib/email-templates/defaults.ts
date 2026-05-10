// Hardcoded default templates for every operator-customizable email type.
// Operators can override these per-property via the EmailTemplate model;
// without an override the renderer uses the entries below.
//
// Subject and bodyText are mustache strings ({{var}}). bodyHtml is also
// a mustache string with light HTML markup so the structured details
// (tables, links) survive when no override is set. When an operator
// supplies an override they only edit subject + bodyText; the renderer
// auto-derives the HTML by escaping and paragraph-wrapping the text.

import type { CustomizableTemplateType } from "./variables";

export type DefaultTemplate = {
  subject: string;
  bodyText: string;
  bodyHtml: string;
};

const RESERVATION_CONFIRMATION: DefaultTemplate = {
  subject: "Booking confirmed — {{confirmationCode}} at {{propertyName}}",
  bodyText: `Hi {{guestName}},

Your booking at {{propertyName}} is confirmed.

  Confirmation: {{confirmationCode}}
  Site: {{siteLabel}} ({{siteType}})
  Check-in:  {{checkInDate}} at {{checkInTime}}
  Check-out: {{checkOutDate}} at {{checkOutTime}}
  Total: {{totalAmount}}

View or manage your booking: {{manageBookingUrl}}

{{portalSectionText}}

If you need to make changes, reply to this email.

— {{propertyName}}`,
  bodyHtml: `<p>Hi {{guestName}},</p>
<p>Your booking at <strong>{{propertyName}}</strong> is confirmed.</p>
<table cellpadding="4" style="border-collapse:collapse">
<tr><td style="color:#666">Confirmation</td><td><strong>{{confirmationCode}}</strong></td></tr>
<tr><td style="color:#666">Site</td><td>{{siteLabel}} ({{siteType}})</td></tr>
<tr><td style="color:#666">Check-in</td><td>{{checkInDate}} at {{checkInTime}}</td></tr>
<tr><td style="color:#666">Check-out</td><td>{{checkOutDate}} at {{checkOutTime}}</td></tr>
<tr><td style="color:#666">Total</td><td><strong>{{totalAmount}}</strong></td></tr>
</table>
<p><a href="{{manageBookingUrl}}">View or manage your booking</a></p>
{{portalSectionHtml}}
<p>If you need to make changes, reply to this email.</p>
<p>— {{propertyName}}</p>`,
};

const CANCELLATION: DefaultTemplate = {
  subject: "Booking cancelled: {{propertyName}} — {{confirmationCode}}",
  bodyText: `Hi {{guestName}},

Your booking at {{propertyName}} has been cancelled.

  Confirmation: {{confirmationCode}}
  Site:         {{siteLabel}} ({{siteType}})
  Dates:        {{checkInDate}} → {{checkOutDate}}
{{cancellationReasonLine}}
{{refundLine}}

If you have questions, reply to this email{{contactSuffix}}

— {{propertyName}}`,
  bodyHtml: `<p>Hi {{guestName}},</p>
<p>Your booking at <strong>{{propertyName}}</strong> has been cancelled.</p>
<table cellpadding="4" style="border-collapse:collapse">
<tr><td style="color:#666">Confirmation</td><td><strong>{{confirmationCode}}</strong></td></tr>
<tr><td style="color:#666">Site</td><td>{{siteLabel}} ({{siteType}})</td></tr>
<tr><td style="color:#666">Dates</td><td>{{checkInDate}} → {{checkOutDate}}</td></tr>
</table>
{{cancellationReasonHtml}}
<p>{{refundLine}}</p>
<p>If you have questions, reply to this email{{contactSuffixHtml}}</p>
<p>— {{propertyName}}</p>`,
};

const GUEST_PROFILE_CLAIM: DefaultTemplate = {
  subject: "{{intentLabel}} — {{propertyName}}",
  bodyText: `{{intentLabel}}

{{intro}}

Sign-in link (good for {{expiresIn}}):
{{magicLink}}

If you didn't request this email, you can safely ignore it.

— {{propertyName}}`,
  bodyHtml: `<p><strong>{{intentLabel}}</strong></p>
<p>{{intro}}</p>
<p><a href="{{magicLink}}">Click here to continue</a></p>
<p style="color:#666;font-size:12px">
  This link is good for {{expiresIn}}. If you didn't request
  this email, you can safely ignore it.
</p>
<p>— {{propertyName}}</p>`,
};

const REMINDER_BODY_TEXT = `{{headline}}.

Hi {{guestName}},

{{intro}}

  Confirmation: {{confirmationCode}}
  Site:         {{siteLabel}} ({{siteType}})
  Check-in:     {{checkInDate}} at {{checkInTime}}
  Check-out:    {{checkOutDate}} at {{checkOutTime}}
  Nights:       {{nights}}
  Total:        {{totalAmount}}{{instructionsBlock}}{{mapBlock}}{{manageBlock}}{{contactBlock}}

— {{propertyName}}`;

const REMINDER_BODY_HTML = `<p><strong>{{headline}}.</strong></p>
<p>Hi {{guestName}},</p>
<p>{{intro}}</p>
<table cellpadding="4" style="border-collapse:collapse">
<tr><td style="color:#666">Confirmation</td><td><strong>{{confirmationCode}}</strong></td></tr>
<tr><td style="color:#666">Site</td><td>{{siteLabel}} ({{siteType}})</td></tr>
<tr><td style="color:#666">Check-in</td><td>{{checkInDate}} at {{checkInTime}}</td></tr>
<tr><td style="color:#666">Check-out</td><td>{{checkOutDate}} at {{checkOutTime}}</td></tr>
<tr><td style="color:#666">Nights</td><td>{{nights}}</td></tr>
<tr><td style="color:#666">Total</td><td>{{totalAmount}}</td></tr>
</table>
{{instructionsHtml}}
{{mapHtml}}
{{manageHtml}}
{{contactHtml}}
<p>— {{propertyName}}</p>`;

const REMINDER_7_DAYS: DefaultTemplate = {
  subject:
    "Your stay is one week away — {{propertyName}} ({{confirmationCode}})",
  bodyText: REMINDER_BODY_TEXT,
  bodyHtml: REMINDER_BODY_HTML,
};

const REMINDER_3_DAYS: DefaultTemplate = {
  subject: "Three days until your stay — {{propertyName}} ({{confirmationCode}})",
  bodyText: REMINDER_BODY_TEXT,
  bodyHtml: REMINDER_BODY_HTML,
};

const REMINDER_ARRIVAL_DAY: DefaultTemplate = {
  subject:
    "Welcome — we're ready for you today — {{propertyName}} ({{confirmationCode}})",
  bodyText: REMINDER_BODY_TEXT,
  bodyHtml: REMINDER_BODY_HTML,
};

const THANK_YOU_POST_STAY: DefaultTemplate = {
  subject: "Thanks for staying with us — {{propertyName}}",
  bodyText: `{{headline}}.

Hi {{guestName}},

{{intro}}

  Confirmation: {{confirmationCode}}
  Site:         {{siteLabel}} ({{siteType}})
  Check-in:     {{checkInDate}} at {{checkInTime}}
  Check-out:    {{checkOutDate}} at {{checkOutTime}}
  Nights:       {{nights}}
  Total:        {{totalAmount}}{{manageBlock}}{{contactBlock}}

— {{propertyName}}`,
  bodyHtml: REMINDER_BODY_HTML,
};

const MODIFICATION_GUEST: DefaultTemplate = {
  subject: "Booking updated: {{propertyName}} — {{confirmationCode}}",
  bodyText: `Hi {{guestName}},

Your booking at {{propertyName}} has been updated.

  Confirmation: {{confirmationCode}}

  Was:  Site {{oldSiteLabel}} · {{oldCheckIn}} → {{oldCheckOut}} · {{oldNights}} night(s) · {{oldTotal}}
  Now:  Site {{newSiteLabel}} · {{newCheckIn}} → {{newCheckOut}} · {{newNights}} night(s) · {{newTotal}}

{{moneyLine}}

If you didn't make this change or have questions, reply to this email{{contactSuffix}}

— {{propertyName}}`,
  bodyHtml: `<p>Hi {{guestName}},</p>
<p>Your booking at <strong>{{propertyName}}</strong> has been updated.</p>
<p><strong>Confirmation:</strong> {{confirmationCode}}</p>
<table cellpadding="4" style="border-collapse:collapse">
<tr><td style="color:#666">Was</td><td>Site {{oldSiteLabel}} · {{oldCheckIn}} → {{oldCheckOut}} · {{oldNights}}n · {{oldTotal}}</td></tr>
<tr><td style="color:#666">Now</td><td>Site {{newSiteLabel}} · {{newCheckIn}} → {{newCheckOut}} · {{newNights}}n · {{newTotal}}</td></tr>
</table>
<p>{{moneyLine}}</p>
<p>— {{propertyName}}</p>`,
};

export const TEMPLATE_DEFAULTS: Record<
  CustomizableTemplateType,
  DefaultTemplate
> = {
  RESERVATION_CONFIRMATION,
  CANCELLATION,
  GUEST_PROFILE_CLAIM,
  REMINDER_7_DAYS,
  REMINDER_3_DAYS,
  REMINDER_ARRIVAL_DAY,
  THANK_YOU_POST_STAY,
  MODIFICATION_GUEST,
};
