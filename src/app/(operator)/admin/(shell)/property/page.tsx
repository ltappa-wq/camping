import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { PropertyForm } from "./property-form";
import type { PropertyFormValues } from "./schema";

export default async function PropertyPage() {
  const ctx = await requireOperatorPropertyOrSetup();
  const p = ctx.property;

  const defaultValues: PropertyFormValues = {
    name: p.name,
    addressLine1: p.addressLine1 ?? undefined,
    addressLine2: p.addressLine2 ?? undefined,
    city: p.city ?? undefined,
    state: p.state ?? undefined,
    postalCode: p.postalCode ?? undefined,
    phone: p.phone ?? undefined,
    email: p.email ?? undefined,
    logoUrl: p.logoUrl ?? undefined,
    primaryColor: p.primaryColor ?? undefined,
    mapImageUrl: p.mapImageUrl ?? null,
    heroImageUrl: p.heroImageUrl ?? null,
    seasonStartMonth: p.seasonStartMonth,
    seasonStartDay: p.seasonStartDay,
    seasonEndMonth: p.seasonEndMonth,
    seasonEndDay: p.seasonEndDay,
    checkInTime: p.checkInTime,
    checkOutTime: p.checkOutTime,
    cancelFullRefundDays: p.cancelFullRefundDays,
    cancelPartialRefundDays: p.cancelPartialRefundDays,
    cancelPartialRefundPct: p.cancelPartialRefundPct,
    description: p.description ?? undefined,
    rulesText: p.rulesText ?? undefined,
    directionsText: p.directionsText ?? undefined,
    guestModificationCutoffHours: p.guestModificationCutoffHours,
    reminder7DaysEnabled: p.reminder7DaysEnabled,
    reminder3DaysEnabled: p.reminder3DaysEnabled,
    reminderArrivalDayEnabled: p.reminderArrivalDayEnabled,
    reminderPostStayEnabled: p.reminderPostStayEnabled,
    checkInInstructions: p.checkInInstructions ?? undefined,
  };

  return (
    <div>
      <PageHeader
        title="Property"
        description="Settings for your campground."
      />
      <PropertyForm defaultValues={defaultValues} />
    </div>
  );
}
