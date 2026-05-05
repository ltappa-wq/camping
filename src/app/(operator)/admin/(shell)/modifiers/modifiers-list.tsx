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
import { formatCents } from "@/lib/money";
import { deleteModifier, toggleModifierActive } from "./actions";
import { ModifierForm, type SiteTypeOption } from "./modifier-form";
import {
  DAY_LABELS,
  fromModifierValue,
  type Direction,
  type ModifierApplies,
  type ModifierFormValues,
  type ModifierType,
} from "./schema";

export type ModifierRow = {
  id: string;
  name: string;
  siteTypeId: string | null;
  siteTypeName: string | null;
  modifierType: ModifierType;
  modifierValue: number;
  appliesTo: ModifierApplies;
  daysOfWeek: number[];
  startDate: string | null;
  endDate: string | null;
  priority: number;
  active: boolean;
};

const EMPTY: ModifierFormValues = {
  id: undefined,
  name: "",
  siteTypeId: null,
  modifierType: "PERCENT",
  direction: "SURCHARGE",
  magnitude: 0,
  appliesTo: "DAY_OF_WEEK",
  daysOfWeek: [],
  startDate: null,
  endDate: null,
  priority: 0,
  active: true,
};

function formatAdjustment(
  type: ModifierType,
  value: number,
): { sign: "+" | "−"; text: string; direction: Direction } {
  const direction: Direction = value < 0 ? "DISCOUNT" : "SURCHARGE";
  const sign = value < 0 ? "−" : "+";
  const abs = Math.abs(value);
  const text = type === "PERCENT" ? `${abs / 100}%` : formatCents(abs);
  return { sign, text, direction };
}

function formatTrigger(row: ModifierRow): string {
  if (row.appliesTo === "DAY_OF_WEEK") {
    if (row.daysOfWeek.length === 0) return "—";
    return row.daysOfWeek
      .slice()
      .sort()
      .map((d) => DAY_LABELS[d])
      .join(", ");
  }
  if (row.startDate && row.endDate) {
    return `${row.startDate} → ${row.endDate}`;
  }
  return "—";
}

export function ModifiersList({
  rows,
  siteTypes,
}: {
  rows: ModifierRow[];
  siteTypes: SiteTypeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ModifierFormValues>(EMPTY);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  function openCreate() {
    setEditing(EMPTY);
    setOpen(true);
  }

  function openEdit(row: ModifierRow) {
    const { direction, magnitude } = fromModifierValue(row.modifierValue);
    setEditing({
      id: row.id,
      name: row.name,
      siteTypeId: row.siteTypeId,
      modifierType: row.modifierType,
      direction,
      magnitude,
      appliesTo: row.appliesTo,
      daysOfWeek: row.daysOfWeek,
      startDate: row.startDate,
      endDate: row.endDate,
      priority: row.priority,
      active: row.active,
    });
    setOpen(true);
  }

  function onDelete(row: ModifierRow) {
    if (!confirm(`Delete modifier "${row.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteModifier(row.id);
      if (result.ok) {
        toast({ title: "Modifier deleted" });
      } else {
        toast({
          variant: "destructive",
          title: "Delete failed",
          description: result.error,
        });
      }
    });
  }

  function onToggle(row: ModifierRow) {
    startTransition(async () => {
      const result = await toggleModifierActive(row.id, !row.active);
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
          <Plus className="mr-1 h-4 w-4" /> New modifier
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Adjustment</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No modifiers yet. Add one for weekend pricing, holiday surcharges, etc.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const adj = formatAdjustment(row.modifierType, row.modifierValue);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <span
                        className={
                          adj.direction === "DISCOUNT"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : ""
                        }
                      >
                        {adj.sign}
                        {adj.text}
                      </span>
                    </TableCell>
                    <TableCell>{row.siteTypeName ?? "All site types"}</TableCell>
                    <TableCell className="text-xs">{formatTrigger(row)}</TableCell>
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
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing.id ? "Edit modifier" : "New modifier"}
            </DialogTitle>
            <DialogDescription>
              Surcharges and discounts that stack on top of the chosen rate plan.
            </DialogDescription>
          </DialogHeader>
          <ModifierForm
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
