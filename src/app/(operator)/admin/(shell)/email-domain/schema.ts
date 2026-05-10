import { z } from "zod";

// Apex domain (no protocol, no path, no leading dot/at). RFC-permissive
// regex; Resend will do the authoritative validation when we send the
// create call.
const DOMAIN_RE =
  /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})+$/;

// Local-part (before the @): letters, digits, dot, hyphen, underscore.
// Conservative — Resend accepts more, but this covers every reasonable
// value an operator would type ("bookings", "reservations", "info").
const LOCAL_RE = /^[A-Za-z0-9._-]+$/;

export const sendingDomainFormSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(253)
    .regex(DOMAIN_RE, "Enter a valid domain like monumentpointcamping.com"),
  fromLocal: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(LOCAL_RE, "Letters, digits, dot, dash, underscore only")
    .default("bookings"),
});

export type SendingDomainFormValues = z.input<typeof sendingDomainFormSchema>;
export type SendingDomainFormParsed = z.output<typeof sendingDomainFormSchema>;
