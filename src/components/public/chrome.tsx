// Shared visual primitives for the public guest flow (Phase 6a design pass,
// "Direction A — Field Office"). Every guest page composes the same
// header/footer + title + data strip + ledger + form vocabulary so the
// system reads as one site.
//
// CRITICAL: these are visual-only wrappers. Each consumer page passes
// real model data (property, reservation, quote line items) — copy is
// never hardcoded here. All components are server-component-safe (no
// hooks, no client-only APIs).

import Link from "next/link";
import type { ReactNode } from "react";

import { BrandStyle } from "./brand-style";

// ---------------- chrome: header / footer / page shell ----------------

type PropertyChrome = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  phone: string | null;
  primaryColor: string | null;
};

export function PublicChromeHeader({
  property,
}: {
  property: PropertyChrome;
}) {
  return (
    <header className="border-b border-stone-200/70 bg-[#fbf8f1]">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-6 py-5 md:px-8">
        <Link
          href={`/p/${property.slug}`}
          className="flex items-center gap-2.5 hover:opacity-90"
        >
          {property.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={property.logoUrl}
              alt=""
              className="h-7 w-7 rounded"
            />
          ) : null}
          <span className="text-[15.5px] font-medium tracking-tight text-stone-900">
            {property.name}
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-[13px] text-stone-600 md:flex">
          <Link
            href={`/p/${property.slug}#about`}
            className="hover:text-stone-900"
          >
            About
          </Link>
          <Link
            href={`/p/${property.slug}#photos`}
            className="hover:text-stone-900"
          >
            Photos
          </Link>
          <Link
            href={`/p/${property.slug}#getting-here`}
            className="hover:text-stone-900"
          >
            Getting here
          </Link>
          {property.phone ? (
            <a href={`tel:${property.phone}`} className="hover:text-stone-900">
              {property.phone}
            </a>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

export function PublicChromeFooter({
  property,
}: {
  property: PropertyChrome;
}) {
  return (
    <footer className="border-t border-stone-200 bg-stone-900 py-12 text-stone-300">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-6 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-2.5">
          {property.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={property.logoUrl} alt="" className="h-7 w-7 rounded" />
          ) : null}
          <span className="text-[14px] text-white">{property.name}</span>
        </div>
        <div className="text-[12px] text-stone-400">
          © {new Date().getUTCFullYear()} · Booked through Camping
        </div>
      </div>
    </footer>
  );
}

/**
 * Wraps every public page with the brand-style scope, header, optional
 * back-breadcrumb, and footer. Uses the property id as the scope key so
 * the CSS variables collide-proof if multiple properties ever render on
 * one page (not a current case but cheap insurance).
 */
export function PageShell({
  property,
  breadcrumb,
  children,
}: {
  property: PropertyChrome;
  breadcrumb?: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <div
      data-brand-scope={property.id}
      className="min-h-screen bg-[#fbf8f1] text-stone-900 antialiased"
    >
      <BrandStyle primaryColor={property.primaryColor} scope={property.id} />
      <PublicChromeHeader property={property} />
      {breadcrumb ? (
        <div className="mx-auto max-w-[1280px] px-6 pt-10 md:px-8">
          <Link
            href={breadcrumb.href}
            className="text-[12px] uppercase tracking-[0.18em] text-stone-500 hover:text-stone-900"
          >
            ← {breadcrumb.label}
          </Link>
        </div>
      ) : null}
      {children}
      <PublicChromeFooter property={property} />
    </div>
  );
}

// ---------------- title block ----------------

export function PageTitle({
  children,
  lede,
}: {
  children: ReactNode;
  lede?: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-[1280px] px-6 pt-4 md:px-8">
      <div className="grid grid-cols-12 gap-8 md:gap-12">
        <div className="col-span-12 lg:col-span-9">
          <h1 className="font-serif text-5xl leading-[0.98] tracking-tight text-stone-900 md:text-6xl lg:text-[64px]">
            {children}
          </h1>
          {lede ? (
            <p className="mt-4 max-w-[720px] text-[15px] leading-relaxed text-stone-600">
              {lede}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------- data strip ----------------

export type DataStripItem = {
  label: string;
  big: ReactNode;
  sub?: ReactNode;
};

/**
 * Divided card with big serif numbers — used on search (trip header),
 * checkout (booking summary), and confirmation (stay block). Mobile
 * stacks the cells; desktop divides them with hairlines.
 */
export function DataStrip({
  items,
  action,
  className = "",
}: {
  items: ReadonlyArray<DataStripItem>;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`mx-auto mt-8 max-w-[1280px] px-6 md:mt-10 md:px-8 ${className}`}
    >
      <div className="overflow-hidden rounded-md border border-stone-200 bg-white shadow-[0_24px_60px_-24px_rgba(20,15,8,0.18)]">
        <div className="grid divide-y divide-stone-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {items.map((it, i) => (
            <div
              key={i}
              className="p-5 sm:[&:nth-child(2)]:border-l sm:[&:nth-child(2)]:border-stone-200 sm:[&:nth-child(2)]:border-l-stone-200 lg:[&:nth-child(2)]:border-l-0 md:p-6"
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                {it.label}
              </div>
              <div className="mt-1.5 font-serif text-[28px] leading-none text-stone-900">
                {it.big}
              </div>
              {it.sub ? (
                <div className="mt-1 text-[12px] text-stone-500">{it.sub}</div>
              ) : null}
            </div>
          ))}
          {action ? (
            <div className="flex items-center justify-end p-6 lg:border-l lg:border-stone-200">
              {action}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------- ledger card / row / total ----------------

type LedgerTone = "default" | "muted" | "success";

const TONE_CLASSES: Record<LedgerTone, string> = {
  default: "bg-white border-stone-200",
  muted: "bg-[#f4eee2] border-stone-200",
  success: "bg-[#f0f5ef] border-emerald-700/20",
};

export function LedgerCard({
  title,
  children,
  tone = "default",
  className = "",
}: {
  title?: string;
  children: ReactNode;
  tone?: LedgerTone;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md border p-6 md:p-7 ${TONE_CLASSES[tone]} ${className}`}
    >
      {title ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
          {title}
        </div>
      ) : null}
      <div className={title ? "mt-5" : ""}>{children}</div>
    </div>
  );
}

export function LedgerRow({
  k,
  v,
  sign,
}: {
  k: ReactNode;
  v: ReactNode;
  /** "neg" tints the value emerald (refunds, discounts). */
  sign?: "neg";
}) {
  if (v == null) return null;
  return (
    <div className="grid grid-cols-5 gap-3 border-b border-dotted border-stone-200 py-3 first:pt-0 last:border-0 last:pb-0">
      <dt className="col-span-3 text-[13.5px] text-stone-500">{k}</dt>
      <dd
        className={`col-span-2 text-right text-[13.5px] tabular-nums ${
          sign === "neg" ? "text-emerald-700" : "text-stone-900"
        }`}
      >
        {v}
      </dd>
    </div>
  );
}

export function LedgerTotal({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="mt-4 flex items-baseline justify-between border-t border-stone-300 pt-4">
      <span className="text-[12px] font-medium uppercase tracking-[0.18em] text-stone-700">
        {k}
      </span>
      <span className="font-serif text-[28px] leading-none text-stone-900 tabular-nums">
        {v}
      </span>
    </div>
  );
}

// ---------------- form scaffolding ----------------

export function FormSection({
  kicker,
  title,
  children,
  className = "",
}: {
  kicker?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-md border border-stone-200 bg-white p-6 md:p-7 ${className}`}
    >
      {kicker ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
          {kicker}
        </div>
      ) : null}
      {title ? (
        <h2 className="mt-1 font-serif text-[26px] leading-tight text-stone-900">
          {title}
        </h2>
      ) : null}
      <div className={kicker || title ? "mt-6 space-y-5" : "space-y-5"}>
        {children}
      </div>
    </section>
  );
}

export function FormFieldRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500"
      >
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint ? (
        <div className="mt-1 text-[11.5px] text-stone-500">{hint}</div>
      ) : null}
    </div>
  );
}

// ---------------- empty state ----------------

export function EmptyState({
  kicker,
  title,
  body,
  actions,
}: {
  kicker?: string;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-stone-300 bg-white p-10 text-center md:p-12">
      {kicker ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-stone-500">
          {kicker}
        </div>
      ) : null}
      <h3 className="mx-auto mt-3 font-serif text-[26px] leading-tight text-stone-900 md:text-[28px]">
        {title}
      </h3>
      {body ? (
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-stone-600">
          {body}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

// ---------------- status pill ----------------

const STATUS_TONES: Record<string, string> = {
  CONFIRMED: "bg-[var(--brand-100)] text-[var(--brand-900)] border-transparent",
  CHECKED_IN: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CHECKED_OUT: "bg-stone-100 text-stone-600 border-stone-200",
  CANCELLED: "bg-stone-100 text-stone-400 border-stone-200 line-through",
  NO_SHOW: "bg-stone-100 text-stone-400 border-stone-200",
  HELD: "bg-amber-100 text-amber-800 border-amber-200",
  DRAFT: "bg-stone-100 text-stone-500 border-stone-200",
};

export function StatusPill({ status }: { status: string }) {
  const cls = STATUS_TONES[status] ?? "bg-stone-100 text-stone-700 border-stone-200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] ${cls}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ---------------- helpers (date / nights formatting) ----------------

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
] as const;

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "2026-07-04" → "Jul 4". Empty input returns "". */
export function dateNice(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2])]} ${Number(m[3])}`;
}

/** "2026-07-04" → "Sat". Empty input returns "". */
export function dow(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00.000Z`);
  return DOW_SHORT[d.getUTCDay()] ?? "";
}

