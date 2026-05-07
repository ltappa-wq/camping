import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { PublicHeader } from "../../_components/public-header";
import { getPropertyBySlug } from "../../_lib/property";
import { CopyCode } from "./copy-code";
import { HoldingView } from "./holding-view";

const ONE_DAY_MS = 86_400_000;

export const dynamic = "force-dynamic";

type CancelPolicySnapshot = {
  cancelFullRefundDays: number;
  cancelPartialRefundDays: number;
  cancelPartialRefundPct: number;
};

function parseCancelPolicy(json: unknown): CancelPolicySnapshot | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (
    typeof o.cancelFullRefundDays !== "number" ||
    typeof o.cancelPartialRefundDays !== "number" ||
    typeof o.cancelPartialRefundPct !== "number"
  ) {
    return null;
  }
  return o as CancelPolicySnapshot;
}

function formatCancelPolicy(p: CancelPolicySnapshot): string {
  return [
    `Cancel ${p.cancelFullRefundDays}+ days before arrival: full refund.`,
    `Cancel ${p.cancelPartialRefundDays}–${p.cancelFullRefundDays - 1} days before: ${p.cancelPartialRefundPct}% refund.`,
    `Cancel less than ${p.cancelPartialRefundDays} days before: no refund.`,
  ].join(" ");
}

/** "john@gmail.com" → "j***@gmail.com". Hides everything but the first
 *  character of the local part. */
function obfuscateEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, 1)}${"*".repeat(Math.max(2, local.length - 1))}${domain}`;
}

export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await params;
  const property = await getPropertyBySlug(slug);

  const reservation = await prisma.reservation.findFirst({
    where: { confirmationCode: code, propertyId: property.id },
    include: {
      site: { include: { siteType: true } },
      guest: { select: { email: true } },
      lineItems: true,
    },
  });
  if (!reservation) notFound();

  const header = (
    <PublicHeader
      slug={property.slug}
      name={property.name}
      logoUrl={property.logoUrl}
    />
  );

  // HELD — webhook hasn't arrived yet. Render the polling client component;
  // on status change it triggers router.refresh and we re-enter this server
  // component with the new status.
  if (reservation.status === "HELD") {
    return (
      <>
        {header}
        <main className="mx-auto max-w-2xl px-4 py-8">
          <HoldingView slug={slug} code={code} />
        </main>
      </>
    );
  }

  // CANCELLED, DRAFT (shouldn't happen, but defensive) — booking didn't
  // complete. Friendly message + try-again link.
  if (
    reservation.status === "CANCELLED" ||
    reservation.status === "DRAFT" ||
    reservation.status === "NO_SHOW"
  ) {
    return (
      <>
        {header}
        <main className="mx-auto max-w-2xl px-4 py-8">
          <div className="rounded-lg border bg-card p-6">
            <h1 className="text-2xl font-semibold">
              Your booking didn&apos;t complete
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {reservation.cancellationReason ??
                "Payment didn't go through. No charge was made."}{" "}
              You can try again any time — sites for these dates may still be
              available.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/p/${slug}`}>Try again</Link>
              </Button>
              {property.email || property.phone ? (
                <div className="flex flex-col text-xs text-muted-foreground sm:items-end">
                  <span>Need help?</span>
                  {property.email ? (
                    <a
                      href={`mailto:${property.email}`}
                      className="underline hover:text-foreground"
                    >
                      {property.email}
                    </a>
                  ) : null}
                  {property.phone ? (
                    <a
                      href={`tel:${property.phone}`}
                      className="underline hover:text-foreground"
                    >
                      {property.phone}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </main>
      </>
    );
  }

  // CONFIRMED, CHECKED_IN, CHECKED_OUT — full success view.
  const checkInDate = reservation.checkIn.toISOString().slice(0, 10);
  const checkOutDate = reservation.checkOut.toISOString().slice(0, 10);
  const nights = Math.round(
    (reservation.checkOut.getTime() - reservation.checkIn.getTime()) /
      ONE_DAY_MS,
  );
  const policy = parseCancelPolicy(reservation.cancelPolicySnapshot);
  const obfuscatedEmail = obfuscateEmail(reservation.guest.email);
  const addressLines = [
    property.addressLine1,
    property.addressLine2,
    [property.city, property.state, property.postalCode]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);
  const mapsHref = addressLines.length
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLines.join(" "))}`
    : null;

  return (
    <>
      {header}
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <section className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6">
          <h1 className="text-2xl font-semibold">You&apos;re booked!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A confirmation email is on the way to {obfuscatedEmail}.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <code className="rounded bg-background px-3 py-1.5 text-lg font-semibold tracking-wider">
              {reservation.confirmationCode}
            </code>
            <CopyCode code={reservation.confirmationCode} />
          </div>
        </section>

        <section className="space-y-2 rounded-md border bg-card p-4 text-sm">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Booking details
          </h2>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Site</span>
            <span>
              {reservation.site.label} · {reservation.site.siteType.name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dates</span>
            <span>
              {checkInDate} → {checkOutDate} · {nights} night
              {nights === 1 ? "" : "s"}
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
        </section>

        <section className="rounded-md border bg-card p-4 text-sm">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Charges
          </h2>
          <ul className="mt-2 space-y-1">
            {reservation.lineItems.map((li) => (
              <li key={li.id} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{li.description}</span>
                <span
                  className={`tabular-nums ${
                    li.amountCents < 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : ""
                  }`}
                >
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

        {policy ? (
          <section className="rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Cancellation policy</div>
            <p className="mt-1">{formatCancelPolicy(policy)}</p>
          </section>
        ) : null}

        {addressLines.length || property.email || property.phone ? (
          <section className="space-y-3 rounded-md border bg-card p-4 text-sm">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {property.name}
            </h2>
            {addressLines.length ? (
              <div>
                {addressLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                {mapsHref ? (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs underline hover:text-foreground"
                  >
                    Open in Maps
                  </a>
                ) : null}
              </div>
            ) : null}
            {property.email ? (
              <div>
                <span className="text-muted-foreground">Email: </span>
                <a
                  href={`mailto:${property.email}`}
                  className="underline hover:text-foreground"
                >
                  {property.email}
                </a>
              </div>
            ) : null}
            {property.phone ? (
              <div>
                <span className="text-muted-foreground">Phone: </span>
                <a
                  href={`tel:${property.phone}`}
                  className="underline hover:text-foreground"
                >
                  {property.phone}
                </a>
              </div>
            ) : null}
          </section>
        ) : null}

        {property.mapImageUrl ? (
          <section className="rounded-md border bg-card p-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Campground map
            </h2>
            <a
              href={property.mapImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={property.mapImageUrl}
                alt={`${property.name} map`}
                className="w-full rounded border"
              />
            </a>
          </section>
        ) : null}

        {property.directionsText ? (
          <section className="rounded-md border bg-card p-4 text-sm">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Directions
            </h2>
            <p className="mt-2 whitespace-pre-line">{property.directionsText}</p>
          </section>
        ) : null}

        <section className="rounded-md border border-dashed bg-muted/20 p-4 text-sm">
          <h2 className="font-medium">Save your info for next time</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            We&apos;ll send a sign-in link to {obfuscatedEmail} so you can
            view this booking and rebook faster. Coming soon.
          </p>
        </section>
      </main>
    </>
  );
}
