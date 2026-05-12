import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import {
  DataStrip,
  dateNice,
  dow,
  formatTime12,
  LedgerCard,
  LedgerRow,
  LedgerTotal,
  nightsBetween,
  obfuscateEmail,
  PageShell,
  PageTitle,
} from "@/components/public/chrome";
import { getPropertyBySlug } from "../../_lib/property";
import { CopyCode } from "./copy-code";
import { HoldingView } from "./holding-view";

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

  const chrome = {
    id: property.id,
    slug: property.slug,
    name: property.name,
    logoUrl: property.logoUrl,
    phone: property.phone,
    primaryColor: property.primaryColor,
  };
  const obfuscatedEmail = obfuscateEmail(reservation.guest.email);

  // ---- HELD: webhook hasn't arrived yet, polling client component ----
  if (reservation.status === "HELD") {
    return (
      <PageShell property={chrome}>
        <PageTitle
          lede={
            <>
              We&apos;re waiting for your payment processor to confirm the
              charge. This usually takes a few seconds. Code{" "}
              <span className="font-mono">{reservation.confirmationCode}</span>.
            </>
          }
        >
          finishing up your booking…
        </PageTitle>
        <section className="mx-auto max-w-[1280px] px-6 pb-20 pt-10 md:px-8">
          <HoldingView
            slug={slug}
            code={code}
            obfuscatedEmail={obfuscatedEmail}
          />
        </section>
      </PageShell>
    );
  }

  // ---- CANCELLED / DRAFT / NO_SHOW: didn't complete ----
  if (
    reservation.status === "CANCELLED" ||
    reservation.status === "DRAFT" ||
    reservation.status === "NO_SHOW"
  ) {
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
            reservation.cancellationReason ??
            "Payment didn't go through and no charge was made. Sites for these dates may still be available — give it another go."
          }
        >
          your booking didn&apos;t complete.
        </PageTitle>
        <section className="mx-auto max-w-[1280px] px-6 pb-20 pt-10 md:px-8">
          <div className="flex max-w-[720px] flex-wrap items-center gap-4">
            <Link
              href={`/p/${slug}`}
              className="inline-flex h-12 items-center rounded-md bg-[var(--brand)] px-6 text-[14px] font-medium text-white hover:opacity-90"
            >
              Try again →
            </Link>
            {property.phone ? (
              <a
                href={`tel:${property.phone}`}
                className="text-[14px] text-stone-700 underline underline-offset-4 hover:text-stone-900"
              >
                or call {property.phone}
              </a>
            ) : null}
          </div>
        </section>
      </PageShell>
    );
  }

  // ---- CONFIRMED / CHECKED_IN / CHECKED_OUT: success ----
  const checkInDate = reservation.checkIn.toISOString().slice(0, 10);
  const checkOutDate = reservation.checkOut.toISOString().slice(0, 10);
  const nights = nightsBetween(checkInDate, checkOutDate);
  const policy = parseCancelPolicy(reservation.cancelPolicySnapshot);
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
    <PageShell property={chrome}>
      <section className="mx-auto max-w-[1280px] px-6 pt-8 md:px-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11.5px] font-medium uppercase tracking-[0.18em] text-emerald-800">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          Confirmed
        </div>
      </section>
      <PageTitle
        lede={
          <>
            A confirmation email is on its way to{" "}
            <span className="text-stone-800">{obfuscatedEmail}</span>. Show
            this page (or the email) at check-in.
          </>
        }
      >
        you&apos;re booked.
      </PageTitle>

      {/* Confirmation code — generous, like an actual ticket */}
      <section className="mx-auto mt-8 max-w-[1280px] px-6 md:mt-10 md:px-8">
        <div className="rounded-md border border-stone-200 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(20,15,8,0.18)] md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
                Confirmation code
              </div>
              <div className="mt-2 font-mono text-3xl leading-none tracking-[0.18em] text-stone-900 md:text-4xl">
                {reservation.confirmationCode}
              </div>
            </div>
            <div className="flex gap-2">
              <CopyCode code={reservation.confirmationCode} />
            </div>
          </div>
        </div>
      </section>

      <DataStrip
        items={[
          {
            label: "Site",
            big: reservation.site.label,
            sub: reservation.site.siteType.name,
          },
          {
            label: "Check-in",
            big: dateNice(checkInDate),
            sub: `${dow(checkInDate)} · after ${formatTime12(property.checkInTime)}`,
          },
          {
            label: "Check-out",
            big: dateNice(checkOutDate),
            sub: `${dow(checkOutDate)} · by ${formatTime12(property.checkOutTime)}`,
          },
          {
            label: "Nights",
            big: String(nights),
            sub: nights === 1 ? "1 night" : `${nights} nights`,
          },
        ]}
      />

      <section className="mx-auto max-w-[1280px] px-6 pb-20 pt-12 md:px-8">
        <div className="grid grid-cols-12 gap-6 lg:gap-8">
          {/* Left: charges + cancellation */}
          <div className="col-span-12 space-y-5 lg:col-span-7">
            <LedgerCard title="Charges">
              <dl>
                {reservation.lineItems.map((li) => (
                  <LedgerRow
                    key={li.id}
                    k={li.description}
                    v={
                      li.amountCents < 0
                        ? `−${formatCents(-li.amountCents)}`
                        : formatCents(li.amountCents)
                    }
                    sign={li.amountCents < 0 ? "neg" : undefined}
                  />
                ))}
              </dl>
              <LedgerTotal
                k="Total charged"
                v={formatCents(reservation.totalCents)}
              />
            </LedgerCard>

            {policy ? (
              <LedgerCard title="Cancellation policy" tone="muted">
                <p className="text-[14px] leading-relaxed text-stone-700">
                  Cancel{" "}
                  <span className="font-medium text-stone-900">
                    {policy.cancelFullRefundDays}+ days
                  </span>{" "}
                  before arrival for a full refund. Cancel{" "}
                  <span className="font-medium text-stone-900">
                    {policy.cancelPartialRefundDays}–
                    {policy.cancelFullRefundDays - 1} days
                  </span>{" "}
                  before for a{" "}
                  <span className="font-medium text-stone-900">
                    {policy.cancelPartialRefundPct}% refund
                  </span>
                  . No refund within {policy.cancelPartialRefundDays} days of
                  arrival.
                </p>
              </LedgerCard>
            ) : null}
          </div>

          {/* Right: getting here / next time */}
          <aside className="col-span-12 space-y-5 lg:col-span-5">
            <LedgerCard title="Getting here">
              <div className="text-[14px] leading-relaxed text-stone-700">
                <div className="font-medium text-stone-900">
                  {property.name}
                </div>
                {addressLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
              {property.directionsText ? (
                <p className="mt-4 whitespace-pre-line text-[13.5px] leading-relaxed text-stone-600">
                  {property.directionsText}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-3">
                {mapsHref ? (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-stone-700 underline underline-offset-4 hover:text-stone-900"
                  >
                    Open in Maps
                  </a>
                ) : null}
                {property.phone ? (
                  <a
                    href={`tel:${property.phone}`}
                    className="text-[13px] text-stone-700 underline underline-offset-4 hover:text-stone-900"
                  >
                    {property.phone}
                  </a>
                ) : null}
                {property.email ? (
                  <a
                    href={`mailto:${property.email}`}
                    className="text-[13px] text-stone-700 underline underline-offset-4 hover:text-stone-900"
                  >
                    {property.email}
                  </a>
                ) : null}
              </div>
            </LedgerCard>

            {property.mapImageUrl ? (
              <LedgerCard title="Campground map">
                <a
                  href={property.mapImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-md border border-stone-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={property.mapImageUrl}
                    alt={`${property.name} map`}
                    className="w-full"
                  />
                </a>
              </LedgerCard>
            ) : null}

            <LedgerCard title="Next time" tone="muted">
              <p className="text-[13.5px] leading-relaxed text-stone-700">
                We&apos;ll send a sign-in link to{" "}
                <span className="text-stone-900">{obfuscatedEmail}</span> so
                you can view this booking, modify dates, or rebook with one
                tap.
              </p>
            </LedgerCard>
          </aside>
        </div>
      </section>
    </PageShell>
  );
}
