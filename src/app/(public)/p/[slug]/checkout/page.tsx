import Link from "next/link";

import { prisma } from "@/lib/prisma";
import {
  checkAvailability,
  type SeasonWindow,
} from "@/lib/availability";
import {
  computeQuote,
  PricingError,
  type AddonInput,
  type ChargeUnit,
  type ModifierApplies,
  type ModifierInput,
  type ModifierType,
  type RatePlanInput,
  type TaxAppliesTo,
  type TaxRateInput,
} from "@/lib/pricing";
import {
  DataStrip,
  dateNice,
  dow,
  formatTime12,
  PageShell,
  PageTitle,
} from "@/components/public/chrome";
import { getPropertyWithOrgBySlug } from "../_lib/property";
import { CheckoutForm } from "./checkout-form";

type SearchParams = {
  siteId?: string;
  from?: string;
  to?: string;
  adults?: string;
  children?: string;
};

function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const property = await getPropertyWithOrgBySlug(slug);

  const chrome = {
    id: property.id,
    slug: property.slug,
    name: property.name,
    logoUrl: property.logoUrl,
    phone: property.phone,
    primaryColor: property.primaryColor,
  };

  const errorPage = (msg: string) => (
    <PageShell
      property={chrome}
      breadcrumb={{
        label: `Back to ${property.name.toLowerCase()}`,
        href: `/p/${slug}`,
      }}
    >
      <PageTitle lede={msg}>booking unavailable.</PageTitle>
      <section className="mx-auto max-w-[1280px] px-6 pb-20 pt-10 md:px-8">
        <Link
          href={`/p/${slug}`}
          className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--brand)] px-4 text-[13.5px] font-medium tracking-tight text-white transition hover:opacity-90"
        >
          Back to {property.name.toLowerCase()} →
        </Link>
      </section>
    </PageShell>
  );

  if (
    !sp.siteId ||
    !sp.from ||
    !sp.to ||
    !/^\d{4}-\d{2}-\d{2}$/.test(sp.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(sp.to)
  ) {
    return errorPage("Missing booking details. Please start a new search.");
  }

  const checkIn = parseDateOnly(sp.from);
  const checkOut = parseDateOnly(sp.to);
  if (checkIn >= checkOut) {
    return errorPage("Check-out must be after check-in.");
  }
  const adults = Math.max(1, Number(sp.adults) || 0);
  const children = Math.max(0, Number(sp.children) || 0);

  const site = await prisma.site.findFirst({
    where: {
      id: sp.siteId,
      propertyId: property.id,
      deletedAt: null,
      active: true,
    },
    include: { siteType: true },
  });
  if (!site || site.siteType.deletedAt != null) {
    return errorPage("That site isn't available for booking.");
  }
  if (
    (site.siteType.maxAdults != null && adults > site.siteType.maxAdults) ||
    (site.siteType.maxChildren != null &&
      children > site.siteType.maxChildren)
  ) {
    return errorPage("Site doesn't accommodate your party size.");
  }

  const now = new Date();

  const [ratePlans, modifiers, taxRates, addons, reservations, closedRanges] =
    await Promise.all([
      prisma.ratePlan.findMany({ where: { propertyId: property.id } }),
      prisma.rateModifier.findMany({ where: { propertyId: property.id } }),
      prisma.taxRate.findMany({ where: { propertyId: property.id } }),
      prisma.addon.findMany({
        where: { propertyId: property.id, active: true },
        orderBy: [{ name: "asc" }],
      }),
      prisma.reservation.findMany({
        where: {
          propertyId: property.id,
          siteId: site.id,
          checkIn: { lt: checkOut },
          checkOut: { gt: checkIn },
          OR: [
            { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } },
            { AND: [{ status: "HELD" }, { heldUntil: { gt: now } }] },
          ],
        },
        select: { checkIn: true, checkOut: true },
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

  const avail = checkAvailability({
    checkIn,
    checkOut,
    reservations,
    closedRanges,
    season,
  });
  if (!avail.available) {
    return errorPage(
      avail.reasons[0] ?? "Site is unavailable for those dates.",
    );
  }

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
  const baseAddonInputs: AddonInput[] = addons.map((a) => ({
    id: a.id,
    name: a.name,
    priceCents: a.priceCents,
    quantity: 0,
  }));

  let baseQuote;
  try {
    baseQuote = computeQuote({
      checkIn,
      checkOut,
      siteTypeId: site.siteTypeId,
      ratePlans: ratePlanInputs,
      modifiers: modifierInputs,
      taxRates: taxRateInputs,
      addons: baseAddonInputs,
    });
  } catch (e) {
    if (e instanceof PricingError) return errorPage(e.message);
    throw e;
  }

  const partyLabel = `${adults} adult${adults === 1 ? "" : "s"}${
    children ? `, ${children} child${children === 1 ? "" : "ren"}` : ""
  }`;

  return (
    <PageShell
      property={chrome}
      breadcrumb={{
        label: "Back to results",
        href: `/p/${slug}/search?from=${sp.from}&to=${sp.to}&adults=${adults}&children=${children}`,
      }}
    >
      <PageTitle lede="Tell us who's coming and we'll send a confirmation to your email. You won't be charged until you click through to payment on the next page.">
        confirm your booking.
      </PageTitle>

      <DataStrip
        items={[
          { label: "Site", big: site.label, sub: site.siteType.name },
          {
            label: "Check-in",
            big: dateNice(sp.from),
            sub: `${dow(sp.from)} · after ${formatTime12(property.checkInTime)}`,
          },
          {
            label: "Check-out",
            big: dateNice(sp.to),
            sub: `${dow(sp.to)} · by ${formatTime12(property.checkOutTime)}`,
          },
          {
            label: "Party",
            big: String(adults + children),
            sub: partyLabel,
          },
        ]}
      />

      <section className="mx-auto max-w-[1280px] px-6 pb-20 pt-12 md:px-8">
        <CheckoutForm
          slug={slug}
          siteId={site.id}
          siteLabel={site.label}
          siteTypeName={site.siteType.name}
          from={sp.from}
          to={sp.to}
          adults={adults}
          children={children}
          addons={addons.map((a) => ({
            id: a.id,
            name: a.name,
            priceCents: a.priceCents,
            description: a.description,
            maxQuantity:
              a.inventoryCount == null ? 99 : Math.max(0, a.inventoryCount),
          }))}
          initialQuote={baseQuote}
          bookingFee={
            property.organization.customerPaysPlatformFee
              ? Math.min(
                  Math.max(0, property.organization.platformFeeFlatCents),
                  baseQuote.totalCents,
                )
              : 0
          }
          cancellationPolicy={{
            fullRefundDays: property.cancelFullRefundDays,
            partialRefundDays: property.cancelPartialRefundDays,
            partialRefundPct: property.cancelPartialRefundPct,
          }}
        />
      </section>
    </PageShell>
  );
}
