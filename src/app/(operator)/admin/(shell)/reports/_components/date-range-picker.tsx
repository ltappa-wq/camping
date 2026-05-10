"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "this-quarter", label: "This quarter" },
  { key: "ytd", label: "YTD" },
];

type Props = {
  rangeKey: string;
  fromIso: string;
  toIso: string;
  /** Server-computed ISO dates per preset so picking a chip doesn't have
   *  to re-derive timezone-aware boundaries on the client. */
  presetDates: Record<string, { from: string; to: string }>;
};

/**
 * Drives the report's date range. Quick-jump chips push from/to into the
 * URL; the date inputs let operators type custom dates. Tab choice is
 * preserved so chip clicks don't flip them between Revenue/Occupancy.
 */
export function DateRangePicker({
  rangeKey,
  fromIso,
  toIso,
  presetDates,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function navigate(from: string, to: string) {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.set("from", from);
    next.set("to", to);
    startTransition(() => router.push(`?${next.toString()}`));
  }

  return (
    <div className="space-y-3 rounded-md border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const active = rangeKey === p.key;
          const dates = presetDates[p.key];
          return (
            <Button
              key={p.key}
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => dates && navigate(dates.from, dates.to)}
              disabled={isPending || !dates}
            >
              {p.label}
            </Button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="from" className="text-xs">
            From
          </Label>
          <Input
            id="from"
            type="date"
            defaultValue={fromIso}
            onChange={(e) => {
              const next = e.target.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(next)) navigate(next, toIso);
            }}
            className="w-44"
          />
        </div>
        <div>
          <Label htmlFor="to" className="text-xs">
            To
          </Label>
          <Input
            id="to"
            type="date"
            defaultValue={toIso}
            onChange={(e) => {
              const next = e.target.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(next)) navigate(fromIso, next);
            }}
            className="w-44"
          />
        </div>
        {rangeKey === "custom" ? (
          <span className="ml-1 text-xs text-muted-foreground">
            Custom range
          </span>
        ) : null}
      </div>
    </div>
  );
}
