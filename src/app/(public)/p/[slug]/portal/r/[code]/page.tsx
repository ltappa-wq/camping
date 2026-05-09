import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { requireGuestSession } from "@/lib/guest-auth";
import { computeRefund } from "@/lib/refunds";
import { checkModificationCutoff } from "@/lib/booking-modification";
import { PublicHeader } from "../../../_components/public-header";
import { getPropertyBySlug } from "../../../_lib/property";
import { guestSignOutAction } from "../../actions";
import { CancelButton } from "./cancel/cancel-button";
import { ResendButton } from "./resend/resend-button";

const ONE_DAY_MS = 86_400_000;

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  CHECKED_IN: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CHECKED_OUT: "bg-muted text-muted-foreground",
  CANCELLED: "bg-destructive/10 text-destructive",
  NO_SHOW: "bg-destructive/10 text-destructive line-through",
};

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

function formatCancelPolicy(p: CancelPolicy): string {
  return [
    `Cancel ${p.cancelFullRefundDays}+ days before arrival: full refund.`,
    `Cancel ${p.cancelPartialRefundDays}–${p.cancelFullRefundDays - 1} days before: ${p.cancelPartialRefundPct}% refund.`,
    `Cancel less than ${p.cancelPartialRefundDays} days before: no refund.`,
  ].join(" ");
}

