import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ParsedFilters,
  buildQueryString,
} from "../_lib/query";

const STATUS_OPTIONS = [
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "HELD", label: "Held" },
  { value: "CHECKED_IN", label: "Checked-in" },
  { value: "CHECKED_OUT", label: "Checked-out" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NO_SHOW", label: "No-show" },
  { value: "DRAFT", label: "Draft" },
] as const;

/**
 * Filter bar is a plain HTML form with method="get". The browser handles
 * everything: clicking Apply submits, the URL updates, the server
 * component re-runs with the new params. No client JS needed for the
 * filter UX itself. Sort still works via column-header Links because
 * those carry the current filter state through buildQueryString().
 */
export function FilterBar({
  filters,
  siteTypes,
  csvHref,
}: {
  filters: ParsedFilters;
  siteTypes: ReadonlyArray<{ id: string; name: string }>;
  csvHref: string;
}) {
  // Hidden inputs preserve the active sort across filter submits.
  const sortValue = `${filters.sort}:${filters.sortDir}`;

  return (
    <form
      method="get"
      className="space-y-4 rounded-md border bg-card p-4"
    >
      <input type="hidden" name="sort" value={sortValue} />

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Status
        </legend>
        <div className="flex flex-wrap gap-3">
          {STATUS_OPTIONS.map((s) => {
            const checked = filters.statuses.includes(s.value);
            return (
              <label
                key={s.value}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="status"
                  value={s.value}
                  defaultChecked={checked}
                  className="h-4 w-4 rounded border-input"
                />
                {s.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs text-muted-foreground">
            Check-in from
          </Label>
          <Input
            id="from"
            name="from"
            type="date"
            defaultValue={filters.from}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs text-muted-foreground">
            Check-in to
          </Label>
          <Input
            id="to"
            name="to"
            type="date"
            defaultValue={filters.to}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Site type</Label>
          {/* Native select keeps the form submission simple — shadcn Select
              is a Radix component that doesn't post a value to the form. */}
          <select
            name="siteType"
            defaultValue={filters.siteTypeId ?? ""}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All site types</option>
            {siteTypes.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="siteLabel" className="text-xs text-muted-foreground">
            Site label
          </Label>
          <Input
            id="siteLabel"
            name="siteLabel"
            placeholder="e.g. 7 or A1"
            defaultValue={filters.siteLabel}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="q" className="text-xs text-muted-foreground">
            Guest (name or email)
          </Label>
          <Input
            id="q"
            name="q"
            placeholder="Search guests"
            defaultValue={filters.guestQuery}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Apply filters
          </Button>
          <Button asChild type="button" variant="outline" size="sm">
            <Link href="/admin/reservations">Reset</Link>
          </Button>
        </div>
        <Button asChild type="button" variant="outline" size="sm">
          <a href={csvHref} download>
            Download CSV
          </a>
        </Button>
      </div>
    </form>
  );
}

// Re-export so the page can build the column-header URLs without
// importing two modules.
export { buildQueryString };
