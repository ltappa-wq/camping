"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { centsToDollars, formatCents } from "@/lib/money";
import { deleteRatePlan, toggleRatePlanActive } from "./actions";
import { RatePlanForm, type SiteTypeOption } from "./rate-plan-form";
import {
  CHARGE_UNIT_LABELS,
  type ChargeUnit,
  type RatePlanFormValues,
} from "./schema";

export type RatePlanRow = {
  id: string;
  name: string;
  siteTypeId: string | null;
  siteTypeName: string | null;
  chargeUnit: ChargeUnit;
  pricePerUnitCents: number;
  minStayDays: number;
  maxStayDays: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  priority: number;
  active: boolean;
};

const EMPTY: RatePlanFormValues = {
  id: undefined,
  name: "",
  siteTypeId: null,
  chargeUnit: "NIGHT",
  priceDollars: 0,
  minStayDays: 1,
  maxStayDays: null,
  effectiveFrom: null,
  effectiveTo: null,
  priority: 0,
  active: true,
};

function formatStayRange(min: number, max: number | null): string {
  if (max == null) return `${min}+ days`;
  if (min === max) return `${min} day${min === 1 ? "" : "s"}`;
  return `${min}–${max} days`;
}

function formatEffective(from: string | null, to: string | null): string {
  if (!from && !to) return "Year-round";
  return `${from ?? "…"} → ${to ?? "…"}`;
}

export function RatePlansList({
  rows,
  siteTypes,
}: {
  rows: RatePlanRow[];
  siteTypes: SiteTypeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RatePlanFormValues>(EMPTY);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  function openCreate() {
    setEditing(EMPTY);
    setOpen(true);
  }

  function openEdit(row: RatePlanRow) {
    setEditing({
      id: row.id,
      name: row.name,
      siteTypeId: row.siteTypeId,
      chargeUnit: row.chargeUnit,
      priceDollars: centsToDollars(row.pricePerUnitCents),
      minStayDays: row.minStayDays,
      maxStayDays: row.maxStayDays,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      priority: row.priority,
      active: row.active,
    });
    setOpen(true);
  }

  function onDelete(row: RatePlanRow) {
    if (!confirm(`Delete rate plan "${row.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteRatePlan(row.id);
      if (result.ok) {
        toast({ title: "Rate plan deleted" });
      } else {
        toast({
          variant: "destructive",
          title: "Delete failed",
          description: result.error,
        });
      }
    });
  }

  function onToggle(row: RatePlanRow) {
    startTransition(async () => {
      const result = await toggleRatePlanActive(row.id, !row.active);
      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: result.error,
        });
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> New rate plan
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stay</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No rate plans yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.siteTypeName ?? "All site types"}</TableCell>
                  <TableCell>
                    {formatCents(row.pricePerUnitCents)}{" "}
                    <span className="text-xs text-muted-foreground">
                      {CHARGE_UNIT_LABELS[row.chargeUnit].toLowerCase()}
                    </span>
                  </TableCell>
                  <TableCell>{formatStayRange(row.minStayDays, row.maxStayDays)}</TableCell>
                  <TableCell className="text-xs">
                    {formatEffective(row.effectiveFrom, row.effectiveTo)}
                  </TableCell>
                  <TableCell>{row.priority}</TableCell>
                  <TableCell>
                    {row.active ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(row)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggle(row)}>
                          {row.active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => onDelete(row)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing.id ? "Edit rate plan" : "New rate plan"}
            </DialogTitle>
            <DialogDescription>
              The pricing engine picks the highest-priority plan whose stay
              length and effective range match the booking.
            </DialogDescription>
          </DialogHeader>
          <RatePlanForm
            defaultValues={editing}
            siteTypes={siteTypes}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
