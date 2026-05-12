import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { requireGuestSession } from "@/lib/guest-auth";
import {
  dateNice,
  EmptyState,
  nightsBetween,
  PageShell,
  StatusPill,
} from "@/components/public/chrome";
import { getPropertyBySlug } from "../_lib/property";
import { guestSignOutAction } from "./actions";
import { PaymentMethodsCard } from "./_components/payment-methods-card";

const ONE_DAY_MS = 86_400_000;

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

type Reservation = {
  id: string;
  confirmationCode: string;
  checkIn: Date;
  checkOut: Date;
  site: { label: string; siteType: { name: string } };
  totalCents: number;
  status: string;
};

export default async function PortalHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireGuestSession(slug);
  const property = await getPropertyBySlug(slug);

  const guest = await prisma.guest.findUnique({
    where: { id: session.guestId },
    select: { stripeCustomerId: true },
  });

  const reservations = await prisma.reservation.findMany({
    where: {
      guestId: session.guestId,
      propertyId: session.propertyId,
      status: {
        in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"],
      },
    },
    include: {
      site: { select: { label: true, siteType: { select: { name: true } } } },
    },
    orderBy: { checkIn: "asc" },
  });

  const today = todayUtc();
  const upcoming: Reservation[] = [];
  const current: Reservation[] = [];
  const past: Reservation[] = [];
  for (const r of reservations) {
    if (
      r.status === "CHECKED_OUT" ||
      r.status === "CANCELLED" ||
      r.status === "NO_SHOW"
    ) {
      past.push(r);
      continue;
    }
    if (r.status === "CHECKED_IN") {
      current.push(r);
      continue;
    }
    // CONFIRMED — partition by date relative to today.
    if (
      r.checkIn.getTime() <= today.getTime() &&
      r.checkOut.getTime() > today.getTime()
    ) {
      current.push(r);
    } else if (r.checkOut.getTime() <= today.getTime()) {
      past.push(r);
    } else {
      upcoming.push(r);
    }
  }

  const empty = reservations.length === 0;

  const chrome = {
    id: property.id,
    slug: property.slug,
    name: property.name,
    logoUrl: property.logoUrl,
    phone: property.phone,
    primaryColor: property.primaryColor,
  };

  return (
    <PageShell property={chrome}>
      <section className="mx-auto max-w-[1280px] px-6 pt-4 md:px-8">
        <div className="grid grid-cols-12 gap-6 md:gap-12">
          <div className="col-span-12 lg:col-span-9">
            <h1 className="font-serif text-5xl leading-[0.98] tracking-tight text-stone-900 md:text-6xl lg:text-[64px]">
              your bookings.
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-stone-600">
              Signed in as{" "}
              <span className="text-stone-900">{session.email}</span>. Open any
              booking to view details, modify, or cancel.
            </p>
          </div>
          <div className="col-span-12 flex items-start justify-end pt-3 lg:col-span-3">
            <form action={guestSignOutAction}>
              <input type="hidden" name="slug" value={slug} />
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md border border-stone-300 bg-white px-3 text-[13px] font-medium text-stone-700 hover:bg-stone-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] space-y-10 px-6 pb-20 pt-12 md:px-8">
        {empty ? (
          <EmptyState
            kicker="No bookings yet"
            title="Your stays will live here."
            body="Once you book a site, you'll be able to view, modify, and cancel it from this page."
            actions={
              <Link
                href={`/p/${slug}`}
                className="inline-flex h-10 items-center rounded-md bg-[var(--brand)] px-4 text-[13.5px] font-medium text-white hover:opacity-90"
              >
                Find a site at {property.name} →
              </Link>
            }
          />
        ) : null}

        {/* Payment methods — show even in the empty state so guests
            understand the lifecycle. */}
        <PaymentMethodsCard
          slug={slug}
          hasSavedCustomer={Boolean(guest?.stripeCustomerId)}
        />

        {current.length > 0 ? (
          <PortalSection
            title="Currently staying"
            rows={current}
            slug={slug}
            highlight
          />
        ) : null}

        {!empty && upcoming.length === 0 && current.length === 0 ? (
          <PortalSection
            title="Upcoming"
            rows={[]}
            slug={slug}
            emptyText={`No upcoming stays.`}
            propertyName={property.name}
          />
        ) : null}

        {upcoming.length > 0 ? (
          <PortalSection title="Upcoming" rows={upcoming} slug={slug} />
        ) : null}

        {past.length > 0 ? (
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
              Past stays · {past.length}
            </div>
            <ul className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
              {past.map((r) => (
                <PastRow key={r.id} r={r} slug={slug} />
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </PageShell>
  );
}

function PortalSection({
  title,
  rows,
  slug,
  highlight = false,
  emptyText,
  propertyName,
}: {
  title: string;
  rows: Reservation[];
  slug: string;
  highlight?: boolean;
  emptyText?: string;
  propertyName?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-[26px] leading-tight text-stone-900 md:text-[28px]">
          {title.toLowerCase()}
        </h2>
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
          {rows.length === 0 ? "—" : String(rows.length)}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-stone-300 bg-white p-8 text-center text-[14px] text-stone-500">
          {emptyText}
          {propertyName ? (
            <>
              {" "}
              <Link
                href={`/p/${slug}`}
                className="ml-1 text-stone-700 underline underline-offset-4 hover:text-stone-900"
              >
                Browse sites →
              </Link>
            </>
          ) : null}
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((r) => (
            <BookingCard
              key={r.id}
              r={r}
              slug={slug}
              highlight={highlight}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingCard({
  r,
  slug,
  highlight,
}: {
  r: Reservation;
  slug: string;
  highlight: boolean;
}) {
  const checkInIso = r.checkIn.toISOString().slice(0, 10);
  const checkOutIso = r.checkOut.toISOString().slice(0, 10);
  const nights = nightsBetween(checkInIso, checkOutIso);
  const ring = highlight
    ? "border-emerald-700/20 bg-[#f0f5ef]"
    : "border-stone-200 bg-white";
  return (
    <li>
      <Link
        href={`/p/${slug}/portal/r/${r.confirmationCode}`}
        className={`block overflow-hidden rounded-md border ${ring} shadow-[0_8px_24px_-12px_rgba(20,15,8,0.12)] transition hover:shadow-[0_16px_40px_-16px_rgba(20,15,8,0.18)]`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12">
          <PortalCell label="Stay" className="lg:col-span-3">
            <div className="font-serif text-[22px] leading-none text-stone-900 md:text-[26px]">
              {dateNice(checkInIso)} → {dateNice(checkOutIso)}
            </div>
            <div className="mt-1 text-[12px] text-stone-500">
              {nights} night{nights === 1 ? "" : "s"}
            </div>
          </PortalCell>
          <PortalCell
            label="Site"
            className="border-stone-200 sm:border-l lg:col-span-3"
          >
            <div className="font-serif text-[22px] leading-none text-stone-900 md:text-[26px]">
              {r.site.label}
            </div>
            <div className="mt-1 text-[12px] text-stone-500">
              {r.site.siteType.name}
            </div>
          </PortalCell>
          <PortalCell
            label="Code"
            className="border-stone-200 lg:col-span-3 lg:border-l"
          >
            <div className="font-mono text-[16px] tracking-[0.16em] text-stone-900 md:text-[18px]">
              {r.confirmationCode}
            </div>
            <div className="mt-1.5">
              <StatusPill status={r.status} />
            </div>
          </PortalCell>
          <div className="flex flex-col items-end justify-between border-stone-200 p-5 sm:border-l sm:[&]:border-l lg:col-span-3 lg:border-l md:p-6">
            <div className="text-right">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                Total
              </div>
              <div className="mt-1.5 font-serif text-[24px] leading-none text-stone-900 tabular-nums md:text-[28px]">
                {formatCents(r.totalCents)}
              </div>
            </div>
            <div className="mt-3 text-[13px] text-stone-700">
              View details →
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function PortalCell({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`p-5 md:p-6 ${className}`}>
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PastRow({ r, slug }: { r: Reservation; slug: string }) {
  const checkInIso = r.checkIn.toISOString().slice(0, 10);
  const checkOutIso = r.checkOut.toISOString().slice(0, 10);
  const nights = Math.round(
    (r.checkOut.getTime() - r.checkIn.getTime()) / ONE_DAY_MS,
  );
  return (
    <li>
      <Link
        href={`/p/${slug}/portal/r/${r.confirmationCode}`}
        className="grid grid-cols-12 items-baseline gap-3 py-4 text-[13.5px] hover:bg-stone-50/60 sm:gap-6"
      >
        <div className="col-span-12 font-mono text-[13px] tracking-[0.14em] text-stone-700 sm:col-span-3">
          {r.confirmationCode}
        </div>
        <div className="col-span-6 text-stone-600 tabular-nums sm:col-span-3">
          {dateNice(checkInIso)} → {dateNice(checkOutIso)}
        </div>
        <div className="col-span-6 text-stone-500 sm:col-span-2">
          Site {r.site.label}
        </div>
        <div className="col-span-6 text-stone-500 tabular-nums sm:col-span-2">
          {nights}n · {formatCents(r.totalCents)}
        </div>
        <div className="col-span-6 text-right sm:col-span-2">
          <StatusPill status={r.status} />
        </div>
      </Link>
    </li>
  );
}
