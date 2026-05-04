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
import { basisPointsToPercent, formatBasisPoints } from "@/lib/money";
import { deleteTaxRate, toggleTaxRateActive } from "./actions";
import { TaxRateForm } from "./tax-rate-form";
import type { TaxRateFormValues } from "./schema";

export type TaxRateRow = {
  id: string;
  name: string;
  basisPoints: number;
  appliesTo: string;
  active: boolean;
};

const APPLIES_LABEL: Record<string, string> = {
  STAY: "Stays only",
  ADDON: "Add-ons only",
  ALL: "Everything",
};

const EMPTY: TaxRateFormValues = {
  id: undefined,
  name: "",
  ratePercent: 0,
  appliesTo: "STAY",
  active: true,
};

export function TaxRatesList({ rows }: { rows: TaxRateRow[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRateFormValues>(EMPTY);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  function openCreate() {
    setEditing(EMPTY);
    setOpen(true);
  }

  function openEdit(row: TaxRateRow) {
    setEditing({
      id: row.id,
      name: row.name,
      ratePercent: basisPointsToPercent(row.basisPoints),
      appliesTo: row.appliesTo as TaxRateFormValues["appliesTo"],
      active: row.active,
    });
    setOpen(true);
  }

  function onDelete(row: TaxRateRow) {
    if (!confirm(`Delete tax rate "${row.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteTaxRate(row.id);
      if (result.ok) {
        toast({ title: "Tax rate deleted" });
      } else {
        toast({
          variant: "destructive",
          title: "Delete failed",
          description: result.error,
        });
      }
    });
  }

  function onToggle(row: TaxRateRow) {
    startTransition(async () => {
      const result = await toggleTaxRateActive(row.id, !row.active);
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
          <Plus className="mr-1 h-4 w-4" /> New tax rate
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No tax rates yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{formatBasisPoints(row.basisPoints)}</TableCell>
                  <TableCell>{APPLIES_LABEL[row.appliesTo] ?? row.appliesTo}</TableCell>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing.id ? "Edit tax rate" : "New tax rate"}
            </DialogTitle>
            <DialogDescription>
              Operators type the rate as a percent; we store basis points.
            </DialogDescription>
          </DialogHeader>
          <TaxRateForm
            defaultValues={editing}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
