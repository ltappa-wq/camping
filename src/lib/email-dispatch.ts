import type { EmailTemplateType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { type EmailContent, sendEmail } from "@/lib/email";
import { fromAddressForProperty } from "@/lib/email-from";

/**
 * Render → log → send → update-log dance for a single email. Each call:
 *   1. Inserts an EmailLog row with status QUEUED
 *   2. Looks up the property's sending-domain config + contact email
 *   3. Sends via Resend (verified domain when available, fallback otherwise;
 *      Reply-To set to the property's contact email when present)
 *   4. Updates the log row to SENT (with providerMessageId) or FAILED
 *      (with errorMessage)
 *
 * Best-effort: a Resend failure is logged, not thrown. Callers that
 * want to surface email-send failures to a user should check the
 * returned `ok` flag.
 *
 * Lives in its own module rather than email.ts so the rendering layer
 * stays I/O-free.
 */
export async function dispatchEmail(args: {
  propertyId: string;
  reservationId: string | null;
  type: EmailTemplateType;
  to: string;
  content: EmailContent;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const property = await prisma.property.findUnique({
    where: { id: args.propertyId },
    select: {
      sendingDomain: true,
      sendingDomainVerified: true,
      sendingFromLocal: true,
      email: true,
    },
  });

  const log = await prisma.emailLog.create({
    data: {
      propertyId: args.propertyId,
      reservationId: args.reservationId,
      type: args.type,
      toEmail: args.to,
      subject: args.content.subject,
      status: "QUEUED",
    },
  });

  const send = await sendEmail({
    to: args.to,
    subject: args.content.subject,
    bodyHtml: args.content.bodyHtml,
    bodyText: args.content.bodyText,
    from: property
      ? fromAddressForProperty({
          sendingDomain: property.sendingDomain,
          sendingDomainVerified: property.sendingDomainVerified,
          sendingFromLocal: property.sendingFromLocal,
        })
      : undefined,
    replyTo: property?.email ?? undefined,
  });

  await prisma.emailLog.update({
    where: { id: log.id },
    data: send.ok
      ? {
          status: "SENT",
          providerMessageId: send.messageId,
          sentAt: new Date(),
        }
      : { status: "FAILED", errorMessage: send.error },
  });

  return send;
}
