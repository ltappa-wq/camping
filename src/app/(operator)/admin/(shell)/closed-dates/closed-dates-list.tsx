"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Plus } from "lucide-react";

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
import { deleteClosedDateRange } from "./actions";
import { ClosedDateRangeForm } from "./closed-date-range-form";
import type { ClosedDateRangeFormValues } from "./schema";

export type ClosedDateRangeRow = {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  reason: string | null;
};

const EMPTY: ClosedDateRangeFormValues = {
  id: undefined,
  startDate: "",
  endDate: "",
  reason: "",
};

export function ClosedDatesList({ rows }: { rows: ClosedDateRangeRow[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClosedDateRangeFormValues>(EMPTY);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  function openCreate() {
    setEditing(EMPTY);
    setOpen(true);
  }

  function openEdit(row: ClosedDateRangeRow) {
    setEditing({
      id: row.id,
      startDate: row.startDate,
      endDate: row.endDate,
      reason: row.reason ?? "",
    });
    setOpen(true);
  }

  function onDelete(row: ClosedDateRangeRow) {
    if (
      !confirm(
        `Remove the closure for ${row.startDate}${
          row.startDate === row.endDate ? "" : ` → ${row.endDate}`
        }? Bookings will be allowed in this range again.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteClosedDateRange(row.id);
      if (result.ok) {
        toast({ title: "Closure removed" });
      } else {
        toast({
          variant: "destructive",
          title: "Remove failed",
          description: result.error,
        });
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add closed dates
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Start date</TableHead>
              <TableHead className="w-32">End date</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-muted-foreground"
                >
                  No closures yet. Add holidays, maintenance windows, or any
                  date range that should be unbookable.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">
                    {row.startDate}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.endDate}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.reason ?? <span className="italic">No reason</span>}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(row)}>
                          Edit
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
              {editing.id ? "Edit closed dates" : "Add closed dates"}
            </DialogTitle>
            <DialogDescription>
              Block a date range from new bookings. Both ends are inclusive.
            </DialogDescription>
          </DialogHeader>
          <ClosedDateRangeForm
            defaultValues={editing}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
