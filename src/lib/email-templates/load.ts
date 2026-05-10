// DB-side helper for picking up an operator's per-property template
// override at send time. Returns null when there's no override (or the
// override is inactive), which the renderer treats as "use the default."

import type { EmailTemplateType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { TemplateOverride } from "./render";

export async function loadEmailTemplateOverride(
  propertyId: string,
  type: EmailTemplateType,
): Promise<TemplateOverride | null> {
  const row = await prisma.emailTemplate.findUnique({
    where: { propertyId_type: { propertyId, type } },
  });
  if (!row || !row.active) return null;
  return {
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml,
  };
}
