import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { TEMPLATE_DEFAULTS } from "@/lib/email-templates/defaults";
import {
  isCustomizableType,
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_LABELS,
  TEMPLATE_VARIABLES,
  type CustomizableTemplateType,
} from "@/lib/email-templates/variables";
import { EmailTemplateEditor } from "./email-template-editor";

export const dynamic = "force-dynamic";

export default async function EmailTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type: rawType } = await params;
  if (!isCustomizableType(rawType)) {
    notFound();
  }
  const type = rawType as CustomizableTemplateType;
  const ctx = await requireOperatorPropertyOrSetup();

  const existing = await ctx.prisma.emailTemplate.findUnique({
    where: { propertyId_type: { propertyId: ctx.propertyId, type } },
  });

  const defaults = TEMPLATE_DEFAULTS[type];
  const customized = !!existing && existing.active;

  return (
    <div>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin/emails">
            <ChevronLeft className="mr-1 h-4 w-4" /> Back to emails
          </Link>
        </Button>
      </div>
      <PageHeader
        title={TEMPLATE_LABELS[type]}
        description={TEMPLATE_DESCRIPTIONS[type]}
      />
      <EmailTemplateEditor
        type={type}
        variables={TEMPLATE_VARIABLES[type]}
        defaultSubject={defaults.subject}
        defaultBodyText={defaults.bodyText}
        initialSubject={customized ? existing!.subject : defaults.subject}
        initialBodyText={customized ? existing!.bodyText : defaults.bodyText}
        isCustomized={customized}
      />
    </div>
  );
}
