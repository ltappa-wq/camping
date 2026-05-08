import { config } from "dotenv";
import {
  PrismaClient,
  type ReservationStatus,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

/**
 * Seed a realistic spread of reservations for dogfooding the operator
 * admin. Each row's confirmationCode starts with DOGFOOD- so this script
 * is idempotent: re-running it deletes any existing dogfood rows and
 * re-creates them. Nothing else in the DB is touched.
 *
 * What you get:
 *   - 2 currently checked-in guests (one arrived recently, one mid-stay)
 *   - 5 future CONFIRMED bookings spanning 1–30 days out, mix of refund
 *     tiers if you cancel them
 *   - 2 past CHECKED_OUT bookings (one with a partial prior refund)
 *   - 1 CANCELLED booking with a partial refund
 *   - 1 HELD booking with a heldUntil ~10 minutes out (so the sweeper
 *     won't grab it for a bit)
 *   - 1 CASH-method booking (so the cancel modal hides Stripe refund
 *     fields)
 *
 * STRIPE-method synthetic Payments use fake stripePaymentIntentId values
 * (pi_seed_*). If you click "Confirm cancellation" with a refund > 0
 * on one of these, Stripe will reject with "no such payment_intent" —
 * that's the failure-path UI you'd see in real life if a charge was
 * disputed or the payment intent was removed. Safe to dogfood the
 * happy path without clicking refund-confirm on those.
 *
 * Usage: pnpm seed:dogfood
 */

config();

const SLUG = "monument-point";
const NIGHTLY_CENTS = 4000; // matches the seeded "Nightly" rate plan
const PLATFORM_FEE_CENTS = 300;

type Fixture = {
  code: string;
  guest: { name: string; email: string; phone: string };
  siteIndex: number; // 0-based into the property's sites, sorted by label
  daysFromNow: { checkIn: number; checkOut: number };
  status: ReservationStatus;
  paymentMethod: "STRIPE" | "CASH" | "NONE";
  refundedCents?: number;
  cancellationReason?: string;
  guestNotes?: string;
};

const FIXTURES: Fixture[] = [
  {
    code: "DOGFOOD-001",
    guest: {
      name: "Alice Carter",
      email: "alice.dogfood@example.com",
      phone: "555-0101",
    },
    siteIndex: 0,
    daysFromNow: { checkIn: -2, checkOut: 1 },
    status: "CHECKED_IN",
    paymentMethod: "STRIPE",
  },
  {
    code: "DOGFOOD-002",
    guest: {
      name: "Bob Stevens",
      email: "bob.dogfood@example.com",
      phone: "555-0102",
    },
    siteIndex: 6,
    daysFromNow: { checkIn: -1, checkOut: 3 },
    status: "CHECKED_IN",
    paymentMethod: "STRIPE",
    guestNotes: "Bringing a dog — confirmed pets allowed at booking.",
  },
  {
    code: "DOGFOOD-003",
    guest: {
      name: "Carol Walsh",
      email: "carol.dogfood@example.com",
      phone: "555-0103",
    },
    siteIndex: 4,
    daysFromNow: { checkIn: 1, checkOut: 4 },
    status: "CONFIRMED",
    paymentMethod: "STRIPE",
  },
  {
    code: "DOGFOOD-004",
    guest: {
      name: "David Liu",
      email: "david.dogfood@example.com",
      phone: "555-0104",
    },
    siteIndex: 11,
    daysFromNow: { checkIn: 5, checkOut: 12 },
    status: "CONFIRMED",
    paymentMethod: "STRIPE",
  },
  {
    code: "DOGFOOD-005",
    guest: {
      name: "Emma Brown",
      email: "emma.dogfood@example.com",
      phone: "555-0105",
    },
    siteIndex: 17,
    daysFromNow: { checkIn: 10, checkOut: 14 },
    status: "CONFIRMED",
    paymentMethod: "CASH",
    guestNotes: "Paid in cash at the office — receipt #4521.",
  },
  {
    code: "DOGFOOD-006",
    guest: {
      name: "Frank Garcia",
      email: "frank.dogfood@example.com",
      phone: "555-0106",
    },
    siteIndex: 21,
    daysFromNow: { checkIn: 18, checkOut: 23 },
    status: "CONFIRMED",
    paymentMethod: "STRIPE",
  },
  {
    code: "DOGFOOD-007",
    guest: {
      name: "Grace Kim",
      email: "grace.dogfood@example.com",
      phone: "555-0107",
    },
    siteIndex: 8,
    daysFromNow: { checkIn: 8, checkOut: 10 },
    status: "CONFIRMED",
    paymentMethod: "STRIPE",
  },
  {
    code: "DOGFOOD-008",
    guest: {
      name: "Henry Patel",
      email: "henry.dogfood@example.com",
      phone: "555-0108",
    },
    siteIndex: 13,
    daysFromNow: { checkIn: -10, checkOut: -7 },
    status: "CHECKED_OUT",
    paymentMethod: "STRIPE",
  },
  {
    code: "DOGFOOD-009",
    guest: {
      name: "Iris O'Connor",
      email: "iris.dogfood@example.com",
      phone: "555-0109",
    },
    siteIndex: 24,
    daysFromNow: { checkIn: -25, checkOut: -20 },
    status: "CHECKED_OUT",
    paymentMethod: "STRIPE",
    refundedCents: 2000, // partial post-stay refund (e.g., damage credit reversed)
  },
  {
    code: "DOGFOOD-010",
    guest: {
      name: "Jack Thompson",
      email: "jack.dogfood@example.com",
      phone: "555-0110",
    },
    siteIndex: 29,
    daysFromNow: { checkIn: 7, checkOut: 11 },
    status: "CANCELLED",
    paymentMethod: "STRIPE",
    refundedCents: 5000,
    cancellationReason: "Guest cancelled — schedule conflict.",
  },
  {
    code: "DOGFOOD-011",
    guest: {
      name: "Alice Carter",
      email: "alice.dogfood@example.com",
      phone: "555-0101",
    },
    siteIndex: 10,
    daysFromNow: { checkIn: 14, checkOut: 17 },
    status: "HELD",
    paymentMethod: "NONE",
  },
];

function dateOnly(daysFromNow: number): Date {
  const today = new Date();
  const utc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  utc.setUTCDate(utc.getUTCDate() + daysFromNow);
  return utc;
}

function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round(
    (checkOut.getTime() - checkIn.getTime()) / 86_400_000,
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const property = await prisma.property.findUnique({
      where: { slug: SLUG },
      include: { organization: true },
    });
    if (!property) {
      throw new Error(
        `Property ${SLUG} not found — run \`pnpm db:seed\` first.`,
      );
    }

    const sites = await prisma.site.findMany({
      where: {
        propertyId: property.id,
        deletedAt: null,
        active: true,
      },
      include: { siteType: true },
    });
    if (sites.length === 0) {
      throw new Error("No sites found for monument-point.");
    }
    // Stable order so siteIndex is deterministic across runs.
    const collator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: "base",
    });
    sites.sort((a, b) => collator.compare(a.label, b.label));

    // Idempotency: drop existing dogfood rows. Cascade deletes lineItems
    // and payments via the relation onDelete:Cascade.
    const deleted = await prisma.reservation.deleteMany({
      where: {
        propertyId: property.id,
        confirmationCode: { startsWith: "DOGFOOD-" },
      },
    });
    if (deleted.count > 0) {
      console.log(`Deleted ${deleted.count} existing dogfood reservations.`);
    }

    let created = 0;
    for (const f of FIXTURES) {
      if (f.siteIndex >= sites.length) {
        console.warn(
          `Skipping ${f.code}: siteIndex ${f.siteIndex} out of range.`,
        );
        continue;
      }
      const site = sites[f.siteIndex];

      const guest = await prisma.guest.upsert({
        where: {
          propertyId_email: {
            propertyId: property.id,
            email: f.guest.email,
          },
        },
        update: { name: f.guest.name, phone: f.guest.phone },
        create: {
          propertyId: property.id,
          email: f.guest.email,
          name: f.guest.name,
          phone: f.guest.phone,
        },
      });

      const checkIn = dateOnly(f.daysFromNow.checkIn);
      const checkOut = dateOnly(f.daysFromNow.checkOut);
      const nights = nightsBetween(checkIn, checkOut);
      const subtotalCents = nights * NIGHTLY_CENTS;
      const totalCents = subtotalCents; // no tax in seed

      const now = new Date();
      const heldUntil =
        f.status === "HELD"
          ? new Date(now.getTime() + 10 * 60_000)
          : null;
      const confirmedAt =
        f.status === "CONFIRMED" ||
        f.status === "CHECKED_IN" ||
        f.status === "CHECKED_OUT" ||
        f.status === "CANCELLED"
          ? new Date(now.getTime() - 7 * 86_400_000)
          : null;
      const checkedInAt =
        f.status === "CHECKED_IN" || f.status === "CHECKED_OUT"
          ? new Date(checkIn.getTime() + 14 * 60 * 60_000) // 14:00 same day
          : null;
      const checkedOutAt =
        f.status === "CHECKED_OUT"
          ? new Date(checkOut.getTime() + 11 * 60 * 60_000)
          : null;
      const cancelledAt =
        f.status === "CANCELLED"
          ? new Date(now.getTime() - 2 * 86_400_000)
          : null;

      const paid =
        f.paymentMethod === "NONE" || f.status === "HELD" ? 0 : totalCents;
      const refunded = f.refundedCents ?? 0;

      const reservation = await prisma.reservation.create({
        data: {
          propertyId: property.id,
          siteId: site.id,
          guestId: guest.id,
          confirmationCode: f.code,
          checkIn,
          checkOut,
          stayType: "NIGHTLY",
          status: f.status,
          subtotalCents,
          taxCents: 0,
          totalCents,
          paidCents: paid,
          refundedCents: refunded,
          heldUntil,
          confirmedAt,
          checkedInAt,
          checkedOutAt,
          cancelledAt,
          cancellationReason: f.cancellationReason ?? null,
          guestNotes: f.guestNotes ?? null,
          cancelPolicySnapshot: {
            cancelFullRefundDays: property.cancelFullRefundDays,
            cancelPartialRefundDays: property.cancelPartialRefundDays,
            cancelPartialRefundPct: property.cancelPartialRefundPct,
          },
          lineItems: {
            create: [
              {
                type: "STAY",
                description: `${nights} night${nights === 1 ? "" : "s"} @ ${site.siteType.name}`,
                quantity: 1,
                unitPriceCents: subtotalCents,
                amountCents: subtotalCents,
              },
            ],
          },
        },
      });

      if (f.paymentMethod === "STRIPE") {
        const fakePiId = `pi_seed_${randomBytes(8).toString("hex")}`;
        const paymentStatus =
          refunded === 0
            ? "SUCCEEDED"
            : refunded >= totalCents
              ? "REFUNDED"
              : "PARTIALLY_REFUNDED";
        await prisma.payment.create({
          data: {
            reservationId: reservation.id,
            paymentMethod: "STRIPE",
            stripePaymentIntentId: fakePiId,
            stripeChargeId: `ch_seed_${randomBytes(8).toString("hex")}`,
            stripeConnectedAccountId:
              property.organization.stripeAccountId ?? null,
            amountCents: totalCents,
            applicationFeeCents: PLATFORM_FEE_CENTS,
            refundedAmountCents: refunded,
            currency: "USD",
            status: paymentStatus,
            paymentMethodBrand: "visa",
            paymentMethodLast4: "4242",
          },
        });
      } else if (f.paymentMethod === "CASH") {
        await prisma.payment.create({
          data: {
            reservationId: reservation.id,
            paymentMethod: "CASH",
            stripeConnectedAccountId: null,
            amountCents: totalCents,
            applicationFeeCents: 0,
            refundedAmountCents: 0,
            currency: "USD",
            status: "SUCCEEDED",
            notes: f.guestNotes ?? "Cash collected at office.",
          },
        });
      }

      created++;
      console.log(
        `  ${f.code}  ${f.status.padEnd(12)}  Site ${site.label.padEnd(3)}  ${checkIn.toISOString().slice(0, 10)} → ${checkOut.toISOString().slice(0, 10)}  ${f.guest.name}`,
      );
    }

    console.log("");
    console.log(`Created ${created} dogfood reservations.`);
    console.log(
      `Sign in at /login as ${property.organization.name}'s owner and visit /admin/reservations.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