/** Half-open nights between two YYYY-MM-DD dates. */
export function nightsBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): number {
  if (!from || !to) return 0;
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  if (b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** "14:00" → "2pm"; "14:30" → "2:30pm". Returns input on malformed. */
export function formatTime12(t: string | null | undefined): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = h >= 12 ? "pm" : "am";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}${min ? ":" + String(min).padStart(2, "0") : ""}${ampm}`;
}

/** Mask local part of an email: "sarah@x.com" → "s******@x.com". */
export function obfuscateEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, 1)}${"*".repeat(Math.max(2, local.length - 1))}${domain}`;
}

/**
 * Compact season label, e.g. "May 1 – Oct 15" or null when the property
 * has no recurring season window set.
 */
export function formatSeason(p: {
  seasonStartMonth: number | null;
  seasonStartDay: number | null;
  seasonEndMonth: number | null;
  seasonEndDay: number | null;
}): string | null {
  if (
    p.seasonStartMonth == null ||
    p.seasonStartDay == null ||
    p.seasonEndMonth == null ||
    p.seasonEndDay == null
  )
    return null;
  return `${MONTHS[p.seasonStartMonth]} ${p.seasonStartDay} – ${MONTHS[p.seasonEndMonth]} ${p.seasonEndDay}`;
}
