"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { bulkCreateSites } from "./actions";
import {
  BULK_MAX_COUNT,
  bulkSiteFormSchema,
  generateBulkLabels,
  type BulkSiteFormValues,
} from "./schema";
import type { SiteTypeOption } from "./site-form";

const PREVIEW_HEAD = 5;
const PREVIEW_TAIL = 5;

function buildPreview(labels: string[]): string {
  if (labels.length <= PREVIEW_HEAD + PREVIEW_TAIL) return labels.join(", ");
  const head = labels.slice(0, PREVIEW_HEAD).join(", ");
  const tail = labels.slice(-PREVIEW_TAIL).join(", ");
  return `${head}, …, ${tail}`;
}

export function BulkSiteForm({
  siteTypes,
  onSaved,
  onCancel,
}: {
  siteTypes: SiteTypeOption[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const firstActiveType = siteTypes.find((t) => !t.archived)?.id ?? "";

  const form = useForm<BulkSiteFormValues>({
    resolver: zodResolver(bulkSiteFormSchema),
    defaultValues: {
      siteTypeId: firstActiveType,
      prefix: "",
      startNumber: 1,
      count: 1,
      tagsText: "",
    },
  });

  const prefix = form.watch("prefix") ?? "";
  const rawStart = form.watch("startNumber");
  const rawCount = form.watch("count");
  const startNumber = Number(rawStart);
  const count = Number(rawCount);
  const previewValid =
    Number.isFinite(startNumber) &&
    startNumber >= 1 &&
    Number.isFinite(count) &&
    count >= 1 &&
    count <= BULK_MAX_COUNT;
  const previewLabels = previewValid
    ? generateBulkLabels({ prefix, startNumber, count })
    : [];
  const previewText = previewLabels.length ? buildPreview(previewLabels) : "—";

  function onSubmit(values: BulkSiteFormValues) {
    startTransition(async () => {
      const parsed = bulkSiteFormSchema.safeParse(values);
      if (!parsed.success) {
        toast({
          variant: "destructive",
          title: "Invalid input",
          description: parsed.error.issues[0]?.message,
        });
        return;
      }
      const result = await bulkCreateSites(parsed.data);
      if (result.ok) {
        toast({
          title: `Created ${result.createdCount} site${result.createdCount === 1 ? "" : "s"}`,
        });
        onSaved();
      } else {
        toast({
          variant: "destructive",
          title: "Bulk create failed",
          description: result.error,
        });
      }
    });
  }

  const submitLabel = previewValid
    ? `Create ${count} site${count === 1 ? "" : "s"}`
    : "Create sites";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="siteTypeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Site type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a site type" />
                  </SelectTrigger>
                </FormControl>
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
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={form.control}
            name="prefix"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Label prefix</FormLabel>
                <FormControl>
                  <Input
                    placeholder='e.g. "A"'
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>Optional. Max 20 chars.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="startNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start at</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    {...field}
                    value={field.value == null ? "" : String(field.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="count"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Count</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={BULK_MAX_COUNT}
                    {...field}
                    value={field.value == null ? "" : String(field.value)}
                  />
                </FormControl>
                <FormDescription>1–{BULK_MAX_COUNT}.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="tagsText"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default tags</FormLabel>
              <FormControl>
                <Input
                  placeholder="shaded, pull-through"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormDescription>
                Comma-separated. Applied to every new site.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Preview
          </div>
          <div className="mt-1 break-words font-mono">{previewText}</div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isPending || !previewValid || !firstActiveType}
          >
            {isPending ? "Creating…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
