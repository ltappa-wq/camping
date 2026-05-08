import Link from "next/link";
import { notFound } from "next/navigation";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-header";
import { formatCents } from "@/lib/money";
import { computeRefund } from "@/lib/refunds";
import { CancelModal } from "./cancel-modal";
import { GuestInfoForm } from "./guest-info-form";
import { OperatorNotesForm } from "./operator-notes-form";
import { ResendButton } from "./resend-button";

const ONE_DAY_MS = 86_400_000;

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

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  HELD: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  CHECKED_IN: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CHECKED_OUT: "bg-muted text-muted-foreground",
  CANCELLED: "bg-destructive/10 text-destructive",
  NO_SHOW: "bg-destructive/10 text-destructive line-through",
  DRAFT: "bg-muted text-muted-foreground",
};

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOperatorPropertyOrSetup();

  const [reservation, organization] = await Promise.all([
    ctx.prisma.reservation.findFirst({
      where: { id },
      include: {
        site: { include: { siteType: true } },
        guest: true,
        lineItems: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { createdAt: "asc" } },
      },
    }),
    ctx.prisma.organization.findUnique({
      where: { id: ctx.organization.id },
      select: { platformFeeFlatCents: true },
    }),
  ]);
  if (!reservation) notFound();

  // The operator who created this reservation, if any (manual bookings).
  const createdByOperator = reservation.createdByOperatorId
    ? await ctx.prisma.operatorUser.findUnique({
        where: { id: reservation.createdByOperatorId },
        select: { name: true, email: true },
      })
    : null;

  const property = ctx.property;
  const checkInDate = reservation.checkIn.toISOString().slice(0, 10);
  const checkOutDate = reservation.checkOut.toISOString().slice(0, 10);
  const nights = Math.round(
    (reservation.checkOut.getTime() - reservation.checkIn.getTime()) /
      ONE_DAY_MS,
  );

  const policy = parseCancelPolicy(reservation.cancelPolicySnapshot);
  const balance =
    reservation.totalCents - reservation.paidCents + reservation.refundedCents;

  const groupedLineItems = {
    STAY: reservation.lineItems.filter((li) => li.type === "STAY"),
    ADDON: reservation.lineItems.filter((li) => li.type === "ADDON"),
    FEE: reservation.lineItems.filter((li) => li.type === "FEE"),
    DISCOUNT: reservation.lineItems.filter((li) => li.type === "DISCOUNT"),
    TAX: reservation.lineItems.filter((li) => li.type === "TAX"),
  };

  const canResend =
    reservation.status === "CONFIRMED" ||
    reservation.status === "CHECKED_IN" ||
    reservation.status === "CHECKED_OUT";

  const canCancel =
    reservation.status !== "CANCELLED" && reservation.status !== "DRAFT";

  const successfulStripePayment = reservation.payments.find(
    (p) =>
      p.paymentMethod === "STRIPE" &&
      p.stripePaymentIntentId &&
      p.status === "SUCCEEDED",
  );

  const refundSuggestion = policy
    ? computeRefund({
        paidCents: reservation.paidCents,
        alreadyRefundedCents: reservation.refundedCents,
        checkInDate: reservation.checkIn,
        cancellationDate: new Date(
          new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
        ),
        policy,
        retainPlatformFee: true,
        platformFeeCents: organization?.platformFeeFlatCents ?? 0,
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/reservations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to reservations
        </Link>
      </div>

      <PageHeader
        title={reservation.confirmationCode}
        description={`${reservation.guest.name} · Site ${reservation.site.label} · ${checkInDate} → ${checkOutDate}`}
        actions={
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              STATUS_TONE[reservation.status] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {reservation.status.replace("_", " ")}
          </span>
        }
      />

      <div className="text-xs text-muted-foreground">
        Last updated {reservation.updatedAt.toLocaleString()}
        {createdByOperator
          ? ` · created by ${createdByOperator.name} (${createdByOperator.email})`
          : reservation.status !== "DRAFT"
            ? " · created via guest checkout"
            : ""}
      </div>

      <div className="flex flex-wrap gap-2">
        <ResendButton
          reservationId={reservation.id}
          guestEmail={reservation.guest.email}
          disabled={!canResend}
        />
        {canCancel ? (
          <CancelModal
            reservationId={reservation.id}
            confirmationCode={reservation.confirmationCode}
            guestName={reservation.guest.name}
            guestEmail={reservation.guest.email}
            siteLabel={reservation.site.label}
            checkInDate={checkInDate}
            checkOutDate={checkOutDate}
            totalCents={reservation.totalCents}
            paidCents={reservation.paidCents}
            alreadyRefundedCents={reservation.refundedCents}
            suggestedRefundCents={refundSuggestion?.suggestedRefundCents ?? 0}
            refundReason={
              refundSuggestion?.reason ??
              "No cancellation policy snapshot available."
            }
            canRefundViaStripe={Boolean(successfulStripePayment)}
          />
        ) : null}
        {/* TODO step 6: Change site / dates. */}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Guest">
          <GuestInfoForm
            initial={{
              reservationId: reservation.id,
              name: reservation.guest.name,
              email: reservation.guest.email,
              phone: reservation.guest.phone ?? "",
              rvMake: reservation.guest.rvMake ?? "",
              rvModel: reservation.guest.rvModel ?? "",
              rvYear: reservation.guest.rvYear?.toString() ?? "",
              rvLengthFt: reservation.guest.rvLengthFt?.toString() ?? "",
              licensePlate: reservation.guest.licensePlate ?? "",
            }}
          />
        </Section>

        <Section title="Booking">
          <dl className="space-y-2 text-sm">
            <DRow label="Site">
              {reservation.site.label} · {reservation.site.siteType.name}
            </DRow>
            <DRow label="Dates">
              {checkInDate} → {checkOutDate}
            </DRow>
            <DRow label="Nights">{nights}</DRow>
            <DRow label="Stay type">
              <span className="capitalize">
                {reservation.stayType.toLowerCase()}
              </span>
            </DRow>
            <DRow label="Check-in">{property.checkInTime}</DRow>
            <DRow label="Check-out">{property.checkOutTime}</DRow>
          </dl>
          {reservation.guestNotes ? (
            <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Note from guest
              </div>
              <p className="mt-1 whitespace-pre-line">{reservation.guestNotes}</p>
            </div>
          ) : null}
        </Section>
      </div>

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
          <div className="flex justify-between">
            <span className="text-muted-foreground">Paid</span>
            <span className="tabular-nums">
              {formatCents(reservation.paidCents)}
            </span>
          </div>
          {reservation.refundedCents > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Refunded</span>
              <span className="tabular-nums">
                −{formatCents(reservation.refundedCents)}
              </span>
            </div>
          ) : null}
          {balance > 0 ? (
            <div className="flex justify-between text-base font-semibold text-destructive">
              <span>Balance owed</span>
              <span className="tabular-nums">{formatCents(balance)}</span>
            </div>
          ) : balance < 0 ? (
            <div className="flex justify-between text-base font-semibold text-emerald-600 dark:text-emerald-400">
              <span>Credit due</span>
              <span className="tabular-nums">{formatCents(-balance)}</span>
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Payments">
        {reservation.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No payments recorded.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {reservation.payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 p-3"
              >
                <div>
                  <div className="font-medium tabular-nums">
                    {formatCents(p.amountCents)}{" "}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {p.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.createdAt.toLocaleString()}
                    {p.stripePaymentIntentId
                      ? ` · ${p.stripePaymentIntentId}`
                      : ""}
                    {p.applicationFeeCents > 0
                      ? ` · platform fee ${formatCents(p.applicationFeeCents)}`
                      : ""}
                  </div>
                </div>
                {p.refundedAmountCents > 0 ? (
                  <Badge variant="outline">
                    Refunded {formatCents(p.refundedAmountCents)}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {/* TODO step 5: Record manual payment button. */}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Operator notes">
          <OperatorNotesForm
            reservationId={reservation.id}
            initial={reservation.guest.notes ?? ""}
          />
        </Section>

        <Section title="Cancellation policy">
          {policy ? (
            <p className="text-sm text-muted-foreground">
              {formatCancelPolicy(policy)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No policy snapshot recorded for this reservation.
            </p>
          )}
        </Section>
      </div>

      <Section title="Activity">
        <ul className="space-y-1 text-sm">
          <TimelineRow
            label="Booking created"
            at={reservation.createdAt}
          />
          {reservation.confirmedAt ? (
            <TimelineRow
              label="Confirmed"
              at={reservation.confirmedAt}
            />
          ) : null}
          {reservation.heldUntil && reservation.status === "HELD" ? (
            <TimelineRow
              label={`Hold expires`}
              at={reservation.heldUntil}
            />
          ) : null}
          {reservation.checkedInAt ? (
            <TimelineRow
              label="Checked in"
              at={reservation.checkedInAt}
            />
          ) : null}
          {reservation.checkedOutAt ? (
            <TimelineRow
              label="Checked out"
              at={reservation.checkedOutAt}
            />
          ) : null}
          {reservation.cancelledAt ? (
            <TimelineRow
              label={`Cancelled${reservation.cancellationReason ? ` — ${reservation.cancellationReason}` : ""}`}
              at={reservation.cancelledAt}
            />
          ) : null}
        </ul>
      </Section>
    </div>
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

function TimelineRow({ label, at }: { label: string; at: Date }) {
  return (
    <li className="flex justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="text-muted-foreground tabular-nums">
        {at.toLocaleString()}
      </span>
    </li>
  );
}
