"use client";

import { useEffect, useTransition } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { saveSiteType } from "./actions";
import {
  siteTypeFormSchema,
  type SiteTypeFormValues,
} from "./schema";

export function SiteTypeForm({
  defaultValues,
  onSaved,
  onCancel,
}: {
  defaultValues: SiteTypeFormValues;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<SiteTypeFormValues>({
    resolver: zodResolver(siteTypeFormSchema),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues.id]);

  function onSubmit(values: SiteTypeFormValues) {
    startTransition(async () => {
      const parsed = siteTypeFormSchema.safeParse(values);
      if (!parsed.success) {
        toast({
          variant: "destructive",
          title: "Invalid input",
          description: parsed.error.issues[0]?.message,
        });
        return;
      }
      const result = await saveSiteType(parsed.data);
      if (result.ok) {
        toast({ title: defaultValues.id ? "Site type updated" : "Site type created" });
        onSaved();
      } else {
        toast({
          variant: "destructive",
          title: "Save failed",
          description: result.error,
        });
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Wooded Electric Site"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="Shaded sites with 30A electric, no water hookup."
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <fieldset className="space-y-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Hookups</legend>
          <FormField
            control={form.control}
            name="electricAmps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Electric (amps)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="30"
                    {...field}
                    value={field.value == null ? "" : String(field.value)}
                  />
                </FormControl>
                <FormDescription>Leave blank for no electric.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="hasWater"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <FormLabel className="m-0">Water</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hasSewer"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <FormLabel className="m-0">Sewer</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Capacity</legend>
          <div className="grid grid-cols-3 gap-3">
            <FormField
              control={form.control}
              name="maxRvLengthFt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max RV (ft)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="—"
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
              name="maxAdults"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max adults</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="—"
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
              name="maxChildren"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max children</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="—"
                      {...field}
                      value={field.value == null ? "" : String(field.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Allowed</legend>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="petsAllowed"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <FormLabel className="m-0">Pets</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tentsAllowed"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <FormLabel className="m-0">Tents</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
