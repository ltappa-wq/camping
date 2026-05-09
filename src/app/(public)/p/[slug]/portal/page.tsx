import Link from "next/link";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { requireGuestSession } from "@/lib/guest-auth";
import { PublicHeader } from "../_components/public-header";
import { getPropertyBySlug } from "../_lib/property";
import { guestSignOutAction } from "./actions";

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  CHECKED_IN: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CHECKED_OUT: "bg-muted text-muted-foreground",
  CANCELLED: "bg-destructive/10 text-destructive",
  NO_SHOW: "bg-destructive/10 text-destructive line-through",
};

const ONE_DAY_MS = 86_400_000;

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export default async function PortalHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireGuestSession(slug);
  const property = await getPropertyBySlug(slug);

  // Guest-scoped query — only reservations belonging to this guest at
  // this property. HELD/DRAFT excluded; those are mid-flow internal
  // states the guest shouldn't see.
  const reservations = await prisma.reservation.findMany({
    where: {
      guestId: session.guestId,
      propertyId: session.propertyId,
      status: {
        in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"],
      },
    },
    include: {
      site: { select: { label: true } },
    },
    orderBy: { checkIn: "asc" },
  });

  const today = todayUtc();
  const upcoming: typeof reservations = [];
  const current: typeof reservations = [];
  const past: typeof reservations = [];
  for (const r of reservations) {
    if (r.status === "CHECKED_OUT" || r.status === "CANCELLED" || r.status === "NO_SHOW") {
      past.push(r);
      continue;
    }
    if (r.status === "CHECKED_IN") {
      current.push(r);
      continue;
    }
    // Status is CONFIRMED — partition by date relative to today.
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

  return (
    <>
      <PublicHeader
        slug={property.slug}
        name={property.name}
        logoUrl={property.logoUrl}
      />
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Your bookings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as {session.email}.
            </p>
          </div>
          <form action={guestSignOutAction}>
            <input type="hidden" name="slug" value={slug} />
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>

        {current.length > 0 ? (
          <ReservationSection
            title="Current stay"
            tone="bg-emerald-500/5 border-emerald-500/30"
            slug={slug}
            rows={current}
          />
        ) : null}

        <ReservationSection
          title="Upcoming"
          tone=""
          slug={slug}
          rows={upcoming}
          emptyState={
            <p className="text-sm text-muted-foreground">
              No upcoming reservations.{" "}
              <Link href={`/p/${slug}`} className="underline">
                Book your next stay at {property.name}
              </Link>
              .
            </p>
          }
        />

        {past.length > 0 ? (
          <details className="rounded-lg border bg-card">
            <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
              Past stays ({past.length})
            </summary>
            <div className="border-t px-5 py-4">
              <ul className="space-y-2">
                {past.map((r) => (
                  <ReservationRow key={r.id} slug={slug} reservation={r} />
                ))}
              </ul>
            </div>
          </details>
        ) : null}
      </main>
    </>
  );
}

function ReservationSection({
  title,
  tone,
  slug,
  rows,
  emptyState,
}: {
  title: string;
  tone: string;
  slug: string;
  rows: Array<{
    id: string;
    confirmationCode: string;
    checkIn: Date;
    checkOut: Date;
    site: { label: string };
    totalCents: number;
    status: string;
  }>;
  emptyState?: React.ReactNode;
}) {
  return (
    <section className={`rounded-lg border bg-card p-5 ${tone}`}>
      <h2 className="text-lg font-medium">{title}</h2>
      {rows.length === 0 ? (
        <div className="mt-3">{emptyState ?? null}</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <ReservationRow key={r.id} slug={slug} reservation={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReservationRow({
  slug,
  reservation: r,
}: {
  slug: string;
  reservation: {
    confirmationCode: string;
    checkIn: Date;
    checkOut: Date;
    site: { label: string };
    totalCents: number;
    status: string;
  };
}) {
  const nights = Math.round(
    (r.checkOut.getTime() - r.checkIn.getTime()) / ONE_DAY_MS,
  );
  return (
    <li>
      <Link
        href={`/p/${slug}/portal/r/${r.confirmationCode}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background/60 p-3 hover:bg-muted/60"
      >
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm">{r.confirmationCode}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {r.checkIn.toISOString().slice(0, 10)} →{" "}
            {r.checkOut.toISOString().slice(0, 10)} · {nights} night
            {nights === 1 ? "" : "s"} · Site {r.site.label}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium tabular-nums">
            {formatCents(r.totalCents)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {r.status.replace("_", " ")}
          </span>
        </div>
      </Link>
    </li>
  );
}
