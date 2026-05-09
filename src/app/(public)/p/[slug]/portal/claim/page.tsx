import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { PublicHeader } from "../../_components/public-header";
import { getPropertyBySlug } from "../../_lib/property";
import { ClaimAutoSubmit } from "./auto-submit";

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";

  if (!token) {
    redirect(`/p/${slug}/portal/sign-in?error=expired`);
  }

  const property = await getPropertyBySlug(slug);

  // Pre-validate so an obviously-bad token redirects to the friendly
  // sign-in error page rather than landing on Auth.js's default error
  // handler. The credentials provider re-validates on form submit so
  // there's no trust gap if the token is consumed between this check
  // and the submit.
  const link = await prisma.guestMagicLink.findUnique({
    where: { token },
    select: { consumedAt: true, expiresAt: true, propertyId: true },
  });
  if (
    !link ||
    link.consumedAt ||
    link.expiresAt.getTime() < Date.now() ||
    link.propertyId !== property.id
  ) {
    redirect(`/p/${slug}/portal/sign-in?error=expired`);
  }

  return (
    <>
      <PublicHeader
        slug={property.slug}
        name={property.name}
        logoUrl={property.logoUrl}
      />
      <main className="mx-auto max-w-md px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{property.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One moment while we sign you in.
          </p>
        </div>
        <ClaimAutoSubmit token={token} slug={slug} />
      </main>
    </>
  );
}
