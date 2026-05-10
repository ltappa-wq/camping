import Link from "next/link";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CUSTOMIZABLE_TEMPLATE_TYPES,
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_LABELS,
} from "@/lib/email-templates/variables";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const ctx = await requireOperatorPropertyOrSetup();

  const overrides = await ctx.prisma.emailTemplate.findMany({
    where: { type: { in: [...CUSTOMIZABLE_TEMPLATE_TYPES] } },
    select: { type: true, active: true, updatedAt: true },
  });
  const customizedSet = new Set(
    overrides.filter((o) => o.active).map((o) => o.type),
  );

  return (
    <div>
      <PageHeader
        title="Emails"
        description="Customize the wording of guest-facing transactional emails. Operator-internal alerts (new-booking notifications) aren't editable."
      />

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Template</TableHead>
              <TableHead>What it&apos;s for</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {CUSTOMIZABLE_TEMPLATE_TYPES.map((type) => {
              const customized = customizedSet.has(type);
              return (
                <TableRow key={type}>
                  <TableCell className="font-medium">
                    {TEMPLATE_LABELS[type]}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {TEMPLATE_DESCRIPTIONS[type]}
                  </TableCell>
                  <TableCell>
                    {customized ? (
                      <Badge>Customized</Badge>
                    ) : (
                      <Badge variant="secondary">Default</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/emails/${type}`}>Edit</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
