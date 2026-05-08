"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateOperatorNotesAction } from "./actions";

export function OperatorNotesForm({
  reservationId,
  initial,
}: {
  reservationId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onCancel() {
    setValue(initial);
    setError(null);
    setEditing(false);
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateOperatorNotesAction(reservationId, value);
      if (res.ok) {
        setEditing(false);
      } else {
        setError(res.error);
      }
    });
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        {initial ? (
          <p className="whitespace-pre-line text-sm">{initial}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No notes yet.
          </p>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          {initial ? "Edit notes" : "Add notes"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        placeholder="Operator-only notes — not visible to the guest."
      />
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save notes"}
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
