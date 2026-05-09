import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getGuestSession } from "@/lib/guest-auth";
import { PublicHeader } from "../_components/public-header";
import { getPropertyBySlug } from "../_lib/property";
import { guestSignOutAction } from "./actions";

// Placeholder home for the guest portal. Step 2 builds this out into
// the upcoming / current / past reservation list. For now it just
// proves the auth boundary works end-to-end: a guest who arrives via
// magic-link gets here; anyone without a session gets bounced to
// sign-in.

export default async function PortalHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getPropertyBySlug(slug);

  const session = await getGuestSession();
  if (!session || session.propertySlug !== slug) {
    redirect(`/p/${slug}/portal/sign-in`);
  }

  return (
    <>
      <PublicHeader
        slug={property.slug}
        name={property.name}
        logoUrl={property.logoUrl}
      />
      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Your bookings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as {session.email} at {property.name}.
            </p>
          </div>
          <form action={guestSignOutAction}>
            <input type="hidden" name="slug" value={slug} />
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
        <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
          Your reservation list ships in the next commit. Auth boundary
          works — you wouldn&apos;t see this without a valid magic-link
          session.
        </div>
      </main>
    </>
  );
}
