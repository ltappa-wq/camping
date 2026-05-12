# Claude Design Pass — Camping Booking Platform

A guide for running a visual design pass on the camping app using Anthropic Labs' Claude Design product, then bringing the output back into the codebase via Claude Code.

**When to use this:** after Phase 6a is shipped and merged. Don't start a Claude Design session while Claude Code is still actively making changes — they'll fight over file edits.

This document has two parts:
- **Part A** is a brief to paste into Claude Design when you start a session. It tells Claude Design what the project is, what tech stack to respect, and how operators customize the visuals. Use the same brief every session.
- **Part B** is your playbook: which screens to tackle, in what order, what prompts to use, how to handle output, and what to leave alone.

---

# Part A — Brief for Claude Design

Paste everything between the `===` markers below into Claude Design at the start of each session, or set it as your project's saved context if Claude Design supports that.

```
===

# Project: Camping — Campsite Booking SaaS

A multi-tenant booking platform for small RV parks and campgrounds. Built as a SaaS — multiple campground operators each have their own property, configure inventory and rates, and accept bookings from guests. The platform sits underneath; operators brand their public-facing pages.

## Tech stack (must respect)

- Next.js 15 with App Router and TypeScript
- Tailwind CSS for styling
- shadcn/ui as the component library — components live in src/components/ui/ as plain code, NOT a dependency
- Prisma + Supabase Postgres (irrelevant for design)
- Server Actions for mutations
- All money is integer cents; all percentages are basis points (display formatting only at UI layer)

When you generate code, use Tailwind utility classes and shadcn primitives only. Do not introduce a different design system, animation library, or component library. The codebase already includes shadcn's Button, Card, Sheet, Dialog, Form, Input, Select, Tabs, Table, DataTable, Sidebar, Calendar, Toast, and Alert. Use those.

## Multi-tenant branding model

The platform serves many operators. Each operator (Property model) has these brand levers they can customize:
- `Property.logoUrl` — appears in public site header
- `Property.primaryColor` — hex value used as accent color throughout
- `Property.heroImageUrl` — full-width hero image on public property page
- `Property.name`, `Property.description`, etc. — text content
- Property-level photo gallery (multiple `PropertyImage` rows)
- Per-site photo galleries (multiple `SiteImage` rows per Site)

The platform's role is to provide a tasteful, neutral baseline that looks good with any operator's branding layered on top. Aim for design that's:

- Warm, hospitable, outdoors-feeling — these are campgrounds, not luxury hotels and not enterprise SaaS
- Trust-building — guests will type their credit card here
- Information-dense without feeling cluttered — operators have lots of fields
- Approachable for non-technical users — many operators are owner-operators in their 50s+
- Brand-friendly — operators with strong branding can lean into it; the platform shouldn't fight them

Reference points for the right vibe (use these as inspiration, don't copy):
- Hipcamp.com — for warmth and outdoor feel on guest-facing pages
- Linear.app — for clean operator dashboards
- Stripe Dashboard — for payment-related flows
- The wilderness travel/hospitality category in general

Anti-patterns to avoid:
- Big tech "hero with floating glow" landing pages
- Marketing site flourishes (testimonial carousels, FAQ accordions, big animations)
- Dense data-bro dashboards (think "campground office," not "trading desk")
- Too much shadow/depth — flat is better here

## Two distinct surfaces

The app has two completely different audiences. They should look related (same visual DNA) but not identical (operators don't want to feel like guests, guests don't want to feel like they're using admin software).

### Public/guest surface — `/p/[slug]/*`
- Operator-branded
- Operator's `primaryColor` drives accents; otherwise neutral
- Property hero image / logo prominent
- Conversion-focused
- Pages: property landing, search results, site detail/checkout, payment confirmation, guest portal home, reservation detail, modification flow, sign-in
- Should feel like a campground's website, not like SaaS software

### Operator surface — `/admin/*`
- Platform branding (no operator color)
- Productivity-focused
- Information density tolerated
- Pages: dashboard home, reservation grid, reservation table, reservation detail panel, all the configuration pages, reports, settings
- Should feel like a calm, useful tool

## Functional constraints

- Don't change Server Action signatures or API routes — the visual layer wraps existing data and mutations
- Don't change form field semantics — adding/removing/renaming fields is out of scope
- Don't introduce client-side state where Server Actions exist
- Don't add new env vars, vendor APIs, or third-party scripts
- Performance budget is realistic — these aren't marketing pages, but checkout and search shouldn't take 5 seconds to render

## Output expectations

Each design pass should produce code that drops into the existing Next.js App Router structure. When you finalize a design, the handoff bundle should specify:
- Which file paths in `src/app/**` are affected
- Which shadcn components are used (and any new ones to add via shadcn CLI)
- Any new Tailwind utilities or theme variables
- Image assets (if any) — operator-uploaded images take precedence; placeholder images for design only

===
```

---

# Part B — Your playbook

## Pre-flight checklist

Before starting a Claude Design session:

1. **Confirm Phase 6a is fully shipped and merged to main.** Run `git status` in the camping repo; should be clean. Pull latest from origin/main.
2. **Create a design pass branch:** `git checkout -b design-pass-1`. All Claude Design output lands in this branch via Claude Code, then gets reviewed and merged back to main as a single PR.
3. **Take screenshots of every current screen.** Walk through the app — public flow as a guest, admin flow as the operator — and screenshot each major surface. Save them to a folder like `~/Documents/camping-screenshots/`. You'll feed these to Claude Design as "before" references and to anchor improvements.
4. **Have 3–5 visual references handy.** Not screenshots from competitors (don't ask Claude Design to copy anyone), but a Pinterest board or just a folder of images that capture the vibe you want. Outdoor photography, warm color palettes, clean dashboards — whatever inspires.
5. **Link the codebase.** Claude Design has a "link a codebase" feature. Point it at `https://github.com/ltappa-wq/camping`. It'll learn your existing components, color tokens, and Tailwind config — output will respect them automatically.

## Surface priorities

Don't try to redesign everything in one session. Work through tiers in order. Tier 1 first because it's the highest-stakes visual surface (paying customers see it). Tier 2 second because it's where you spend your operator time. Tier 3 last and only if budget allows.

### Tier 1 — public guest-facing flow

This is what real people see when they're considering booking. Most important visual investment in the whole app. Roughly half of the design pass budget should go here.

#### 1a — Property landing page (`/p/[slug]`)

The first impression. Hero, dates picker, secondary content (rules, directions, map), gallery.

**Prompt to use:**
> I have a campground booking landing page. Operator-branded, with a hero section, a date-picker as primary CTA, and secondary content below for rules, directions, photo gallery, and a map image. I'd like to redesign this to feel warm, outdoorsy, and trust-building — like a real small-campground website. Use the brand levers from the brief: hero image, logo, primary color. The date picker is the conversion focal point; make it inviting. Reference: imagine a wooded family campground in Door County, Wisconsin, that wants to look professional but not corporate.

**Show Claude Design:**
- A screenshot of your current `/p/monument-point` page
- 2–3 visual reference images for the vibe
- The actual hero image you've uploaded (or a stand-in)

**Things to preserve:**
- Date picker functionality (check-in, check-out, party size, "Search availability" CTA)
- "Bookings closed" alternative state when operator hasn't completed Stripe Connect
- Photo gallery section (when present)
- Map image link
- Footer contact info

**Things to push for:**
- A hero treatment that uses the property hero image well
- Clear visual hierarchy: name → vibe → action
- Calm, not pushy, sales copy in component placeholder text
- Mobile-first layout that doesn't feel like a desktop site shrunk

#### 1b — Search results page (`/p/[slug]/search`)

Two-column layout (cards on left, sticky map on right desktop; stacked mobile). Lots of cards potentially — Monument Point has 35 sites.

**Prompt:**
> I have a campsite search results page. Two-column layout: list of available sites on the left, sticky reference map image on the right. Each card shows site label, type, key tags, and total price for the dates. I want to redesign the cards and the page chrome (filter bar, sort dropdown, date adjuster) to feel scannable and easy. The cards need to handle a property with 35+ similar sites without feeling repetitive. Each card should clearly show the price, the key differentiators (tags, hookups), and a single primary CTA to book.

**Show:**
- Screenshot of current search results
- Screenshot of a card detail (zoomed in)

**Preserve:**
- Filter bar (site type dropdown, tags multi-select, sort dropdown, inline date adjuster)
- "Book this site" button on each card
- Empty state when no sites available
- Map image sidebar layout

**Push for:**
- Cards that feel like real campsites (a site image when present, tags as visual chips, price prominent)
- Clear visual differentiation between "premium" and "standard" sites if tags suggest a hierarchy
- Quiet hover states (not aggressive)

#### 1c — Checkout page (`/p/[slug]/checkout`)

Single-page form with sticky summary. The trust-builder. This is where guests type credit card info into Stripe Checkout — the page itself doesn't take payment, but it sets up the trust before redirecting.

**Prompt:**
> I have a single-page checkout for a campsite booking. Two-column layout on desktop: form on the left, sticky booking summary card on the right that updates as the guest changes options (e.g., adds firewood). Sections in order: read-only booking summary at top (with edit-back link), add-ons selection, guest info form, cancellation policy summary, and primary CTA "Continue to payment." Make it feel trustworthy and professional. The next click sends them to Stripe Checkout, so they're already in a high-trust mindset; don't break it.

**Preserve:**
- All form fields and validation
- The sticky summary that recomputes as add-ons change
- "Change dates" / "Change site" links that send back to search
- Cancellation policy display

**Push for:**
- Form layout that doesn't feel like a tax document
- Clear progressive disclosure (RV info collapsed by default, expandable)
- A summary card that's reassuring without being aggressive
- Mobile flow that doesn't break

#### 1d — Confirmation page (`/p/[slug]/booking/[code]`)

The "you're booked!" page. Three states: confirmed (most common), held (waiting for webhook, brief), cancelled (rare).

**Prompt:**
> I have a booking confirmation page. The successful state shows: a "you're booked!" header, the confirmation code, booking summary, property contact info, cancellation policy, map link, and a "save my info for next time" magic-link CTA. I want this to feel celebratory but calm — not fireworks, but unmistakable success. The confirmation code is the single most important piece of information; treat it like the centerpiece. The "save my info" CTA is secondary; don't let it dominate.

**Preserve:**
- All three states (CONFIRMED, HELD with polling, CANCELLED with retry)
- Confirmation code prominent and copyable
- Magic-link claim CTA for unclaimed guests
- All informational content

**Push for:**
- Genuine celebration without being saccharine
- A layout that prints well (some operators tell guests to print this)

### Tier 2 — operator dashboard core

The screens you stare at every morning. Less visually stake than the public flow, but real productivity wins from getting them right.

#### 2a — Dashboard home (`/admin`)

Today widget, KPI cards, recent bookings, recent payments, Connect status banner.

**Prompt:**
> I have an operator dashboard home for a campground booking platform. The operator wants to glance at it and answer: who's arriving today, who's leaving, who's currently on-site, how am I doing this week. Top section is "Today" — arrivals, departures, currently on-site, with names visible. Below that, KPI cards for the week (revenue, occupancy %, total bookings). Below that, two side-by-side panels: recent bookings and recent payments. Persistent banner at top if Stripe Connect setup is incomplete. Calm, scannable, productive — like Linear's dashboard, not a stock-trading platform.

**Preserve:**
- All four "Today" metrics
- Connect status banner (it's load-bearing for the launch state)
- All three KPI metrics
- Recent bookings + recent payments panels

**Push for:**
- Today widget that's the visual centerpiece
- Numbers large enough to read at a glance
- "What needs my attention" surfacing if anything's overdue (failed payments, expired holds — these are minor states but worth making visible)

#### 2b — Reservation detail panel

Slides in from the right, ~50% viewport. Reused across grid view, table view, and direct-link landings.

**Prompt:**
> I have a reservation detail panel — a slide-in sheet that opens when an operator clicks any reservation. It contains: header with confirmation code and status, guest info (editable inline), booking details (site, dates, with change actions), pricing breakdown (lots of line items), payments section, cancellation policy snapshot, activity timeline, and a destructive-actions menu. This is the operator's primary work surface for individual reservations. Information-dense is OK; visually noisy isn't. Make sections clearly separable; make the most-frequent actions (resend confirmation, mark checked-in/out) prominent in the header; tuck destructive actions in a menu.

**Preserve:**
- All sections (header, guest info, booking, pricing, payments, policy, timeline, destructive)
- Inline-edit affordance on guest info
- "Change site" / "Change dates" actions
- Balance-owed and credit-due callouts when present

**Push for:**
- Clear visual hierarchy across many sections
- Status badge that's instantly readable
- A pricing breakdown that's actually scannable (many line items can pile up; treat it as a small invoice)

#### 2c — Reservation grid view (`/admin/grid`)

The X-axis-dates, Y-axis-sites visual. The hardest screen to design well in the whole app.

**Prompt:**
> I have a reservation grid view. Sites on the Y-axis (one row per site), dates on X-axis (one column per day, default 30-day range). Reservations show as colored bars spanning their date range, with the guest's last name and night count. Statuses are color-coded (CONFIRMED, CHECKED_IN, CHECKED_OUT, HELD, CANCELLED, NO_SHOW). Click a reservation to open the detail panel. Above the grid: a date range picker, quick-jump buttons (today, this week, next month). A vertical line marks today. I want this to feel like a calm, professional planner — not a Gantt chart, not a stadium scoreboard. Operators stare at this all day; comfort over flash.

**Preserve:**
- Grid structure (sites × dates)
- Status color coding
- Click-to-open detail panel
- Date range controls and today indicator
- Site-type grouping with collapsible groups

**Push for:**
- Reservation bars that read at a glance — guest name primary, length secondary
- Color palette that's distinguishable but not garish (avoid stoplight red/yellow/green if possible)
- Empty cells that don't fight the reservation cells for attention
- Mobile or narrow-viewport handling — even if degraded, shouldn't crash

### Tier 3 — operator productivity (do last, only if budget allows)

#### 3a — Reports page

Three tabs: revenue, occupancy, bookings. Don't over-design.

**Prompt:**
> I have a reports page with three tabs: revenue, occupancy, bookings. Each has a date range picker at top, a row of KPI cards, and a detail table or simple chart below. I want this to be quietly useful — operators check revenue once a month, this isn't a daily-driver screen. Don't over-design; clarity over flash.

**Push for:** clean cards, restraint with charts, easy CSV export visibility.

#### 3b — Wizard polish

The 11-step setup wizard from Phase 6a. Probably already feels OK from Phase 6a's build. Only redesign if you've dogfooded it and noticed friction.

**Prompt only if needed:**
> I have an 11-step setup wizard for a brand-new campground operator. Each step is a single-purpose form. Progress indicator at top. Skip-for-now option on optional steps. The risk is that 11 steps feels overwhelming. I want it to feel like a guided walk, not a bureaucratic form-fest. Pace, breathing room, encouragement for completed steps.

### What NOT to redesign

Skip these surfaces. They're functional, low-stakes, or already fine:

- All settings forms and admin CRUD pages (Site Types, Sites, Rate Plans, Modifiers, Add-ons, Tax Rates, Closed Dates, Email Domain, Email Templates) — these are pure utility, designing them would burn budget for marginal gain
- Sign-in pages (operator and guest) — already minimal, not worth investment
- Email templates themselves (handled in code, not visual design surface)
- Any Stripe-hosted page — you don't control these
- Any Resend-related UI beyond what already exists in admin

If a Claude Design session wants to redesign these, redirect it.

## Constraints to communicate (every session)

When you start a session, confirm Claude Design understands:

1. Use only shadcn/ui primitives plus Tailwind utilities. No new component libraries.
2. The codebase has been built up through 6+ phases; preserve all existing functionality. Visual changes only.
3. Operator-customizable values (hero image, primary color, logo) flow in as data — design with placeholders that get replaced from `Property` records at render time.
4. Mobile responsive matters but doesn't dominate — most operator usage is desktop, most guest usage is mobile, design should respect both but optimize for context.

## Handoff workflow to Claude Code

When a Claude Design session is finished and you're happy with the result:

1. **Use Claude Design's "handoff bundle" feature.** This produces a single instruction package for Claude Code.
2. **In your camping repo's branch (`design-pass-1`), start Claude Code:** `claude` from the repo root.
3. **Paste the handoff bundle as the first message.** Claude Code will read it, look at affected files, and propose changes.
4. **Default to approving changes.** Claude Code is implementing what Claude Design specced; trust the handoff. Stop and ask in this chat if something looks weird (e.g., new dependencies being installed, files outside `src/app/` or `src/components/` being changed).
5. **After Claude Code completes:** test the affected screens locally with `pnpm dev`, then push the branch.
6. **Vercel will create a preview deploy** for the `design-pass-1` branch. Visit the preview URL, walk the affected screens, dogfood as both operator and guest.
7. **If the preview looks good:** open a PR from `design-pass-1` to `main`. Merge it.
8. **If something's off:** go back to Claude Design with specific feedback ("the search results cards have too much padding on mobile"), get a refined handoff, repeat.

Don't let a Claude Design session and a Claude Code phase run in parallel. They'll fight over the same files.

## Common pitfalls

- **Surface drift:** Claude Design wants to redesign more than you asked. Be specific in prompts; redirect when it strays. "Just the search results cards, not the page chrome" is a fine correction.
- **Component creep:** Claude Design suggests installing a new animation library, a 3D viewer, a fancy carousel. Reject these. shadcn + Tailwind is the contract.
- **Demo-quality output:** Claude Design produces something that looks great in isolation but breaks when wired to real data with realistic edge cases (very long property names, no hero image, sites without photos, 35+ rows in a list). Test edge cases before merging.
- **Mobile-last:** Claude Design's first iterations often nail desktop and forget mobile. Specifically prompt for mobile review on guest-facing surfaces.
- **Over-iteration:** It's tempting to refine forever. Set a budget per surface (e.g., 2–3 iterations per page max), commit, move on. The next pass can refine.
- **Forgetting brand variability:** Monument Point is one operator. The platform serves many. If a design only looks good when the primary color is forest green and the hero is a wooded campsite, it'll fail for a beachside RV park with a turquoise palette and ocean photos. Have Claude Design show two or three operator-brand variants of the same screen to validate.

## Suggested session schedule

Realistic pacing if you're doing this part-time:

- **Session 1 (1–2 hours):** Property landing page (1a). Get one win, see how the Claude Design → Claude Code handoff feels.
- **Session 2 (1–2 hours):** Search results (1b). Builds on visual language established in 1a.
- **Session 3 (1–2 hours):** Checkout (1c) and confirmation (1d) together — they share visual language.
- **Pause:** dogfood the full guest flow end-to-end. See how it feels as a paying customer would experience it. Refine if needed.
- **Session 4 (1–2 hours):** Dashboard home (2a) and reservation detail panel (2b).
- **Session 5 (1–2 hours):** Reservation grid (2c). Probably the most iteration-heavy single screen.
- **Pause:** dogfood the operator flow end-to-end. Refine if needed.
- **Session 6 (optional, 1 hour):** Reports (3a). Quick polish if budget allows.

Total: roughly 8–12 hours of design work spread across however many days suits you. Plus equivalent time in Claude Code applying the handoffs and testing.

## When you're done

Merge the `design-pass-1` branch to `main`. Tag the commit (`git tag v0.6-design-pass-1`). Then either move into Phase 6b (the deferred polish: saved cards, promo codes, tag chips, banker's rounding), or — better — show the redesigned product to a real campground operator and find out what they think before you build any more features.
