import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import {
  type ParsedFilters,
  type SortField,
  buildQueryString,
} from "../_lib/query";

/**
 * Column header that renders an `<a>` to the same page with the sort
 * query param flipped. Server-side, no JS. Clicking again toggles
 * direction; clicking another column starts at asc.
 */
export function SortableHeader({
  field,
  label,
  filters,
  align = "left",
}: {
  field: SortField;
  label: string;
  filters: ParsedFilters;
  align?: "left" | "right";
}) {
  const active = filters.sort === field;
  const nextDir =
    active && filters.sortDir === "asc" ? "desc" : "asc";
  const qs = buildQueryString(filters, { sort: field, sortDir: nextDir });
  const Icon = !active
    ? ChevronsUpDown
    : filters.sortDir === "asc"
      ? ChevronUp
      : ChevronDown;

  return (
    <Link
      href={`/admin/reservations?${qs}`}
      className={`inline-flex items-center gap-1 text-muted-foreground hover:text-foreground ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      <span>{label}</span>
      <Icon className="h-3.5 w-3.5" />
    </Link>
  );
}
