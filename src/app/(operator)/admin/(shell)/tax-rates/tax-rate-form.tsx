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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { saveTaxRate } from "./actions";
import {
  TAX_APPLIES,
  taxRateFormSchema,
  type TaxRateFormValues,
} from "./schema";

const APPLIES_LABELS: Record<(typeof TAX_APPLIES)[number], string> = {
  STAY: "Stays only",
  ADDON: "Add-ons only",
  ALL: "Everything",
};

export function TaxRateForm({
  defaultValues,
  onSaved,
  onCancel,
}: {
  defaultValues: TaxRateFormValues;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<TaxRateFormValues>({
    resolver: zodResolver(taxRateFormSchema),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues.id]);

  function onSubmit(values: TaxRateFormValues) {
    startTransition(async () => {
      const parsed = taxRateFormSchema.safeParse(values);
      if (!parsed.success) {
        toast({
          variant: "destructive",
          title: "Invalid input",
          description: parsed.error.issues[0]?.message,
        });
        return;
      }
      const result = await saveTaxRate(parsed.data);
      if (result.ok) {
        toast({ title: defaultValues.id ? "Tax rate updated" : "Tax rate created" });
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="State Sales Tax"
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
          name="ratePercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rate (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  inputMode="decimal"
                  {...field}
                  value={field.value == null ? "" : String(field.value)}
                />
              </FormControl>
              <FormDescription>e.g. 5.5 for 5.50%.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="appliesTo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Applies to</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TAX_APPLIES.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {APPLIES_LABELS[opt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md border p-3">
              <div>
                <FormLabel>Active</FormLabel>
                <FormDescription>
                  Inactive tax rates are skipped at checkout.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
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
