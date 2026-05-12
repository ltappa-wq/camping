import Link from "next/link";

import { prisma } from "@/lib/prisma";
import {
  checkAvailability,
  type SeasonWindow,
} from "@/lib/availability";
import { formatCents } from "@/lib/money";
import {
  computeQuote,
  PricingError,
  type AddonInput,
  type ChargeUnit,
  type ModifierApplies,
  type ModifierInput,
  type ModifierType,
  type Quote,
  type RatePlanInput,
  type TaxAppliesTo,
  type TaxRateInput,
} from "@/lib/pricing";
import {
  dateNice,
  dow,
  formatTime12,
  PageShell,
  PageTitle,
} from "@/components/public/chrome";
import { SearchForm } from "../_components/search-form";
import {
  effectiveTotalCents,
  getPropertyWithOrgBySlug,
} from "../_lib/property";

const ONE_DAY_MS = 86_400_000;

type SearchParams = {
  from?: string;
  to?: string;
  adults?: string;
  children?: string;
};

function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function validateDates(from: string, to: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return "Invalid check-in date";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) return "Invalid check-out date";
  if (parseDateOnly(from) >= parseDateOnly(to))
    return "Check-out must be after check-in";
  return null;
}

type SiteSpec = {
  electricAmps: number | null;
  hasWater: boolean;
  hasSewer: boolean;
  maxAdults: number | null;
  maxChildren: number | null;
};

