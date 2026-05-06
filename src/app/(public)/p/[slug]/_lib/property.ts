import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

/** Fetch a property by its public slug, 404 if missing. Server-only. */
export async function getPropertyBySlug(slug: string) {
  const property = await prisma.property.findUnique({
    where: { slug },
  });
  if (!property) notFound();
  return property;
}
