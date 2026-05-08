"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateGuestInfoAction } from "./actions";

export type GuestInfoInitial = {
  reservationId: string;
  name: string;
  email: string;
  phone: string;
  rvMake: string;
  rvModel: string;
  rvYear: string;
  rvLengthFt: string;
  licensePlate: string;
};

export function GuestInfoForm({ initial }: { initial: GuestInfoInitial }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof GuestInfoInitial>(
    key: K,
    value: GuestInfoInitial[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onCancel() {
    setForm(initial);
    setError(null);
    setEditing(false);
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateGuestInfoAction(form);
      if (res.ok) {
        setEditing(false);
      } else {
        setError(res.error);
      }
    });
  }

  if (!editing) {
    return (
      <div className="space-y-2 text-sm">
        <Row label="Name">{initial.name || "—"}</Row>
        <Row label="Email">{initial.email || "—"}</Row>
        <Row label="Phone">{initial.phone || "—"}</Row>
        <Row label="RV">
          {[
            initial.rvYear,
            initial.rvMake,
            initial.rvModel,
            initial.rvLengthFt ? `${initial.rvLengthFt} ft` : null,
          ]
            .filter(Boolean)
            .join(" ") || "—"}
        </Row>
        <Row label="Plate">{initial.licensePlate || "—"}</Row>
        <div className="pt-1">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit guest info
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-3">
      <Field label="Name" required>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email" required>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            required
          />
        </Field>
        <Field label="Phone">
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="RV make">
          <Input
            value={form.rvMake}
            onChange={(e) => set("rvMake", e.target.value)}
          />
        </Field>
        <Field label="RV model">
          <Input
            value={form.rvModel}
            onChange={(e) => set("rvModel", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Year">
          <Input
            inputMode="numeric"
            value={form.rvYear}
            onChange={(e) => set("rvYear", e.target.value)}
          />
        </Field>
        <Field label="Length (ft)">
          <Input
            inputMode="numeric"
            value={form.rvLengthFt}
            onChange={(e) => set("rvLengthFt", e.target.value)}
          />
        </Field>
        <Field label="License plate">
          <Input
            value={form.licensePlate}
            onChange={(e) => set("licensePlate", e.target.value)}
          />
        </Field>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
