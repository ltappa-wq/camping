import { prisma } from "@/lib/prisma";
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

  const galleryImages = await prisma.propertyImage.findMany({
    where: { propertyId: property.id },
    orderBy: { order: "asc" },
    select: { id: true, url: true, caption: true },
  });

  return (
    <>
      <PublicHeader
        slug={property.slug}
        name={property.name}
        logoUrl={property.logoUrl}
      />
      {property.heroImageUrl ? (
        <div className="relative aspect-[3/1] w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={property.heroImageUrl}
            alt={property.name}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
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

        {galleryImages.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-lg font-medium">Photos</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {galleryImages.map((img) => (
                <a
                  key={img.id}
                  href={img.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-[4/3] overflow-hidden rounded-md bg-muted"
                  title={img.caption ?? ""}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.caption ?? ""}
                    className="h-full w-full object-cover transition hover:scale-105"
                  />
                </a>
              ))}
            </div>
          </section>
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
