import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { PublicHeader } from "../../_components/public-header";
import { getPropertyBySlug } from "../../_lib/property";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const property = await getPropertyBySlug(slug);

  const reservation = await prisma.reservation.findFirst({
    where: { id, propertyId: property.id },
    include: {
      site: { include: { siteType: true } },
      guest: true,
      lineItems: true,
    },
  });
  if (!reservation) notFound();

  const isConfirmed = reservation.status === "CONFIRMED";
  const isHeld = reservation.status === "HELD";

  return (
    <>
      <PublicHeader
        slug={property.slug}
        name={property.name}
        logoUrl={property.logoUrl}
      />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div
          className={`rounded-lg border p-6 ${
            isConfirmed ? "border-emerald-500/50 bg-emerald-500/5" : "bg-card"
          }`}
        >
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {isConfirmed
              ? "Booking confirmed"
              : isHeld
                ? "Booking received"
                : "Reservation"}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">
            {reservation.confirmationCode}
          </h1>
          <p className="mt-2 text-sm">
            {isConfirmed
              ? `A confirmation email is on the way to ${reservation.guest.email}.`
              : isHeld
                ? `Payment is being processed. We'll email ${reservation.guest.email} once it's confirmed.`
                : `Status: ${reservation.status}`}
          </p>
        </div>

        <section className="mt-6 space-y-2 rounded-md border bg-card p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Site</span>
            <span>
              {reservation.site.label} · {reservation.site.siteType.name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dates</span>
            <span>
              {reservation.checkIn.toISOString().slice(0, 10)} →{" "}
              {reservation.checkOut.toISOString().slice(0, 10)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Check-in</span>
            <span>{property.checkInTime}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Check-out</span>
            <span>{property.checkOutTime}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={isConfirmed ? "default" : "secondary"}>
              {reservation.status}
            </Badge>
          </div>
        </section>

        <section className="mt-4 rounded-md border bg-card p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Charges
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {reservation.lineItems.map((li) => (
              <li key={li.id} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{li.description}</span>
                <span className="tabular-nums">
                  {li.amountCents < 0
                    ? `−${formatCents(-li.amountCents)}`
                    : formatCents(li.amountCents)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {formatCents(reservation.totalCents)}
            </span>
          </div>
        </section>

        <Link
          href={`/p/${slug}`}
          className="mt-6 inline-block text-sm underline"
        >
          Back to {property.name}
        </Link>
      </main>
    </>
  );
}
