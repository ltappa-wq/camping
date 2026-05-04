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
import { archiveSiteType, restoreSiteType } from "./actions";
import { SiteTypeForm } from "./site-type-form";
import type { SiteTypeFormValues } from "./schema";

export type SiteTypeRow = {
  id: string;
  name: string;
  description: string | null;
  electricAmps: number | null;
  hasWater: boolean;
  hasSewer: boolean;
  maxRvLengthFt: number | null;
  maxAdults: number | null;
  maxChildren: number | null;
  petsAllowed: boolean;
  tentsAllowed: boolean;
  archived: boolean;
  siteCount: number;
};

const EMPTY: SiteTypeFormValues = {
  id: undefined,
  name: "",
  description: "",
  electricAmps: null,
  hasWater: false,
  hasSewer: false,
  maxRvLengthFt: null,
  maxAdults: null,
  maxChildren: null,
  petsAllowed: true,
  tentsAllowed: false,
};

function summarizeHookups(row: SiteTypeRow): string {
  const parts: string[] = [];
  if (row.electricAmps != null) parts.push(`${row.electricAmps}A`);
  if (row.hasWater) parts.push("water");
  if (row.hasSewer) parts.push("sewer");
  return parts.length ? parts.join(" · ") : "—";
}

function summarizeCapacity(row: SiteTypeRow): string {
  const parts: string[] = [];
  if (row.maxAdults != null || row.maxChildren != null) {
    parts.push(
      `${row.maxAdults ?? "?"}A / ${row.maxChildren ?? "?"}C`,
    );
  }
  if (row.maxRvLengthFt != null) parts.push(`${row.maxRvLengthFt}ft`);
  return parts.length ? parts.join(" · ") : "—";
}

export function SiteTypesList({ rows }: { rows: SiteTypeRow[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SiteTypeFormValues>(EMPTY);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  function openCreate() {
    setEditing(EMPTY);
    setOpen(true);
  }

  function openEdit(row: SiteTypeRow) {
    setEditing({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      electricAmps: row.electricAmps,
      hasWater: row.hasWater,
      hasSewer: row.hasSewer,
      maxRvLengthFt: row.maxRvLengthFt,
      maxAdults: row.maxAdults,
      maxChildren: row.maxChildren,
      petsAllowed: row.petsAllowed,
      tentsAllowed: row.tentsAllowed,
    });
    setOpen(true);
  }

  function onArchive(row: SiteTypeRow) {
    const msg = row.siteCount
      ? `Archive "${row.name}"? ${row.siteCount} site(s) reference it; existing reservations are preserved but the type will hide from new bookings.`
      : `Archive "${row.name}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const result = await archiveSiteType(row.id);
      if (result.ok) {
        toast({ title: "Site type archived" });
      } else {
        toast({
          variant: "destructive",
          title: "Archive failed",
          description: result.error,
        });
      }
    });
  }

  function onRestore(row: SiteTypeRow) {
    startTransition(async () => {
      const result = await restoreSiteType(row.id);
      if (result.ok) {
        toast({ title: "Site type restored" });
      } else {
        toast({
          variant: "destructive",
          title: "Restore failed",
          description: result.error,
        });
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> New site type
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Hookups</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No site types yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className={row.archived ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">
                    <div>{row.name}</div>
                    {row.description ? (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {row.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{summarizeHookups(row)}</TableCell>
                  <TableCell>{summarizeCapacity(row)}</TableCell>
                  <TableCell>{row.siteCount}</TableCell>
                  <TableCell>
                    {row.archived ? (
                      <Badge variant="secondary">Archived</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
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
                        <DropdownMenuSeparator />
                        {row.archived ? (
                          <DropdownMenuItem onClick={() => onRestore(row)}>
                            Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onArchive(row)}
                          >
                            Archive
                          </DropdownMenuItem>
                        )}
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
              {editing.id ? "Edit site type" : "New site type"}
            </DialogTitle>
            <DialogDescription>
              Specs and rules that apply to every site of this type.
            </DialogDescription>
          </DialogHeader>
          <SiteTypeForm
            defaultValues={editing}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
