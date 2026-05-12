"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Layers, MoreHorizontal, Plus } from "lucide-react";

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
import {
  archiveSite,
  restoreSite,
  toggleSiteActive,
} from "./actions";
import { BulkSiteForm } from "./bulk-site-form";
import { SiteForm, type SiteTypeOption } from "./site-form";
import { type SiteFormValues } from "./schema";

export type SiteRow = {
  id: string;
  label: string;
  siteTypeId: string;
  siteTypeName: string;
  notes: string | null;
  tags: string[];
  active: boolean;
  archived: boolean;
};

const EMPTY = (defaultSiteTypeId: string): SiteFormValues => ({
  id: undefined,
  siteTypeId: defaultSiteTypeId,
  label: "",
  notes: "",
  tags: [],
  active: true,
});

export function SitesList({
  rows,
  siteTypes,
  tagSuggestions,
}: {
  rows: SiteRow[];
  siteTypes: SiteTypeOption[];
  tagSuggestions: ReadonlyArray<string>;
}) {
  const firstActiveType = siteTypes.find((t) => !t.archived)?.id ?? "";
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<SiteFormValues>(
    EMPTY(firstActiveType),
  );
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  function openCreate() {
    setEditing(EMPTY(firstActiveType));
    setOpen(true);
  }

  function openEdit(row: SiteRow) {
    setEditing({
      id: row.id,
      siteTypeId: row.siteTypeId,
      label: row.label,
      notes: row.notes ?? "",
      tags: row.tags,
      active: row.active,
    });
    setOpen(true);
  }

  function onArchive(row: SiteRow) {
    if (
      !confirm(
        `Archive site "${row.label}"? Existing reservations are preserved; the site will hide from new bookings.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await archiveSite(row.id);
      if (result.ok) {
        toast({ title: "Site archived" });
      } else {
        toast({
          variant: "destructive",
          title: "Archive failed",
          description: result.error,
        });
      }
    });
  }

  function onRestore(row: SiteRow) {
    startTransition(async () => {
      const result = await restoreSite(row.id);
      if (result.ok) {
        toast({ title: "Site restored" });
      } else {
        toast({
          variant: "destructive",
          title: "Restore failed",
          description: result.error,
        });
      }
    });
  }

  function onToggle(row: SiteRow) {
    startTransition(async () => {
      const result = await toggleSiteActive(row.id, !row.active);
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
      <div className="mb-4 flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setBulkOpen(true)}
          disabled={!firstActiveType}
        >
          <Layers className="mr-1 h-4 w-4" /> Bulk create
        </Button>
        <Button onClick={openCreate} disabled={!firstActiveType}>
          <Plus className="mr-1 h-4 w-4" /> New site
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Site type</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  {firstActiveType
                    ? "No sites yet. Add one to get started."
                    : "Create a site type before adding sites."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={row.archived ? "opacity-60" : undefined}
                >
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell>{row.siteTypeName}</TableCell>
                  <TableCell>
                    {row.tags.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.tags.map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.archived ? (
                      <Badge variant="secondary">Archived</Badge>
                    ) : row.active ? (
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
                        {!row.archived ? (
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/sites/${row.id}/photos`}>
                              Photos
                            </Link>
                          </DropdownMenuItem>
                        ) : null}
                        {!row.archived ? (
                          <DropdownMenuItem onClick={() => onToggle(row)}>
                            {row.active ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                        ) : null}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing.id ? "Edit site" : "New site"}</DialogTitle>
            <DialogDescription>
              Sites inherit hookups and capacity rules from their site type.
            </DialogDescription>
          </DialogHeader>
          <SiteForm
            defaultValues={editing}
            siteTypes={siteTypes}
            tagSuggestions={tagSuggestions}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk create sites</DialogTitle>
            <DialogDescription>
              Create up to 100 sites at once with sequential labels. Tags
              apply to every site.
            </DialogDescription>
          </DialogHeader>
          <BulkSiteForm
            siteTypes={siteTypes}
            tagSuggestions={tagSuggestions}
            onSaved={() => setBulkOpen(false)}
            onCancel={() => setBulkOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
