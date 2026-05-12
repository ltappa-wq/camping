"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Inline booking card on the property landing page. Same field set + nav
// behavior as the regular SearchForm, but laid out as the prototype's
// horizontal "field office" card (4 cells + price/CTA) instead of a
// 2×2 stacked form. Search-results page still uses the regular SearchForm.

type Props = {
  slug: string;
  /** Lowest cents/night across the property's active rate plans, for
   *  the "From $X / night" callout. Null when no rate plan applies. */
  lowestNightlyCents: number | null;
};

export function LandingBookingCard({ slug, lowestNightlyCents }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) {
      setError("Pick both check-in and check-out dates.");
      return;
    }
    if (from >= to) {
      setError("Check-out must be after check-in.");
      return;
    }
    setError(null);
    const params = new URLSearchParams({
      from,
      to,
      adults: String(adults),
      children: String(children),
    });
    router.push(`/p/${slug}/search?${params.toString()}`);
  }

  const showPrice = lowestNightlyCents != null && lowestNightlyCents > 0;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-md border border-stone-200 bg-white shadow-[0_24px_60px_-24px_rgba(20,15,8,0.25)]"
    >
      <div className="grid grid-cols-1 divide-y divide-stone-200 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        <div className={`p-6 ${showPrice ? "lg:col-span-9" : "lg:col-span-12"}`}>
          <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
            Find a site
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
            <Cell label="Check-in" htmlFor="from">
              <input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
                className="w-full bg-transparent font-serif text-[28px] leading-none text-stone-900 outline-none placeholder:text-stone-300 focus:text-stone-900"
              />
            </Cell>
            <Cell label="Check-out" htmlFor="to">
              <input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
                className="w-full bg-transparent font-serif text-[28px] leading-none text-stone-900 outline-none placeholder:text-stone-300 focus:text-stone-900"
              />
            </Cell>
            <Cell label="Adults" htmlFor="adults">
              <input
                id="adults"
                type="number"
                min={1}
                max={20}
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value) || 0)}
                required
                className="w-full bg-transparent font-serif text-[28px] leading-none text-stone-900 outline-none"
              />
            </Cell>
            <Cell label="Children" htmlFor="children">
              <input
                id="children"
                type="number"
                min={0}
                max={20}
                value={children}
                onChange={(e) => setChildren(Number(e.target.value) || 0)}
                className="w-full bg-transparent font-serif text-[28px] leading-none text-stone-900 outline-none"
              />
            </Cell>
          </div>
          {error ? (
            <p className="mt-4 text-[13px] text-red-700">{error}</p>
          ) : null}
        </div>
        <div className="flex flex-col justify-between gap-4 p-6 lg:col-span-3">
          {showPrice ? (
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                From
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-serif text-[36px] leading-none text-stone-900">
                  ${Math.round(lowestNightlyCents! / 100)}
                </span>
                <span className="text-[13px] text-stone-500">/ night</span>
              </div>
            </div>
          ) : null}
          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[var(--brand)] px-6 text-[14px] font-medium tracking-tight text-white transition hover:opacity-90"
          >
            Check availability →
          </button>
        </div>
      </div>
    </form>
  );
}

function Cell({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500"
      >
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
