import { prisma } from "@/lib/prisma";
import {
  formatSeason,
  formatTime12,
  LedgerCard,
  PageShell,
} from "@/components/public/chrome";
import {
  getPropertyWithOrgBySlug,
  isAcceptingBookings,
} from "./_lib/property";
import { LandingBookingCard } from "./_components/landing-booking-card";

export default async function PropertyLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getPropertyWithOrgBySlug(slug);
  const accepting = isAcceptingBookings(property.organization);

  // Side-fetch the slow-changing visual data the page renders.
  const [galleryImages, lowestRatePlan, siteCount, primarySiteType] =
    await Promise.all([
      prisma.propertyImage.findMany({
        where: { propertyId: property.id },
        orderBy: { order: "asc" },
        select: { id: true, url: true, caption: true },
      }),
      prisma.ratePlan.findFirst({
        where: {
          propertyId: property.id,
          active: true,
          chargeUnit: "NIGHT",
        },
        orderBy: { pricePerUnitCents: "asc" },
        select: { pricePerUnitCents: true },
      }),
      prisma.site.count({
        where: { propertyId: property.id, deletedAt: null, active: true },
      }),
      prisma.siteType.findFirst({
        where: { propertyId: property.id, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          maxAdults: true,
          maxChildren: true,
          petsAllowed: true,
        },
      }),
    ]);

  return (
    <PageShell
      property={{
        id: property.id,
        slug: property.slug,
        name: property.name,
        logoUrl: property.logoUrl,
        phone: property.phone,
        primaryColor: property.primaryColor,
      }}
    >
      <Hero property={property} />

      {/* Booking card — overlaps the hero on desktop, sits flat on mobile
          and when there's no hero. */}
      <div
        className={`relative z-10 ${
          property.heroImageUrl ? "-mt-12 lg:-mt-14" : "mt-8"
        }`}
      >
        <div className="mx-auto max-w-[1280px] px-6 md:px-8">
          {accepting ? (
            <LandingBookingCard
              slug={property.slug}
              lowestNightlyCents={lowestRatePlan?.pricePerUnitCents ?? null}
            />
          ) : (
            <BookingsNotLiveCard
              propertyName={property.name}
              phone={property.phone}
              email={property.email}
            />
          )}
        </div>
      </div>

      {/* About — operator description + at-a-glance ledger */}
      <section id="about" className="py-16 md:py-24">
        <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-8 px-6 md:gap-12 md:px-8">
          <div className="col-span-12 lg:col-span-7">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
              About
            </div>
            {property.description ? (
              <p className="mt-6 whitespace-pre-line text-[16px] leading-[1.75] text-stone-700 md:text-[17px]">
                {property.description}
              </p>
            ) : (
              <p className="mt-6 text-[14px] italic text-stone-400">
                No description set yet.
              </p>
            )}
          </div>
          <aside className="col-span-12 lg:col-span-4 lg:col-start-9">
            <LedgerCard title="At a glance">
              <dl className="space-y-3.5 text-[14px]">
                {formatSeason(property) ? (
                  <LedgerKv k="Season" v={formatSeason(property)!} />
                ) : null}
                <LedgerKv
                  k="Check-in"
                  v={formatTime12(property.checkInTime)}
                />
                <LedgerKv
                  k="Check-out"
                  v={formatTime12(property.checkOutTime)}
                />
                {siteCount > 0 ? (
                  <LedgerKv k="Sites" v={String(siteCount)} />
                ) : null}
                {primarySiteType?.petsAllowed ? (
                  <LedgerKv k="Pets" v="Welcome on leash" />
                ) : null}
                {primarySiteType ? (
                  <LedgerKv
                    k="Max party"
                    v={[
                      primarySiteType.maxAdults != null
                        ? `${primarySiteType.maxAdults} adults`
                        : null,
                      primarySiteType.maxChildren != null
                        ? `${primarySiteType.maxChildren} children`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" + ")}
                  />
                ) : null}
                <LedgerKv
                  k="Cancellation"
                  v={`Full refund ${property.cancelFullRefundDays}+ days out`}
                />
              </dl>
            </LedgerCard>
          </aside>
        </div>
      </section>

      {/* Photo mosaic */}
      {galleryImages.length > 0 ? (
        <section
          id="photos"
          className="border-y border-stone-200 bg-[#f4eee2]"
        >
          <div className="mx-auto max-w-[1280px] px-6 py-16 md:px-8 md:py-20">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
              Photos
            </div>
            <PhotoMosaic
              images={galleryImages.slice(0, 6).map((g) => ({
                url: g.url,
                caption: g.caption,
              }))}
            />
          </div>
        </section>
      ) : null}

      {/* Rules + getting here */}
      {property.rulesText ||
      property.directionsText ||
      property.addressLine1 ||
      property.phone ||
      property.email ? (
        <section className="py-16 md:py-20">
          <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-8 px-6 md:gap-12 md:px-8">
            {property.rulesText ? (
              <div id="rules" className="col-span-12 lg:col-span-7">
                <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
                  House rules
                </div>
                <p className="mt-6 whitespace-pre-line text-[15.5px] leading-[1.8] text-stone-700">
                  {property.rulesText}
                </p>
              </div>
            ) : (
              <div className="hidden lg:col-span-7 lg:block" />
            )}
            {property.directionsText ||
            property.addressLine1 ||
            property.phone ||
            property.email ? (
              <div id="getting-here" className="col-span-12 lg:col-span-5">
                <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
                  Getting here
                </div>
                {property.directionsText ? (
                  <p className="mt-6 whitespace-pre-line text-[15.5px] leading-[1.8] text-stone-700">
                    {property.directionsText}
                  </p>
                ) : null}
                <div className="mt-6 rounded-md border border-stone-200 bg-[#fbf8f1] p-5 text-[14px] text-stone-700">
                  <div className="font-medium text-stone-900">
                    {property.name}
                  </div>
                  {property.addressLine1 ? (
                    <div>{property.addressLine1}</div>
                  ) : null}
                  {property.city || property.state ? (
                    <div>
                      {[property.city, property.state]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  ) : null}
                  {property.phone || property.email ? (
                    <div className="mt-2 flex flex-wrap gap-4 text-[13px]">
                      {property.phone ? (
                        <a
                          href={`tel:${property.phone}`}
                          className="text-[var(--brand-900)] underline underline-offset-2"
                        >
                          {property.phone}
                        </a>
                      ) : null}
                      {property.email ? (
                        <a
                          href={`mailto:${property.email}`}
                          className="text-[var(--brand-900)] underline underline-offset-2"
                        >
                          {property.email}
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}

// =============================================================================
// Hero
// =============================================================================

function Hero({
  property,
}: {
  property: {
    name: string;
    city: string | null;
    state: string | null;
    heroImageUrl: string | null;
  };
}) {
  if (property.heroImageUrl) {
    return (
      <div className="relative">
        <div className="relative h-[420px] w-full overflow-hidden bg-stone-900 md:h-[520px] lg:h-[640px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={property.heroImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/55" />
        </div>
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-[1280px] px-6 pb-16 md:px-8 md:pb-20">
            <div className="max-w-[680px]">
              {property.city || property.state ? (
                <div className="inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-white/85">
                  <span className="h-px w-8 bg-white/60" />
                  <span>
                    {[property.city, property.state]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              ) : null}
              <h1 className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight text-white md:text-7xl lg:text-[88px]">
                {property.name.toLowerCase()}
              </h1>
            </div>
          </div>
        </div>
      </div>
    );
  }
  // No-hero state: warm tinted block + serif name in the regular flow.
  return (
    <div className="bg-[var(--brand-50)] py-16 md:py-20">
      <div className="mx-auto max-w-[1280px] px-6 md:px-8">
        {property.city || property.state ? (
          <div className="text-[11px] uppercase tracking-[0.22em] text-stone-500">
            {[property.city, property.state].filter(Boolean).join(", ")}
          </div>
        ) : null}
        <h1 className="mt-3 font-serif text-5xl leading-[0.95] tracking-tight text-stone-900 md:text-6xl lg:text-[72px]">
          {property.name.toLowerCase()}
        </h1>
      </div>
    </div>
  );
}

// =============================================================================
// Bookings-not-live state
// =============================================================================

function BookingsNotLiveCard({
  propertyName,
  phone,
  email,
}: {
  propertyName: string;
  phone: string | null;
  email: string | null;
}) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-7 shadow-[0_24px_60px_-24px_rgba(20,15,8,0.25)]">
      <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
        <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
        Online booking
      </div>
      <div className="mt-3 grid grid-cols-12 gap-6 md:gap-8">
        <div className="col-span-12 md:col-span-8">
          <h2 className="font-serif text-[26px] leading-tight text-stone-900 md:text-[28px]">
            Online bookings aren&apos;t live yet at {propertyName}.
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-stone-600">
            Please contact us directly to reserve a site. We answer the phone.
          </p>
        </div>
        <div className="col-span-12 flex flex-col justify-center gap-2 text-[14px] md:col-span-4">
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="text-stone-900 hover:underline"
            >
              {phone}
            </a>
          ) : null}
          {email ? (
            <a
              href={`mailto:${email}`}
              className="text-stone-900 hover:underline"
            >
              {email}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Tiny helpers
// =============================================================================

function LedgerKv({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div className="grid grid-cols-5 gap-3 border-b border-dotted border-stone-200 pb-3 last:border-0 last:pb-0">
      <dt className="col-span-2 text-stone-500">{k}</dt>
      <dd className="col-span-3 text-stone-900">{v}</dd>
    </div>
  );
}

function PhotoMosaic({
  images,
}: {
  images: ReadonlyArray<{ url: string; caption: string | null }>;
}) {
  if (images.length >= 4) {
    return (
      <div className="mt-8 grid grid-cols-2 gap-2 md:grid-cols-12 md:gap-3">
        <Figure
          img={images[0]!}
          className="md:col-span-7 md:row-span-2 md:aspect-[16/11]"
        />
        <Figure img={images[1]!} className="md:col-span-5 md:aspect-[4/3]" />
        <Figure img={images[2]!} className="md:col-span-5 md:aspect-[4/3]" />
        {images[3] ? (
          <Figure
            img={images[3]}
            className="md:col-span-4 md:aspect-[4/3]"
          />
        ) : null}
        {images[4] ? (
          <Figure
            img={images[4]}
            className="md:col-span-4 md:aspect-[4/3]"
          />
        ) : null}
        {images[5] ? (
          <Figure
            img={images[5]}
            className="md:col-span-4 md:aspect-[4/3]"
          />
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-8 grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
      {images.map((img, i) => (
        <Figure key={i} img={img} className="aspect-[4/3]" />
      ))}
    </div>
  );
}

function Figure({
  img,
  className = "",
}: {
  img: { url: string; caption: string | null };
  className?: string;
}) {
  return (
    <a
      href={img.url}
      target="_blank"
      rel="noopener noreferrer"
      title={img.caption ?? ""}
      className={`block overflow-hidden rounded-sm bg-stone-200 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.url}
        alt={img.caption ?? ""}
        className="h-full w-full object-cover transition hover:scale-[1.02]"
      />
    </a>
  );
}