export default async function GuestReservationDetailPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await params;
  const session = await requireGuestSession(slug);
  const property = await getPropertyBySlug(slug);

  // Guest-scoped query — confirmation codes are unique platform-wide,
  // but we additionally require guestId match so a guest can't read
  // another guest's reservation by guessing or sharing a code.
  const reservation = await prisma.reservation.findFirst({
    where: {
      confirmationCode: code,
      guestId: session.guestId,
      propertyId: session.propertyId,
    },
    include: {
      site: { include: { siteType: true } },
      lineItems: { orderBy: { createdAt: "asc" } },
      property: {
        select: {
          guestModificationCutoffHours: true,
          cancelFullRefundDays: true,
          cancelPartialRefundDays: true,
          cancelPartialRefundPct: true,
          organizationId: true,
        },
      },
    },
  });
  if (!reservation) notFound();

  const organization = await prisma.organization.findUnique({
    where: { id: reservation.property.organizationId },
    select: { platformFeeFlatCents: true },
  });

  const checkInDate = reservation.checkIn.toISOString().slice(0, 10);
  const checkOutDate = reservation.checkOut.toISOString().slice(0, 10);
  const nights = Math.round(
    (reservation.checkOut.getTime() - reservation.checkIn.getTime()) /
      ONE_DAY_MS,
  );
  const policy = parseCancelPolicy(reservation.cancelPolicySnapshot);

  // ---- Cancel button gating ----
  const cutoffResult = checkModificationCutoff({
    guestModificationCutoffHours:
      reservation.property.guestModificationCutoffHours,
    checkInAt: reservation.checkIn,
  });
  const canCancel =
    reservation.status === "CONFIRMED" && cutoffResult.allowed;
  // Resend works regardless of cutoff — guests sometimes need their
  // confirmation email after they've checked in.
  const canResend =
    reservation.status === "CONFIRMED" ||
    reservation.status === "CHECKED_IN" ||
    reservation.status === "CHECKED_OUT";

  // Same computeRefund call the cancel server action runs — kept in sync
  // by reusing the same input shape. Used only to populate the modal's
  // suggested-refund display; server re-computes on confirm.
  const effectivePolicy = policy ?? {
    cancelFullRefundDays: reservation.property.cancelFullRefundDays,
    cancelPartialRefundDays: reservation.property.cancelPartialRefundDays,
    cancelPartialRefundPct: reservation.property.cancelPartialRefundPct,
  };
  const todayMidnight = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    ),
  );
  const refundPreview = canCancel
    ? computeRefund({
        paidCents: reservation.paidCents,
        alreadyRefundedCents: reservation.refundedCents,
        checkInDate: reservation.checkIn,
        cancellationDate: todayMidnight,
        policy: effectivePolicy,
        retainPlatformFee: true,
        platformFeeCents: organization?.platformFeeFlatCents ?? 0,
      })
    : null;

  const groupedLineItems = {
    STAY: reservation.lineItems.filter((li) => li.type === "STAY"),
    ADDON: reservation.lineItems.filter((li) => li.type === "ADDON"),
    DISCOUNT: reservation.lineItems.filter((li) => li.type === "DISCOUNT"),
    FEE: reservation.lineItems.filter((li) => li.type === "FEE"),
    TAX: reservation.lineItems.filter((li) => li.type === "TAX"),
  };

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
      <PublicHeader
        slug={property.slug}
        name={property.name}
        logoUrl={property.logoUrl}
      />
      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Link
            href={`/p/${slug}/portal`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to your bookings
          </Link>
          <form action={guestSignOutAction}>
            <input type="hidden" name="slug" value={slug} />
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>

        <header className="rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Confirmation
              </div>
              <code className="mt-1 inline-block rounded bg-background px-2 py-1 text-lg font-semibold tracking-wider">
                {reservation.confirmationCode}
              </code>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                STATUS_TONE[reservation.status] ??
                "bg-muted text-muted-foreground"
              }`}
            >
              {reservation.status.replace("_", " ")}
            </span>
          </div>
          {canCancel && refundPreview ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/p/${slug}/portal/r/${reservation.confirmationCode}/modify`}
                >
                  Modify booking
                </Link>
              </Button>
              <CancelButton
                slug={slug}
                code={reservation.confirmationCode}
                suggestedRefundCents={refundPreview.suggestedRefundCents}
                refundReason={refundPreview.reason}
                paidCents={reservation.paidCents}
                propertyName={property.name}
                checkInDate={checkInDate}
                checkOutDate={checkOutDate}
              />
              {canResend ? (
                <ResendButton
                  slug={slug}
                  code={reservation.confirmationCode}
                  email={session.email}
                />
              ) : null}
            </div>
          ) : canResend ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ResendButton
                slug={slug}
                code={reservation.confirmationCode}
                email={session.email}
              />
            </div>
          ) : null}
          {reservation.status === "CONFIRMED" && !cutoffResult.allowed ? (
            <p className="mt-4 text-xs text-muted-foreground">
              {"reason" in cutoffResult ? cutoffResult.reason : ""}
            </p>
          ) : null}
        </header>

        <Section title="Booking details">
          <dl className="space-y-2 text-sm">
            <DRow label="Site">
              {reservation.site.label} · {reservation.site.siteType.name}
            </DRow>
            <DRow label="Dates">
              {checkInDate} → {checkOutDate} · {nights} night
              {nights === 1 ? "" : "s"}
            </DRow>
            <DRow label="Check-in time">{property.checkInTime}</DRow>
            <DRow label="Check-out time">{property.checkOutTime}</DRow>
          </dl>
          {reservation.guestNotes ? (
            <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Your note from booking
              </div>
              <p className="mt-1 whitespace-pre-line">{reservation.guestNotes}</p>
            </div>
          ) : null}
        </Section>

        <Section title="Pricing">
          <ul className="space-y-1 text-sm">
            {(
              [
                ["Stay", groupedLineItems.STAY],
                ["Add-ons", groupedLineItems.ADDON],
                ["Discounts", groupedLineItems.DISCOUNT],
                ["Fees", groupedLineItems.FEE],
                ["Tax", groupedLineItems.TAX],
              ] as const
            ).map(([heading, lis]) =>
              lis.length > 0 ? (
                <li key={heading} className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {heading}
                  </div>
                  {lis.map((li) => (
                    <div
                      key={li.id}
                      className="flex justify-between gap-2 pl-3"
                    >
                      <span>{li.description}</span>
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
                    </div>
                  ))}
                </li>
              ) : null,
            )}
          </ul>
          <div className="mt-4 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">
                {formatCents(reservation.subtotalCents)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">
                {formatCents(reservation.taxCents)}
              </span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {formatCents(reservation.totalCents)}
              </span>
            </div>
            {reservation.refundedCents > 0 ? (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Refunded</span>
                <span className="tabular-nums">
                  −{formatCents(reservation.refundedCents)}
                </span>
              </div>
            ) : null}
          </div>
        </Section>

        {policy ? (
          <Section title="Cancellation policy">
            <p className="text-sm text-muted-foreground">
              {formatCancelPolicy(policy)}
            </p>
          </Section>
        ) : null}

        {addressLines.length || property.email || property.phone ? (
          <Section title={property.name}>
            <div className="space-y-2 text-sm">
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
            </div>
          </Section>
        ) : null}

        {property.checkInInstructions ? (
          <Section title="Check-in instructions">
            <p className="whitespace-pre-line text-sm">
              {property.checkInInstructions}
            </p>
          </Section>
        ) : null}

        {property.directionsText ? (
          <Section title="Directions">
            <p className="whitespace-pre-line text-sm">
              {property.directionsText}
            </p>
          </Section>
        ) : null}

        {property.mapImageUrl ? (
          <Section title="Campground map">
            <a
              href={property.mapImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={property.mapImageUrl}
                alt={`${property.name} map`}
                className="w-full rounded border"
              />
            </a>
          </Section>
        ) : null}
      </main>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
