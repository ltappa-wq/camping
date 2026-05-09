import Link from "next/link";

import { PublicHeader } from "../../_components/public-header";
import { getPropertyBySlug } from "../../_lib/property";
import { SignInForm } from "./sign-in-form";

export default async function GuestSignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const property = await getPropertyBySlug(slug);

  // Surfaced when the user clicks an expired or already-consumed claim
  // link, then gets redirected here.
  const expired = typeof sp.error === "string" && sp.error === "expired";

  return (
    <>
      <PublicHeader
        slug={property.slug}
        name={property.name}
        logoUrl={property.logoUrl}
      />
      <main className="mx-auto max-w-md px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Guest portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to view and manage your bookings at {property.name}.
          </p>
        </div>
        {expired ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            That sign-in link is expired or has already been used. Request a
            new one below.
          </div>
        ) : null}
        <SignInForm slug={slug} />
        <p className="text-xs text-muted-foreground">
          Don&apos;t have a booking yet?{" "}
          <Link href={`/p/${slug}`} className="underline">
            Find a campsite at {property.name}
          </Link>
          .
        </p>
      </main>
    </>
  );
}
