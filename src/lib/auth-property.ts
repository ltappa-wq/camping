import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scopedPrisma } from "@/lib/prisma-scoped";

/**
 * Resolves the current operator session into their Organization and (single)
 * Property. Redirects to /login if not authenticated or not an operator.
 *
 * v1 assumes one Property per Organization. The schema supports many-to-one
 * but the UI is single-property; if multiple exist we pick the first one
 * by createdAt ascending so behavior is deterministic.
 *
 * Returns the operator's auth context plus a `prisma` client pre-scoped to
 * the property — use it in Server Actions to avoid repeating `where: { propertyId }`.
 */
export async function requireOperatorProperty() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const operator = await prisma.operatorUser.findUnique({
    where: { email: session.user.email },
    include: {
      organization: {
        include: {
          properties: {
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!operator) redirect("/login");

  const property = operator.organization.properties[0] ?? null;

  return {
    session,
    operator,
    organization: operator.organization,
    property,
    propertyId: property?.id ?? null,
    prisma: property ? scopedPrisma(property.id) : null,
  };
}

/**
 * Like requireOperatorProperty(), but throws (and the caller should redirect
 * to /admin/setup) if no Property exists. Use in Server Actions and pages
 * that *require* a property to be configured.
 */
export async function requireOperatorPropertyOrSetup() {
  const ctx = await requireOperatorProperty();
  if (!ctx.property || !ctx.propertyId || !ctx.prisma) {
    redirect("/admin/setup");
  }
  return {
    session: ctx.session,
    operator: ctx.operator,
    organization: ctx.organization,
    property: ctx.property,
    propertyId: ctx.propertyId,
    prisma: ctx.prisma,
  };
}
