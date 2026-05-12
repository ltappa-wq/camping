"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logIfImpersonating } from "@/lib/audit";
import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { textToHtml } from "@/lib/email-templates/render";
import {
  isCustomizableType,
  type CustomizableTemplateType,
} from "@/lib/email-templates/variables";

const formSchema = z.object({
  type: z
    .string()
    .refine((v) => isCustomizableType(v), "Unknown template type"),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  bodyText: z.string().trim().min(1, "Body is required").max(20000),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Upsert the operator's customization for one template type. The HTML
 * body is auto-derived from the plain-text body; operators only edit
 * subject + bodyText (no markup required). Marks the row active so the
 * dispatcher picks it up immediately on the next send.
 */
export async function saveEmailTemplate(values: {
  type: string;
  subject: string;
  bodyText: string;
}): Promise<ActionResult> {
  const ctx = await requireOperatorPropertyOrSetup();
  const parsed = formSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const v = parsed.data;
  const type = v.type as CustomizableTemplateType;

  const bodyHtml = textToHtml(v.bodyText);

  await ctx.prisma.emailTemplate.upsert({
    where: { propertyId_type: { propertyId: ctx.propertyId, type } },
    create: {
      propertyId: ctx.propertyId,
      type,
      subject: v.subject,
      bodyText: v.bodyText,
      bodyHtml,
      active: true,
    },
    update: {
      subject: v.subject,
      bodyText: v.bodyText,
      bodyHtml,
      active: true,
    },
  });

  await logIfImpersonating({
    action: "email_template.update",
    description: `Customized email template ${type}`,
    propertyId: ctx.propertyId,
    payload: { type, subjectLength: v.subject.length, bodyLength: v.bodyText.length },
  });

  revalidatePath("/admin/emails");
  revalidatePath(`/admin/emails/${type}`);
  return { ok: true };
}

/**
 * Delete the operator's override row, reverting the template to the
 * hardcoded system default. Cleaner than versioning or an "is default" flag.
 */
export async function resetEmailTemplate(type: string): Promise<ActionResult> {
  if (!isCustomizableType(type)) {
    return { ok: false, error: "Unknown template type" };
  }
  const ctx = await requireOperatorPropertyOrSetup();
  await ctx.prisma.emailTemplate.deleteMany({
    where: { propertyId: ctx.propertyId, type: type as CustomizableTemplateType },
  });

  await logIfImpersonating({
    action: "email_template.reset",
    description: `Reset email template ${type} to default`,
    propertyId: ctx.propertyId,
    payload: { type },
  });

  revalidatePath("/admin/emails");
  revalidatePath(`/admin/emails/${type}`);
  return { ok: true };
}
