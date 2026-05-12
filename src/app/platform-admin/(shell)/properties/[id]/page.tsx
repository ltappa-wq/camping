import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlatformTopbar } from "../../_components/platform-topbar";
import { startImpersonationAction } from "../../impersonation-actions";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      siteTypes: {
        where: { deletedAt: null },
        include: { _count: { select: { sites: true } } },
      },
    },
  });
  if (!property) notFound();

  const [siteCount, reservationCount] = await Promise.all([
    prisma.site.count({ where: { propertyId: property.id, deletedAt: null } }),
    prisma.reservation.count({
      where: {
        propertyId: property.id,
        status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
      },
    }),
  ]);

  return (
    <>
      <PlatformTopbar title={property.name} />
      <main className="space-y-6 p-6">
        <Link
          href={`/platform-admin/organizations/${property.organization.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to {property.organization.name}
        </Link>

        <section className="rounded-md border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{property.name}</h2>
              <div className="mt-1 text-xs text-muted-foreground">
                /p/{property.slug} · {siteCount} site{siteCount === 1 ? "" : "s"} ·{" "}
                {reservationCount} reservation{reservationCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/p/${property.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View public booking page ↗
                </a>
              </Button>
              <form action={startImpersonationAction}>
                <input
                  type="hidden"
                  name="organizationId"
                  value={property.organization.id}
                />
                <Button type="submit" size="sm">
                  Act as organization →
                </Button>
              </form>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Kv label="Address">
              {[property.addressLine1, property.city, property.state]
                .filter(Boolean)
                .join(", ") || "—"}
            </Kv>
            <Kv label="Season window">
              {formatSeason(property)}
            </Kv>
            <Kv label="Check-in / out">
              {property.checkInTime} → {property.checkOutTime}
            </Kv>
          </div>
        </section>

        <section className="rounded-md border bg-card">
          <div className="flex items-baseline justify-between border-b p-4">
            <h3 className="text-sm font-medium">Site types</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {property.siteTypes.length}
            </span>
          </div>
          {property.siteTypes.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No site types configured.
            </p>
          ) : (
            <ul className="divide-y">
              {property.siteTypes.map((st) => (
                <li
                  key={st.id}
                  className="flex items-baseline justify-between gap-3 p-4 text-sm"
                >
                  <div>
                    <div className="font-medium">{st.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        st.electricAmps ? `${st.electricAmps}A electric` : null,
                        st.hasWater ? "Water" : null,
                        st.hasSewer ? "Sewer" : null,
                        st.petsAllowed ? "Pets" : null,
                        st.tentsAllowed ? "Tents" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No amenities recorded"}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {st._count.sites} site{st._count.sites === 1 ? "" : "s"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Phase 7b will build map-builder here. Keeping the section in
            place as a hook + visual placeholder. */}
        <section className="rounded-md border border-dashed bg-muted/30 p-5">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Map builder
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Coming in Phase 7b — drag-to-place site coordinates on the
            property map image, with an approval workflow back to the operator.
          </p>
        </section>
      </main>
    </>
  );
}

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

const MONTHS = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatSeason(p: {
  seasonStartMonth: number | null;
  seasonStartDay: number | null;
  seasonEndMonth: number | null;
  seasonEndDay: number | null;
}): string {
  if (
    p.seasonStartMonth == null ||
    p.seasonStartDay == null ||
    p.seasonEndMonth == null ||
    p.seasonEndDay == null
  )
    return "Year-round";
  return `${MONTHS[p.seasonStartMonth]} ${p.seasonStartDay} – ${MONTHS[p.seasonEndMonth]} ${p.seasonEndDay}`;
}
