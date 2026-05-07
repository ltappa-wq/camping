import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { PublicHeader } from "../_components/public-header";
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

type SiteOffer =
  | {
      kind: "available";
      siteId: string;
      label: string;
      siteTypeName: string;
      tags: string[];
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

  const dateError = !from || !to ? "Pick check-in and check-out dates." : validateDates(from, to);

  const header = (
    <PublicHeader
      slug={property.slug}
      name={property.name}
      logoUrl={property.logoUrl}
    />
  );

  if (dateError) {
    return (
      <>
        {header}
        <main className="mx-auto max-w-3xl px-4 py-8">
          <Link
            href={`/p/${slug}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Find a site</h1>
          <div className="mt-6 rounded-lg border bg-card p-6">
            <SearchForm
              slug={slug}
              defaults={{ from, to, adults, children }}
            />
            <p className="mt-3 text-sm text-destructive">{dateError}</p>
          </div>
        </main>
      </>
    );
  }

  const checkIn = parseDateOnly(from);
  const checkOut = parseDateOnly(to);
  const now = new Date();

  const [siteTypes, sites, ratePlans, modifiers, taxRates, addons, reservations, closedRanges] =
    await Promise.all([
      prisma.siteType.findMany({
        where: { propertyId: property.id, deletedAt: null },
      }),
      prisma.site.findMany({
        where: {
          propertyId: property.id,
          deletedAt: null,
          active: true,
        },
        include: { siteType: true },
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
    quantity: 0, // selection happens at checkout
  }));

  // Group blocking reservations by siteId for fast lookup.
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
      // Capacity check based on site-type rules.
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

  // Natural-sort by label so "2" < "10" < "A1" etc.
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  offers.sort((a, b) => collator.compare(a.label, b.label));

  const available = offers.filter(
    (o): o is Extract<SiteOffer, { kind: "available" }> =>
      o.kind === "available",
  );
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / ONE_DAY_MS);

  return (
    <>
      {header}
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href={`/p/${slug}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
        <div className="mt-2">
          <h1 className="text-2xl font-semibold">
            {available.length} available site{available.length === 1 ? "" : "s"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {from} → {to} · {nights} night{nights === 1 ? "" : "s"} · {adults}{" "}
            adult{adults === 1 ? "" : "s"}
            {children > 0
              ? `, ${children} child${children === 1 ? "" : "ren"}`
              : ""}
          </p>
        </div>

        <details className="mt-4 rounded-lg border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Refine search
          </summary>
          <div className="mt-3">
            <SearchForm
              slug={slug}
              defaults={{ from, to, adults, children }}
            />
          </div>
        </details>

        {available.length === 0 ? (
          <div className="mt-6 rounded-md border bg-card p-6 text-center text-muted-foreground">
            No sites available for the selected dates and party size.
            {offers.length > 0
              ? ` ${offers.length} site${offers.length === 1 ? " is" : "s are"} unavailable for these dates.`
              : null}
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {available.map((o) => (
              <li
                key={o.siteId}
                className="rounded-md border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">Site {o.label}</h3>
                      <span className="text-xs text-muted-foreground">
                        · {o.siteTypeName}
                      </span>
                    </div>
                    {o.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {o.tags.map((t) => (
                          <Badge key={t} variant="outline">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-semibold tabular-nums">
                      {formatCents(
                        effectiveTotalCents(
                          o.quote.totalCents,
                          property.organization,
                        ),
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      total · {nights} night{nights === 1 ? "" : "s"}
                    </div>
                    <Button asChild className="mt-2">
                      <Link
                        href={`/p/${slug}/checkout?siteId=${o.siteId}&from=${from}&to=${to}&adults=${adults}&children=${children}`}
                      >
                        Book this site
                      </Link>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {offers.length > available.length ? (
          <details className="mt-6 rounded-md border bg-muted/30 p-4 text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {offers.length - available.length} unavailable site
              {offers.length - available.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-3 space-y-1">
              {offers
                .filter((o): o is Extract<SiteOffer, { kind: "unavailable" }> =>
                  o.kind === "unavailable",
                )
                .map((o) => (
                  <li key={o.siteId} className="text-muted-foreground">
                    Site {o.label} · {o.siteTypeName} —{" "}
                    <span className="text-xs">{o.reason}</span>
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
      </main>
    </>
  );
}
