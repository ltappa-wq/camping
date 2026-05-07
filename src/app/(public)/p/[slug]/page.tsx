import { PublicHeader } from "./_components/public-header";
import { SearchForm } from "./_components/search-form";
import {
  getPropertyWithOrgBySlug,
  isAcceptingBookings,
} from "./_lib/property";

export default async function PropertyLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getPropertyWithOrgBySlug(slug);
  const accepting = isAcceptingBookings(property.organization);

  return (
    <>
      <PublicHeader
        slug={property.slug}
        name={property.name}
        logoUrl={property.logoUrl}
      />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-semibold">{property.name}</h1>
        {property.city || property.state ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {[property.city, property.state].filter(Boolean).join(", ")}
          </p>
        ) : null}

        {property.description ? (
          <p className="mt-4 whitespace-pre-line text-sm">
            {property.description}
          </p>
        ) : null}

        <section className="mt-8 rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-medium">Find a site</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Check-in {property.checkInTime} · Check-out {property.checkOutTime}
          </p>
          <div className="mt-4">
            {accepting ? (
              <SearchForm slug={property.slug} />
            ) : (
              <p className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
                Online bookings coming soon. Please contact us directly to
                reserve a site.
              </p>
            )}
          </div>
        </section>

        {property.rulesText ? (
          <section className="mt-8">
            <h2 className="text-lg font-medium">House rules</h2>
            <p className="mt-2 whitespace-pre-line text-sm">
              {property.rulesText}
            </p>
          </section>
        ) : null}
      </main>
    </>
  );
}
