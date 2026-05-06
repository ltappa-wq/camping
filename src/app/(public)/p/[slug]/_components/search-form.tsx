"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SearchForm({
  slug,
  defaults,
}: {
  slug: string;
  defaults?: {
    from?: string;
    to?: string;
    adults?: number;
    children?: number;
  };
}) {
  const router = useRouter();
  const [from, setFrom] = useState(defaults?.from ?? "");
  const [to, setTo] = useState(defaults?.to ?? "");
  const [adults, setAdults] = useState(defaults?.adults ?? 2);
  const [children, setChildren] = useState(defaults?.children ?? 0);
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

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="from">Check-in</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Check-out</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="adults">Adults</Label>
          <Input
            id="adults"
            type="number"
            min={1}
            max={20}
            value={adults}
            onChange={(e) => setAdults(Number(e.target.value) || 0)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="children">Children</Label>
          <Input
            id="children"
            type="number"
            min={0}
            max={20}
            value={children}
            onChange={(e) => setChildren(Number(e.target.value) || 0)}
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full">
        Search availability
      </Button>
    </form>
  );
}
