"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/money";
import type { Quote } from "@/lib/pricing";
import { runQuote, type QuoteActionResult } from "./actions";

export type SiteTypeOption = { id: string; name: string; archived: boolean };
export type AddonOption = {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
};

const KIND_LABEL: Record<string, string> = {
  BASE: "Stay",
  MODIFIER: "Modifier",
  ADDON: "Add-on",
  TAX: "Tax",
};

function formatSigned(cents: number): string {
  if (cents < 0) return `−${formatCents(-cents)}`;
  return formatCents(cents);
}

export function QuoteTester({
  siteTypes,
  addons,
  defaultSiteTypeId,
  defaultCheckIn,
  defaultCheckOut,
}: {
  siteTypes: SiteTypeOption[];
  addons: AddonOption[];
  defaultSiteTypeId: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
}) {
  const [siteTypeId, setSiteTypeId] = useState(defaultSiteTypeId);
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [addonQuantities, setAddonQuantities] = useState<
    Record<string, number>
  >({});
  const [result, setResult] = useState<QuoteActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function setQty(id: string, value: string) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    setAddonQuantities((prev) => ({ ...prev, [id]: n }));
  }

  function onSubmit() {
    startTransition(async () => {
      const r = await runQuote({
        siteTypeId,
        checkIn,
        checkOut,
        addonQuantities,
      });
      setResult(r);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Site type</Label>
          <Select value={siteTypeId} onValueChange={setSiteTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a site type" />
            </SelectTrigger>
            <SelectContent>
              {siteTypes.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No site types — create one first
                </SelectItem>
              ) : (
                siteTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.archived ? " (archived)" : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Check-in</Label>
            <Input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Check-out</Label>
            <Input
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>
        </div>

        {addons.length > 0 ? (
          <div className="space-y-2">
            <Label>Add-ons</Label>
            <div className="rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Add-on</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="w-28">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {addons.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        {a.name}
                        {!a.active ? (
                          <Badge variant="secondary" className="ml-2">
                            Inactive
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatCents(a.priceCents)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="h-8 w-20"
                          value={addonQuantities[a.id] ?? 0}
                          onChange={(e) => setQty(a.id, e.target.value)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        <Button onClick={onSubmit} disabled={isPending} className="w-full">
          {isPending ? "Computing…" : "Run quote"}
        </Button>
      </div>

      <div>
        {result == null ? (
          <p className="text-sm text-muted-foreground">
            Fill in the form and click <span className="font-medium">Run quote</span>{" "}
            to see the breakdown.
          </p>
        ) : !result.ok ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4">
            <div className="text-sm font-medium text-destructive">
              Quote failed
            </div>
            <div className="mt-1 text-sm">{result.error}</div>
          </div>
        ) : (
          <QuoteResult quote={result.quote} />
        )}
      </div>
    </div>
  );
}

function QuoteResult({ quote }: { quote: Quote }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Total
        </div>
        <div className="text-3xl font-semibold tabular-nums">
          {formatCents(quote.totalCents)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {quote.nights} night{quote.nights === 1 ? "" : "s"}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">Stay decomposition</div>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Each</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quote.stayLines.map((sl) => (
                <TableRow key={sl.ratePlanId}>
                  <TableCell className="font-medium">{sl.ratePlanName}</TableCell>
                  <TableCell className="text-xs">
                    {sl.chargeUnit.toLowerCase()} ({sl.daysPerUnit}d)
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {sl.units}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(sl.unitPriceCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(sl.amountCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">Line items</div>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Kind</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quote.lineItems.map((li, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge variant="outline">{KIND_LABEL[li.kind] ?? li.kind}</Badge>
                  </TableCell>
                  <TableCell>{li.description}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      li.amountCents < 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                    }`}
                  >
                    {formatSigned(li.amountCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <div className="grid grid-cols-2 gap-y-1 tabular-nums">
          <span className="text-muted-foreground">Stay base</span>
          <span className="text-right">{formatCents(quote.baseCents)}</span>
          <span className="text-muted-foreground">Modifiers</span>
          <span
            className={`text-right ${
              quote.modifierTotalCents < 0
                ? "text-emerald-600 dark:text-emerald-400"
                : ""
            }`}
          >
            {formatSigned(quote.modifierTotalCents)}
          </span>
          <span className="text-muted-foreground">Add-ons</span>
          <span className="text-right">{formatCents(quote.addonsCents)}</span>
          <span className="text-muted-foreground">Tax</span>
          <span className="text-right">{formatCents(quote.taxCents)}</span>
          <span className="border-t pt-1 font-semibold">Total</span>
          <span className="border-t pt-1 text-right font-semibold">
            {formatCents(quote.totalCents)}
          </span>
        </div>
      </div>
    </div>
  );
}
