import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  STEP_LABELS,
  STEP_SLUGS,
  type StepSlug,
  prevStep,
} from "../_lib/steps";

type Props = {
  step: StepSlug;
  title: string;
  description?: string;
  /** Optional skip target — if absent, no Skip link is shown. */
  skipHref?: string;
  children: ReactNode;
};

/**
 * Shared frame for every wizard step. Renders the progress strip at the
 * top, a back link, the step's title/description, the per-step children,
 * and a Skip link (when this step's optional). The Continue button lives
 * inside the per-step form so each form owns its own validation + persist.
 */
export function WizardShell({
  step,
  title,
  description,
  skipHref,
  children,
}: Props) {
  const stepIndex = STEP_SLUGS.indexOf(step);
  const back = prevStep(step);

  return (
    <main className="min-h-screen bg-muted/30 py-8">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Step {stepIndex + 1} of {STEP_SLUGS.length} · {STEP_LABELS[step]}
          </div>
          {skipHref ? (
            <Link
              href={skipHref}
              className="font-medium underline hover:text-foreground"
            >
              Skip for now
            </Link>
          ) : null}
        </div>

        <ProgressStrip current={step} />

        <div className="mt-6 rounded-lg border bg-card p-6 shadow-sm">
          {back ? (
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
              <Link href={`/admin/setup/${back}`}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Link>
            </Button>
          ) : null}
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

function ProgressStrip({ current }: { current: StepSlug }) {
  const idx = STEP_SLUGS.indexOf(current);
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${STEP_SLUGS.length}, minmax(0, 1fr))` }}>
      {STEP_SLUGS.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full ${
            i <= idx ? "bg-primary" : "bg-muted"
          }`}
          title={STEP_LABELS[s]}
        />
      ))}
    </div>
  );
}
