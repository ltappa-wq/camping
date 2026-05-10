"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { saveProperty } from "./actions";
import { HeroImageUpload } from "./hero-image-upload";
import { MapImageUpload } from "./map-image-upload";
import { propertyFormSchema, type PropertyFormValues } from "./schema";

const MAX_LONG_TEXT = 5000;

export function PropertyForm({
  defaultValues,
}: {
  defaultValues: PropertyFormValues;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertyFormSchema),
    defaultValues,
  });

  function onSubmit(values: PropertyFormValues) {
    startTransition(async () => {
      // Re-parse to apply transforms (trim, optional → undefined, etc.)
      const parsed = propertyFormSchema.safeParse(values);
      if (!parsed.success) {
        toast({
          variant: "destructive",
          title: "Validation failed",
          description:
            parsed.error.issues[0]?.message ?? "Check the form for errors.",
        });
        return;
      }
      const result = await saveProperty(parsed.data);
      if (result.ok) {
        toast({ title: "Property saved" });
      } else {
        toast({
          variant: "destructive",
          title: "Save failed",
          description: result.error,
        });
      }
    });
  }

  const watchDescription = form.watch("description") ?? "";
  const watchRules = form.watch("rulesText") ?? "";
  const watchDirections = form.watch("directionsText") ?? "";
  const watchInstructions = form.watch("checkInInstructions") ?? "";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
            <CardDescription>Name, address, and contact info.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Property name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="addressLine1"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Address line 1</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="addressLine2"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Address line 2</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} maxLength={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
            <CardDescription>Optional logo and theme color.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="logoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo URL</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="https://…"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="primaryColor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary color</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="#1f6feb"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hero image</CardTitle>
            <CardDescription>
              The big banner shown at the top of your public landing page.
              Manage your gallery on the{" "}
              <a
                href="/admin/property/photos"
                className="underline hover:text-foreground"
              >
                Photos
              </a>{" "}
              page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="heroImageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <HeroImageUpload
                      value={field.value ?? null}
                      onChange={(url) =>
                        form.setValue("heroImageUrl", url, {
                          shouldDirty: true,
                        })
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Map</CardTitle>
            <CardDescription>
              Campground map image shown on the public booking page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="mapImageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <MapImageUpload
                      value={field.value ?? null}
                      onChange={(url) =>
                        form.setValue("mapImageUrl", url, {
                          shouldDirty: true,
                        })
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operating hours</CardTitle>
            <CardDescription>
              Annual season window and daily check-in/out times.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium">Season window</div>
              <p className="mb-3 text-xs text-muted-foreground">
                Leave blank if you operate year-round.
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <FormField
                  control={form.control}
                  name="seasonStartMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start month</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={12}
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
                  name="seasonStartDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start day</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={31}
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
                  name="seasonEndMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End month</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={12}
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
                  name="seasonEndDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End day</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          {...field}
                          value={field.value == null ? "" : String(field.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="checkInTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check-in time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormDescription>24h format, e.g. 14:00</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="checkOutTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check-out time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormDescription>24h format, e.g. 11:00</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cancellation policy</CardTitle>
            <CardDescription>
              Days before arrival when full / partial refund applies.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="cancelFullRefundDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full-refund days</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      value={field.value == null ? "" : String(field.value)}
                    />
                  </FormControl>
                  <FormDescription>≥ this many → 100%</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cancelPartialRefundDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Partial-refund days</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      value={field.value == null ? "" : String(field.value)}
                    />
                  </FormControl>
                  <FormDescription>≥ this many → partial</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cancelPartialRefundPct"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Partial refund %</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      {...field}
                      value={field.value == null ? "" : String(field.value)}
                    />
                  </FormControl>
                  <FormDescription>0–100</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Public info</CardTitle>
            <CardDescription>
              Long-form text shown on the public booking page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      maxLength={MAX_LONG_TEXT}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription className="flex justify-end">
                    {watchDescription.length} / {MAX_LONG_TEXT}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rulesText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rules</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      maxLength={MAX_LONG_TEXT}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription className="flex justify-end">
                    {watchRules.length} / {MAX_LONG_TEXT}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="directionsText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Directions</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      maxLength={MAX_LONG_TEXT}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription className="flex justify-end">
                    {watchDirections.length} / {MAX_LONG_TEXT}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guest self-service</CardTitle>
            <CardDescription>
              How close to check-in guests can modify or cancel their own
              bookings online.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="guestModificationCutoffHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modification cutoff (hours)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={720}
                      {...field}
                      value={field.value == null ? "" : String(field.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    Block modifications and cancellations within this many
                    hours of check-in. Set to 0 to disable guest self-
                    service entirely.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reminder emails</CardTitle>
            <CardDescription>
              Toggle the four scheduled emails to your guests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReminderToggle
              control={form.control}
              name="reminder7DaysEnabled"
              label="Send 7-day reminder email"
              description="One week before check-in."
            />
            <ReminderToggle
              control={form.control}
              name="reminder3DaysEnabled"
              label="Send 3-day reminder email"
              description="Three days before check-in. Check-in instructions get extra emphasis here."
            />
            <ReminderToggle
              control={form.control}
              name="reminderArrivalDayEnabled"
              label="Send arrival day email"
              description="Morning of check-in. Last-mile logistics."
            />
            <ReminderToggle
              control={form.control}
              name="reminderPostStayEnabled"
              label="Send post-stay thank-you email"
              description="One day after check-out."
            />

            <FormField
              control={form.control}
              name="checkInInstructions"
              render={({ field }) => (
                <FormItem className="border-t pt-4">
                  <FormLabel>Check-in instructions (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      maxLength={MAX_LONG_TEXT}
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Parking notes, gate codes, anything guests need to know before arriving."
                    />
                  </FormControl>
                  <FormDescription className="flex justify-between">
                    <span>
                      Included in the 7-day, 3-day, and arrival-day emails.
                    </span>
                    <span>
                      {watchInstructions.length} / {MAX_LONG_TEXT}
                    </span>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReminderToggle({
  control,
  name,
  label,
  description,
}: {
  control: any;
  name: string;
  label: string;
  description: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <FormLabel>{label}</FormLabel>
            <FormDescription>{description}</FormDescription>
          </div>
          <FormControl>
            <Switch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