type SiteOffer =
  | {
      kind: "available";
      siteId: string;
      label: string;
      siteTypeName: string;
      tags: string[];
      thumbnailUrl: string | null;
      spec: SiteSpec;
      quote: Quote;
    }
  | {
      kind: "unavailable";
      siteId: string;
      label: string;
      siteTypeName: string;
      reason: string;
    };

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const property = await getPropertyWithOrgBySlug(slug);

  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const adults = Math.max(1, Number(sp.adults) || 0);
  const children = Math.max(0, Number(sp.children) || 0);

  const dateError = !from || !to
    ? "Pick check-in and check-out dates."
    : validateDates(from, to);

  const chrome = {
    id: property.id,
    slug: property.slug,
    name: property.name,
    logoUrl: property.logoUrl,
    phone: property.phone,
    primaryColor: property.primaryColor,
  };

  if (dateError) {
    return (
      <PageShell
        property={chrome}
        breadcrumb={{
          label: `Back to ${property.name.toLowerCase()}`,
          href: `/p/${slug}`,
        }}
      >
        <PageTitle lede={dateError}>find a site.</PageTitle>
        <section className="mx-auto max-w-[1280px] px-6 pb-20 pt-10 md:px-8">
          <div className="rounded-md border border-stone-200 bg-white p-6 md:p-7">
            <SearchForm
              slug={slug}
              defaults={{ from, to, adults, children }}
            />
          </div>
        </section>
      </PageShell>
    );
  }

  const checkIn = parseDateOnly(from);
  const checkOut = parseDateOnly(to);
  const now = new Date();

  const [
    siteTypes,
    sites,
    ratePlans,
    modifiers,
    taxRates,
    addons,
    reservations,
    closedRanges,
  ] = await Promise.all([
    prisma.siteType.findMany({
      where: { propertyId: property.id, deletedAt: null },
    }),
    prisma.site.findMany({
      where: {
        propertyId: property.id,
        deletedAt: null,
        active: true,
      },
      include: {
        siteType: true,
        images: { orderBy: { order: "asc" }, take: 1 },
      },
    }),
    prisma.ratePlan.findMany({ where: { propertyId: property.id } }),
    prisma.rateModifier.findMany({ where: { propertyId: property.id } }),
    prisma.taxRate.findMany({ where: { propertyId: property.id } }),
    prisma.addon.findMany({
      where: { propertyId: property.id, active: true },
    }),
    prisma.reservation.findMany({
      where: {
        propertyId: property.id,
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
        OR: [
          { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } },
          { AND: [{ status: "HELD" }, { heldUntil: { gt: now } }] },
        ],
      },
      select: { siteId: true, checkIn: true, checkOut: true },
    }),
    prisma.closedDateRange.findMany({
      where: {
        propertyId: property.id,
        startDate: { lte: checkOut },
        endDate: { gte: checkIn },
      },
      select: { startDate: true, endDate: true },
    }),
  ]);

  const season: SeasonWindow | null =
    property.seasonStartMonth != null &&
    property.seasonStartDay != null &&
    property.seasonEndMonth != null &&
    property.seasonEndDay != null
      ? {
          startMonth: property.seasonStartMonth,
          startDay: property.seasonStartDay,
          endMonth: property.seasonEndMonth,
          endDay: property.seasonEndDay,
        }
      : null;

  const ratePlanInputs: RatePlanInput[] = ratePlans.map((p) => ({
    id: p.id,
    name: p.name,
    siteTypeId: p.siteTypeId,
    chargeUnit: p.chargeUnit as ChargeUnit,
    pricePerUnitCents: p.pricePerUnitCents,
    minStayDays: p.minStayDays,
    maxStayDays: p.maxStayDays,
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo,
    priority: p.priority,
    active: p.active,
  }));
  const modifierInputs: ModifierInput[] = modifiers.map((m) => ({
    id: m.id,
    name: m.name,
    siteTypeId: m.siteTypeId,
    modifierType: m.modifierType as ModifierType,
    modifierValue: m.modifierValue,
    appliesTo: m.appliesTo as ModifierApplies,
    daysOfWeek: m.daysOfWeek,
    startDate: m.startDate,
    endDate: m.endDate,
    priority: m.priority,
    active: m.active,
  }));
  const taxRateInputs: TaxRateInput[] = taxRates.map((t) => ({
    id: t.id,
    name: t.name,
    basisPoints: t.basisPoints,
    appliesTo: t.appliesTo as TaxAppliesTo,
    active: t.active,
  }));
  const addonInputs: AddonInput[] = addons.map((a) => ({
    id: a.id,
    name: a.name,
    priceCents: a.priceCents,
    quantity: 0,
  }));

  const blockingBySite = new Map<string, { checkIn: Date; checkOut: Date }[]>();
  for (const r of reservations) {
    const list = blockingBySite.get(r.siteId) ?? [];
    list.push({ checkIn: r.checkIn, checkOut: r.checkOut });
    blockingBySite.set(r.siteId, list);
  }

  const offers: SiteOffer[] = sites
    .filter((s) => siteTypes.some((st) => st.id === s.siteTypeId))
    .map((site): SiteOffer => {
      const st = site.siteType;
      if (st.maxAdults != null && adults > st.maxAdults) {
        return {
          kind: "unavailable",
          siteId: site.id,
          label: site.label,
          siteTypeName: st.name,
          reason: `Max ${st.maxAdults} adult${st.maxAdults === 1 ? "" : "s"}`,
        };
      }
      if (st.maxChildren != null && children > st.maxChildren) {
        return {
          kind: "unavailable",
          siteId: site.id,
          label: site.label,
          siteTypeName: st.name,
          reason: `Max ${st.maxChildren} child${st.maxChildren === 1 ? "" : "ren"}`,
        };
      }

      const avail = checkAvailability({
        checkIn,
        checkOut,
        reservations: blockingBySite.get(site.id) ?? [],
        closedRanges,
        season,
      });
      if (!avail.available) {
        return {
          kind: "unavailable",
          siteId: site.id,
          label: site.label,
          siteTypeName: st.name,
          reason: avail.reasons[0] ?? "Unavailable",
        };
      }

      try {
        const quote = computeQuote({
          checkIn,
          checkOut,
          siteTypeId: site.siteTypeId,
          ratePlans: ratePlanInputs,
          modifiers: modifierInputs,
          taxRates: taxRateInputs,
          addons: addonInputs,
        });
        return {
          kind: "available",
          siteId: site.id,
          label: site.label,
          siteTypeName: st.name,
          tags: site.tags,
          thumbnailUrl: site.images[0]?.url ?? null,
          spec: {
            electricAmps: st.electricAmps,
            hasWater: st.hasWater,
            hasSewer: st.hasSewer,
            maxAdults: st.maxAdults,
            maxChildren: st.maxChildren,
          },
          quote,
        };
      } catch (e) {
        if (e instanceof PricingError) {
          return {
            kind: "unavailable",
            siteId: site.id,
            label: site.label,
            siteTypeName: st.name,
            reason: e.message,
          };
        }
        throw e;
      }
    });

  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  offers.sort((a, b) => collator.compare(a.label, b.label));

  const available = offers.filter(
    (o): o is Extract<SiteOffer, { kind: "available" }> =>
      o.kind === "available",
  );
  const unavailable = offers.filter(
    (o): o is Extract<SiteOffer, { kind: "unavailable" }> =>
      o.kind === "unavailable",
  );
  const nights = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / ONE_DAY_MS,
  );
  const partyLabel = `${adults} adult${adults === 1 ? "" : "s"}${
    children ? `, ${children} child${children === 1 ? "" : "ren"}` : ""
  }`;

  return (
    <PageShell
      property={chrome}
      breadcrumb={{
        label: `Back to ${property.name.toLowerCase()}`,
        href: `/p/${slug}`,
      }}
    >
      <PageTitle
        lede={
          available.length === 0
            ? "Try different dates or a smaller party. Unavailable sites are listed below with the reason."
            : `Pick a site to continue to checkout. Total includes taxes and fees; you won't be charged until you confirm.`
        }
      >
        {available.length === 0
          ? "no sites available."
          : `${available.length} site${
              available.length === 1 ? "" : "s"
            } for your dates.`}
      </PageTitle>

      {/* Trip strip — fixed-format itinerary card with Edit-search dropdown */}
      <section className="mx-auto mt-8 max-w-[1280px] px-6 md:mt-10 md:px-8">
        <div className="overflow-hidden rounded-md border border-stone-200 bg-white shadow-[0_24px_60px_-24px_rgba(20,15,8,0.18)]">
          <div className="grid grid-cols-1 divide-y divide-stone-200 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
            <TripCell label="Check-in" big={dateNice(from)} sub={`${dow(from)} · after ${formatTime12(property.checkInTime)}`} className="lg:col-span-3" />
            <TripCell label="Check-out" big={dateNice(to)} sub={`${dow(to)} · by ${formatTime12(property.checkOutTime)}`} className="lg:col-span-3" />
            <TripCell label="Nights" big={String(nights)} sub={nights === 1 ? "1 night" : `${nights} nights`} className="lg:col-span-2" />
            <TripCell label="Party" big={String(adults + children)} sub={partyLabel} className="lg:col-span-2" />
            <details className="group p-6 lg:col-span-2">
              <summary className="flex cursor-pointer items-center justify-end text-[13px] text-stone-700 hover:text-stone-900 [&::-webkit-details-marker]:hidden">
                Edit search
              </summary>
              <div className="mt-4">
                <SearchForm
                  slug={slug}
                  defaults={{ from, to, adults, children }}
                />
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="mx-auto max-w-[1280px] px-6 pb-20 pt-12 md:px-8">
        {available.length === 0 ? (
          <div className="rounded-md border border-dashed border-stone-300 bg-white p-10 text-center md:p-12">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
              No availability
            </div>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-stone-600">
              {unavailable.length > 0
                ? `All ${unavailable.length} site${
                    unavailable.length === 1 ? " is" : "s are"
                  } taken or closed for ${dateNice(from)} – ${dateNice(to)}.`
                : "There are no sites set up to take bookings for these dates."}
            </p>
            {property.phone ? (
              <p className="mt-4 text-[14px] text-stone-700">
                Or call{" "}
                <a
                  href={`tel:${property.phone}`}
                  className="underline underline-offset-4 hover:text-stone-900"
                >
                  {property.phone}
                </a>
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
                Available sites · {available.length}
              </div>
              <div className="text-[12px] text-stone-500">
                Sorted by site number
              </div>
            </div>
            <ul className="space-y-3">
              {available.map((o) => (
                <SiteCard
                  key={o.siteId}
                  offer={o}
                  slug={slug}
                  from={from}
                  to={to}
                  adults={adults}
                  children={children}
                  nights={nights}
                  totalCents={effectiveTotalCents(
                    o.quote.totalCents,
                    property.organization,
                  )}
                />
              ))}
            </ul>
          </>
        )}

        {unavailable.length > 0 ? (
          <div className="mt-14">
            <div className="flex items-baseline justify-between border-b border-stone-200 pb-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
                Unavailable for these dates · {unavailable.length}
              </div>
              <div className="text-[11.5px] text-stone-400">
                Reasons shown below
              </div>
            </div>
            <ul className="divide-y divide-stone-200/80">
              {unavailable.map((o) => (
                <li
                  key={o.siteId}
                  className="grid grid-cols-12 items-baseline gap-4 py-3.5 text-[13.5px] sm:gap-6"
                >
                  <div className="col-span-3 font-serif text-[18px] leading-none text-stone-400 tabular-nums sm:col-span-2">
                    site {o.label}
                  </div>
                  <div className="col-span-9 text-[12px] uppercase tracking-[0.16em] text-stone-400 sm:col-span-4">
                    {o.siteTypeName}
                  </div>
                  <div className="col-span-12 text-stone-500 sm:col-span-6 sm:text-right">
                    {o.reason}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </PageShell>
  );
}

function TripCell({
  label,
  big,
  sub,
  className = "",
}: {
  label: string;
  big: string;
  sub: string;
  className?: string;
}) {
  return (
    <div className={`p-6 ${className}`}>
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
        {label}
      </div>
      <div className="mt-1.5 font-serif text-[28px] leading-none text-stone-900">
        {big}
      </div>
      <div className="mt-1 text-[12px] text-stone-500">{sub}</div>
    </div>
  );
}

function SiteCard({
  offer,
  slug,
  from,
  to,
  adults,
  children,
  nights,
  totalCents,
}: {
  offer: Extract<SiteOffer, { kind: "available" }>;
  slug: string;
  from: string;
  to: string;
  adults: number;
  children: number;
  nights: number;
  totalCents: number;
}) {
  const checkoutHref = `/p/${slug}/checkout?siteId=${offer.siteId}&from=${from}&to=${to}&adults=${adults}&children=${children}`;
  const nightlyCents = Math.round(offer.quote.totalCents / Math.max(nights, 1));
  return (
    <li className="overflow-hidden rounded-md border border-stone-200 bg-white shadow-[0_8px_24px_-12px_rgba(20,15,8,0.12)] transition hover:shadow-[0_16px_40px_-16px_rgba(20,15,8,0.18)]">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Thumbnail */}
        <div className="aspect-[16/10] bg-stone-100 lg:col-span-3 lg:aspect-auto">
          {offer.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offer.thumbnailUrl}
              alt={`Site ${offer.label}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center bg-[var(--brand-50)] p-6">
              <div className="font-serif text-[44px] leading-none text-[var(--brand-900)]/40">
                {offer.label}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="border-stone-200 p-5 md:p-6 lg:col-span-6 lg:border-l">
          <div className="flex items-baseline gap-3">
            <h3 className="font-serif text-[24px] leading-none text-stone-900 md:text-[28px]">
              site {offer.label}
            </h3>
            <span className="text-[12px] uppercase tracking-[0.18em] text-stone-500">
              {offer.siteTypeName}
            </span>
          </div>

          <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-stone-600">
            {offer.spec.electricAmps != null ? (
              <SpecChip k="Electric" v={`${offer.spec.electricAmps}A`} />
            ) : null}
            <SpecChip k="Water" v={offer.spec.hasWater ? "Yes" : "No"} />
            <SpecChip k="Sewer" v={offer.spec.hasSewer ? "Yes" : "No"} />
            {offer.spec.maxAdults != null ? (
              <SpecChip
                k="Max"
                v={`${offer.spec.maxAdults}A${
                  offer.spec.maxChildren ? ` · ${offer.spec.maxChildren}C` : ""
                }`}
              />
            ) : null}
          </dl>

          {offer.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {offer.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full border border-stone-300 bg-transparent px-2.5 py-0.5 text-[11.5px] font-medium text-stone-700"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Price + CTA */}
        <div className="flex flex-col justify-between gap-4 border-stone-200 p-5 md:p-6 lg:col-span-3 lg:border-l">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
              Total
            </div>
            <div className="mt-1.5 font-serif text-[28px] leading-none text-stone-900 tabular-nums md:text-[32px]">
              {formatCents(totalCents)}
            </div>
            <div className="mt-2 text-[11.5px] leading-tight text-stone-500 tabular-nums">
              {formatCents(nightlyCents)} × {nights} night{nights === 1 ? "" : "s"}
              <br />
              <span className="text-stone-400">+ taxes &amp; fees</span>
            </div>
          </div>
          <Link
            href={checkoutHref}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--brand)] px-4 text-[13.5px] font-medium tracking-tight text-white transition hover:opacity-90"
          >
            Book this site →
          </Link>
        </div>
      </div>
    </li>
  );
}

function SpecChip({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10.5px] uppercase tracking-[0.16em] text-stone-400">
        {k}
      </span>
      <span className="font-medium text-stone-800">{v}</span>
    </div>
  );
}
