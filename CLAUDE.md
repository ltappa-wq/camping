# Camping — Campsite Booking SaaS

A multi-tenant campsite/RV park booking platform. Operators manage their inventory and reservations; guests book online via a property-specific URL (`/p/[slug]`).

## Tech Stack

- **Framework**: Next.js 15 (App Router), TypeScript
- **Database**: Postgres (Neon)
- **ORM**: Prisma
- **Styling**: Tailwind CSS + shadcn/ui (components copied into `src/components/ui`, not a dependency)
- **Auth**: Auth.js v5 (NextAuth) — email magic-link only, no passwords
- **Payments**: Stripe Connect Express (operators connect their own accounts; platform takes a configurable per-booking fee via `application_fee_amount`)
- **Email**: Resend
- **Hosting**: Vercel
- **Background jobs**: Vercel Cron (escalate to Inngest only if needed)

## Architectural Decisions

- **SaaS, multi-tenant**: `Organization` → `Property` → everything else. Use Prisma middleware to auto-scope queries by `propertyId`.
- **Invite-only onboarding**: no public signup. Platform admin creates `Organization` records via a private route or seed; single-use `Invite` tokens are emailed.
- **US-only, USD-only for v1**. Operator-configured tax rates per property (no jurisdictional automation).
- **Stay-length pricing engine**: `RatePlan` defines `chargeUnit` (NIGHT/WEEK/MONTH/SEASON), price, and `minStayDays`/`maxStayDays`. Engine picks the highest-priority applicable plan.
- **Guest checkout + optional saved profile**: guests book without an account; a magic-link claim email upgrades them to a saved profile.
- **Money as `Int` cents; percentages as basis points** (100 bps = 1.00%). Never floats.
- **Date-only stay dates** (`@db.Date`); times come from `Property.checkInTime` / `checkOutTime`.
- **Half-open booking intervals** `[checkIn, checkOut)` — standard hospitality convention.

## Critical Constraints

- **No overlapping reservations on a site** is enforced at the database level via a Postgres exclusion constraint (`btree_gist` extension). See the raw SQL migration. Application-level checks alone race during concurrent checkouts.
- **Guests are property-scoped**: same email at two properties = two `Guest` rows.
- **Soft delete on `Site` and `SiteType`**: historical reservations must keep referential integrity.
- **Cancellation policy snapshot at confirmation**: reservations carry a JSON snapshot so future policy changes don't retroactively affect existing bookings.

## Build Phases

- **Phase 0** — Skeleton: Next.js, Prisma, Auth.js, Stripe Connect sandbox, Resend, Vercel deploy, seed data.
- **Phase 1** — Operator configuration UI: Property, SiteType, Site, RatePlan, TaxRate, Addon CRUD.
- **Phase 2** — Pricing + availability engine as pure, unit-tested functions.
- **Phase 3** — Public booking flow at `/p/[slug]`: search → site list → checkout → Stripe → confirmation email.
- **Phase 4** — Operator reservation grid: view, manual booking, edit, cancel, refund.
- **Phase 5** — Guest portal: magic-link claim, view/modify/cancel, automated reminders via cron.
- **Phase 6** — Polish: add-ons checkout, discounts (manual line item), occupancy report, tax config UI.

## Explicitly Deferred (NOT in v1)

- Auto-recurring billing for monthly/seasonal stays — operators charge saved cards manually
- Custom per-property cancellation policies — fields on `Property` are fixed for v1
- Promo codes — use manual `DISCOUNT` line items
- Interactive site map UI — `mapX`/`mapY` reserved on `Site`, no UI
- Drag-and-drop reservation grid — edit-in-modal only
- Self-service kiosk mode
- POS / store inventory
- Utility metering & recurring utility charges
- Channel manager / Airbnb integration
- SMS notifications
- Multi-property UI under one Organization (modeled but not surfaced)
- Custom subdomains / domains for operator portals
- Reservation audit log

## Seed Data: Monument Point Campground

The dev/test seed represents Monument Point Camping (Door County, WI):

- One `Organization` — "Monument Point Camping LLC"
- One `OperatorUser` — owner role
- One `Property` — slug `monument-point`, season May 1 – Oct 15, check-in 14:00, check-out 11:00
- One `SiteType` — Wooded Electric, 30A, no water/sewer, no tents, pets allowed, max 2 adults + 4 children
- 35 `Site` rows labeled `"1"`–`"35"` (placeholder; real numbering TBD from operator)
- Two `RatePlan` rows: "Nightly" ($40/night, min 1 day), "Annual Seasonal" ($2000, min 150 days, charge unit SEASON)
- One `Addon`: Firewood Bundle ($8 placeholder)
- Default cancellation policy: 14 days / 7 days / 50%
- No tax rates seeded — operator configures during property setup

## Conventions

- All money is `Int` cents. Format at the UI layer only.
- All percentages are basis points. Helper utility for conversions in `src/lib/money.ts`.
- Prisma transactions (`prisma.$transaction`) for any multi-table mutation.
- Server Actions for component mutations; Route Handlers for webhooks (Stripe, Resend) and external API surfaces.
- Pure-function modules for pricing (`src/lib/pricing.ts`) and availability (`src/lib/availability.ts`) — no DB calls, no React, fully unit-testable. This is the heart of the system; treat as such.
- Tests: Vitest for pure logic from Phase 2 onward; Playwright for end-to-end booking flows from Phase 3 onward.
- Branches: feature branches per phase, PRs merged to `main`. Vercel preview deploy per branch.
- Commit early and often. Migrations get their own commits separate from feature commits.

## Repo Layout (target after Phase 0)

```
/CLAUDE.md
/prisma/
  schema.prisma
  migrations/
    <timestamp>_init/migration.sql
    <timestamp>_reservation_exclusion/migration.sql
  seed.ts
/src/
  app/
    (public)/p/[slug]/...     # guest-facing booking flow
    (operator)/admin/...      # operator dashboard
    (guest)/portal/...        # guest self-service portal
    api/
      auth/[...nextauth]/
      stripe/webhook/
      resend/webhook/
  components/
    ui/                       # shadcn-generated
  lib/
    prisma.ts
    auth.ts
    stripe.ts
    resend.ts
    money.ts
    pricing.ts                # pure
    availability.ts           # pure
  middleware.ts
```
