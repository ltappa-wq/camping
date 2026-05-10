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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { saveClosedDateRange } from "./actions";
import {
  closedDateRangeFormSchema,
  type ClosedDateRangeFormValues,
} from "./schema";

export function ClosedDateRangeForm({
  defaultValues,
  onSaved,
  onCancel,
}: {
  defaultValues: ClosedDateRangeFormValues;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<ClosedDateRangeFormValues>({
    resolver: zodResolver(closedDateRangeFormSchema),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues.id]);

  function onSubmit(values: ClosedDateRangeFormValues) {
    startTransition(async () => {
      const parsed = closedDateRangeFormSchema.safeParse(values);
      if (!parsed.success) {
        toast({
          variant: "destructive",
          title: "Invalid input",
          description: parsed.error.issues[0]?.message,
        });
        return;
      }
      const result = await saveClosedDateRange(parsed.data);
      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "Save failed",
          description: result.error,
        });
        return;
      }
      if (result.overlappingReservations > 0) {
        toast({
          title: defaultValues.id ? "Closure updated" : "Closure added",
          description: `${result.overlappingReservations} existing reservation${
            result.overlappingReservations === 1 ? "" : "s"
          } overlap this range. They will be honored — only new bookings are blocked.`,
        });
      } else {
        toast({
          title: defaultValues.id ? "Closure updated" : "Closure added",
        });
      }
      onSaved();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormDescription>Inclusive — closure covers this day.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reason (optional)</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  maxLength={200}
                  placeholder="Maintenance, holiday, owner stay…"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormDescription>
                Internal note; not shown to guests.
              </FormDescription>
              <FormMessage />
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
