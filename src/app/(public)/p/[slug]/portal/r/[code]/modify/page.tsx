import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireGuestSession } from "@/lib/guest-auth";
import { checkModificationCutoff } from "@/lib/booking-modification";
import { PublicHeader } from "../../../../_components/public-header";
import { getPropertyBySlug } from "../../../../_lib/property";
import {
  ModifyForm,
  type ModifySite,
  type SerializableModifier,
  type SerializableRatePlan,
} from "./modify-form";

type CancelPolicy = {
  cancelFullRefundDays: number;
  cancelPartialRefundDays: number;
  cancelPartialRefundPct: number;
};

function parseCancelPolicy(json: unknown): CancelPolicy | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (
    typeof o.cancelFullRefundDays !== "number" ||
    typeof o.cancelPartialRefundDays !== "number" ||
    typeof o.cancelPartialRefundPct !== "number"
  ) {
    return null;
  }
  return o as CancelPolicy;
}

export default async function ModifyReservationPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await params;
  const session = await requireGuestSession(slug);
  const property = await getPropertyBySlug(slug);

  const reservation = await prisma.reservation.findFirst({
    where: {
      confirmationCode: code,
      guestId: session.guestId,
      propertyId: session.propertyId,
    },
    include: {
      site: { select: { label: true } },
      lineItems: true,
      property: {
        include: {
          organization: { select: { platformFeeFlatCents: true } },
        },
      },
    },
  });
  if (!reservation) notFound();

  // Status + cutoff guard. Match the detail page's gating; if a guest
  // navigates here for a non-CONFIRMED reservation, push them back.
  const cutoff = checkModificationCutoff({
    guestModificationCutoffHours:
      reservation.property.guestModificationCutoffHours,
    checkInAt: reservation.checkIn,
  });
  if (reservation.status !== "CONFIRMED" || !cutoff.allowed) {
    redirect(`/p/${slug}/portal/r/${code}`);
  }

  // Available sites + pricing fixtures for the form.
  const [allSites, ratePlans, modifiers, taxRates, addons] = await Promise.all([
    prisma.site.findMany({
      where: {
        propertyId: reservation.propertyId,
        deletedAt: null,
        active: true,
      },
      include: { siteType: true },
    }),
    prisma.ratePlan.findMany({ where: { propertyId: reservation.propertyId } }),
    prisma.rateModifier.findMany({
      where: { propertyId: reservation.propertyId },
    }),
    prisma.taxRate.findMany({ where: { propertyId: reservation.propertyId } }),
    prisma.addon.findMany({
      where: { propertyId: reservation.propertyId, active: true },
    }),
  ]);

  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  const sitesForPicker: ModifySite[] = allSites
    .filter((s) => s.siteType.deletedAt == null)
    .sort((a, b) => collator.compare(a.label, b.label))
    .map((s) => ({
      id: s.id,
      label: s.label,
      siteTypeId: s.siteTypeId,
      siteTypeName: s.siteType.name,
    }));

  // Existing add-on quantities (so the recompute prices what the guest
  // already had). Aggregate by addonId in case there are multiple lines.
  const addonQty = new Map<string, number>();
  for (const li of reservation.lineItems) {
    if (li.type === "ADDON" && li.addonId) {
      addonQty.set(li.addonId, (addonQty.get(li.addonId) ?? 0) + li.quantity);
    }
  }
  const reservedAddons = addons
    .filter((a) => addonQty.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      priceCents: a.priceCents,
      quantity: addonQty.get(a.id) ?? 0,
    }));

  const policy = parseCancelPolicy(reservation.cancelPolicySnapshot) ?? {
    cancelFullRefundDays: reservation.property.cancelFullRefundDays,
    cancelPartialRefundDays: reservation.property.cancelPartialRefundDays,
    cancelPartialRefundPct: reservation.property.cancelPartialRefundPct,
  };

  return (
    <>
      <PublicHeader
        slug={property.slug}
        name={property.name}
        logoUrl={property.logoUrl}
      />
      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <Link
          href={`/p/${slug}/portal/r/${code}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to reservation
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Modify your booking</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmation {reservation.confirmationCode} · Site{" "}
            {reservation.site.label} ·{" "}
            {reservation.checkIn.toISOString().slice(0, 10)} →{" "}
            {reservation.checkOut.toISOString().slice(0, 10)}
          </p>
        </div>

        <ModifyForm
          slug={slug}
          code={code}
          currentSiteId={reservation.siteId}
          currentCheckIn={reservation.checkIn.toISOString().slice(0, 10)}
          currentCheckOut={reservation.checkOut.toISOString().slice(0, 10)}
          currentTotalCents={reservation.totalCents}
          currentRemainingPaid={
            reservation.paidCents - reservation.refundedCents
          }
          reservedAddons={reservedAddons}
          sites={sitesForPicker}
          ratePlans={ratePlans.map(
            (p): SerializableRatePlan => ({
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
            }),
          )}
          modifiers={modifiers.map(
            (m): SerializableModifier => ({
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
            }),
          )}
          taxRates={taxRates.map((t) => ({
            id: t.id,
            name: t.name,
            basisPoints: t.basisPoints,
            appliesTo: t.appliesTo as "STAY" | "ADDON" | "ALL",
            active: t.active,
          }))}
          policy={policy}
          platformFeeCents={
            reservation.property.organization.platformFeeFlatCents
          }
        />
      </main>
    </>
  );
}
