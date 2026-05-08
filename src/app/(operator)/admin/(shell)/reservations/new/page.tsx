import Link from "next/link";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/admin/page-header";
import {
  checkAvailability,
  type SeasonWindow,
} from "@/lib/availability";
import {
  NewReservationForm,
  type AvailableSite,
  type SerializableModifier,
  type SerializableRatePlan,
} from "./new-reservation-form";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function tomorrow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function inDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOperatorPropertyOrSetup();
  const sp = await searchParams;

  const fromParam = typeof sp.from === "string" ? sp.from : "";
  const toParam = typeof sp.to === "string" ? sp.to : "";
  const datesValid =
    DATE_RE.test(fromParam) &&
    DATE_RE.test(toParam) &&
    parseDateOnly(fromParam) < parseDateOnly(toParam);

  // Stage 1 — no dates yet, just collect them.
  if (!datesValid) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="New reservation"
          description="Manual booking for walk-ups, phone reservations, or comps."
        />
        <form
          method="get"
          className="rounded-lg border bg-card p-5 space-y-4 max-w-md"
        >
          <p className="text-sm text-muted-foreground">
            Pick the dates first to see which sites are available.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="from">Check-in</Label>
              <Input
                id="from"
                name="from"
                type="date"
                defaultValue={fromParam || tomorrow()}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">Check-out</Label>
              <Input
                id="to"
                name="to"
                type="date"
                defaultValue={toParam || inDays(2)}
                required
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Continue</Button>
            <Button asChild type="button" variant="outline">
              <Link href="/admin/reservations">Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // Stage 2 — dates set; show full form with available sites filtered.
  const checkIn = parseDateOnly(fromParam);
  const checkOut = parseDateOnly(toParam);
  const now = new Date();
  const property = ctx.property;

  const [allSites, ratePlans, modifiers, taxRates, addons, blockingByEverywhere, closedRanges] =
    await Promise.all([
      ctx.prisma.site.findMany({
        where: { deletedAt: null, active: true },
        include: { siteType: true },
      }),
      ctx.prisma.ratePlan.findMany({}),
      ctx.prisma.rateModifier.findMany({}),
      ctx.prisma.taxRate.findMany({}),
      ctx.prisma.addon.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      }),
      ctx.prisma.reservation.findMany({
        where: {
          checkIn: { lt: checkOut },
          checkOut: { gt: checkIn },
          OR: [
            { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } },
            { AND: [{ status: "HELD" }, { heldUntil: { gt: now } }] },
          ],
        },
        select: { siteId: true, checkIn: true, checkOut: true },
      }),
      ctx.prisma.closedDateRange.findMany({
        where: {
          startDate: { lte: checkOut },
          endDate: { gte: checkIn },
        },
        select: { startDate: true, endDate: true },
      }),
    ]);

  const blockingBySite = new Map<
    string,
    { checkIn: Date; checkOut: Date }[]
  >();
  for (const r of blockingByEverywhere) {
    const list = blockingBySite.get(r.siteId) ?? [];
    list.push({ checkIn: r.checkIn, checkOut: r.checkOut });
    blockingBySite.set(r.siteId, list);
  }

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

  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  const availableSites: AvailableSite[] = allSites
    .filter((s) => s.siteType.deletedAt == null)
    .filter((s) => {
      const avail = checkAvailability({
        checkIn,
        checkOut,
        reservations: blockingBySite.get(s.id) ?? [],
        closedRanges,
        season,
      });
      return avail.available;
    })
    .sort((a, b) => collator.compare(a.label, b.label))
    .map((s) => ({
      id: s.id,
      label: s.label,
      siteTypeId: s.siteTypeId,
      siteTypeName: s.siteType.name,
      tags: s.tags,
    }));

  const serializableRatePlans: SerializableRatePlan[] = ratePlans.map((p) => ({
    id: p.id,
    name: p.name,
    siteTypeId: p.siteTypeId,
    chargeUnit: p.chargeUnit,
    pricePerUnitCents: p.pricePerUnitCents,
    minStayDays: p.minStayDays,
    maxStayDays: p.maxStayDays,
    effectiveFrom: p.effectiveFrom?.toISOString() ?? null,
    effectiveTo: p.effectiveTo?.toISOString() ?? null,
    priority: p.priority,
    active: p.active,
  }));
  const serializableModifiers: SerializableModifier[] = modifiers.map((m) => ({
    id: m.id,
    name: m.name,
    siteTypeId: m.siteTypeId,
    modifierType: m.modifierType,
    modifierValue: m.modifierValue,
    appliesTo: m.appliesTo,
    daysOfWeek: m.daysOfWeek,
    startDate: m.startDate?.toISOString() ?? null,
    endDate: m.endDate?.toISOString() ?? null,
    priority: m.priority,
    active: m.active,
  }));

  const nights = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / 86_400_000,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="New reservation"
        description={`${fromParam} → ${toParam} · ${nights} night${nights === 1 ? "" : "s"}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/reservations/new">Change dates</Link>
          </Button>
        }
      />
      <NewReservationForm
        from={fromParam}
        to={toParam}
        sites={availableSites}
        ratePlans={serializableRatePlans}
        modifiers={serializableModifiers}
        taxRates={taxRates.map((t) => ({
          id: t.id,
          name: t.name,
          basisPoints: t.basisPoints,
          appliesTo: t.appliesTo as "STAY" | "ADDON" | "ALL",
          active: t.active,
        }))}
        addons={addons.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          priceCents: a.priceCents,
          maxQuantity: a.inventoryCount == null ? 99 : Math.max(0, a.inventoryCount),
        }))}
      />
    </div>
  );
}
