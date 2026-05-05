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
import { deleteAddon, toggleAddonActive } from "./actions";
import { AddonForm } from "./addon-form";
import type { AddonFormValues } from "./schema";

export type AddonRow = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  inventoryCount: number | null;
  active: boolean;
};

const EMPTY: AddonFormValues = {
  id: undefined,
  name: "",
  description: "",
  priceDollars: 0,
  inventoryCount: null,
  active: true,
};

export function AddonsList({ rows }: { rows: AddonRow[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AddonFormValues>(EMPTY);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  function openCreate() {
    setEditing(EMPTY);
    setOpen(true);
  }

  function openEdit(row: AddonRow) {
    setEditing({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      priceDollars: centsToDollars(row.priceCents),
      inventoryCount: row.inventoryCount,
      active: row.active,
    });
    setOpen(true);
  }

  function onDelete(row: AddonRow) {
    if (!confirm(`Delete add-on "${row.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteAddon(row.id);
      if (result.ok) {
        toast({ title: "Add-on deleted" });
      } else {
        toast({
          variant: "destructive",
          title: "Delete failed",
          description: result.error,
        });
      }
    });
  }

  function onToggle(row: AddonRow) {
    startTransition(async () => {
      const result = await toggleAddonActive(row.id, !row.active);
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
          <Plus className="mr-1 h-4 w-4" /> New add-on
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Inventory</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No add-ons yet. Try firewood, ice, propane, etc.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <div>{row.name}</div>
                    {row.description ? (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {row.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatCents(row.priceCents)}</TableCell>
                  <TableCell>
                    {row.inventoryCount == null ? (
                      <span className="text-muted-foreground">Unlimited</span>
                    ) : (
                      row.inventoryCount
                    )}
                  </TableCell>
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
              {editing.id ? "Edit add-on" : "New add-on"}
            </DialogTitle>
            <DialogDescription>
              Optional purchases offered at checkout.
            </DialogDescription>
          </DialogHeader>
          <AddonForm
            defaultValues={editing}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
