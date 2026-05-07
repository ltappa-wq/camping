import { CheckCircle2, Circle, AlertCircle } from "lucide-react";

import { requireOperatorProperty } from "@/lib/auth-property";
import { refreshAccountStatus } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { formatCents } from "@/lib/money";
import {
  continueOnboardingAction,
  openStripeDashboardAction,
} from "./actions";
import { FeeModeToggle } from "./fee-mode-toggle";

type Stage = "NOT_STARTED" | "IN_PROGRESS" | "ACTIVE";

function stageOf(org: {
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
}): Stage {
  if (!org.stripeAccountId) return "NOT_STARTED";
  if (
    org.stripeOnboardingComplete &&
    org.stripeChargesEnabled &&
    org.stripePayoutsEnabled
  ) {
    return "ACTIVE";
  }
  return "IN_PROGRESS";
}

const STAGE_COPY: Record<
  Stage,
  { label: string; tone: string; description: string }
> = {
  NOT_STARTED: {
    label: "Not started",
    tone: "bg-muted text-muted-foreground",
    description:
      "You haven't begun Stripe Connect setup. Online bookings are paused until payments are live.",
  },
  IN_PROGRESS: {
    label: "In progress",
    tone: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
    description:
      "Stripe needs more information before we can route bookings to your account.",
  },
  ACTIVE: {
    label: "Active",
    tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
    description: "You're set up to receive booking payouts.",
  },
};

export default async function PayoutsPage() {
  const ctx = await requireOperatorProperty();

  // Best-effort sync from Stripe in case account.updated webhooks were missed.
  // Failures here shouldn't block rendering — we'll show whatever's in the DB.
  try {
    await refreshAccountStatus(ctx.organization.id);
  } catch (err) {
    console.warn("refreshAccountStatus failed; rendering DB state", err);
  }

  const org = await prisma.organization.findUnique({
    where: { id: ctx.organization.id },
    select: {
      id: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      platformFeeFlatCents: true,
      customerPaysPlatformFee: true,
    },
  });
  if (!org) throw new Error("Organization not found");

  const stage = stageOf(org);
  const stageCopy = STAGE_COPY[stage];

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Connect your Stripe account so booking payments land in your bank."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Stripe Connect</CardTitle>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${stageCopy.tone}`}
              >
                {stageCopy.label}
              </span>
            </div>
            <CardDescription>{stageCopy.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              <FlagRow
                label="Onboarding complete"
                done={org.stripeOnboardingComplete}
              />
              <FlagRow
                label="Charges enabled"
                done={org.stripeChargesEnabled}
              />
              <FlagRow
                label="Payouts enabled"
                done={org.stripePayoutsEnabled}
              />
            </ul>

            <div className="flex flex-wrap gap-2 pt-2">
              {stage !== "ACTIVE" ? (
                <form action={continueOnboardingAction}>
                  <Button type="submit">
                    {stage === "NOT_STARTED"
                      ? "Set up payments"
                      : "Continue Stripe setup"}
                  </Button>
                </form>
              ) : null}
              {org.stripeAccountId ? (
                <form action={openStripeDashboardAction}>
                  <Button type="submit" variant="outline">
                    View Stripe dashboard
                  </Button>
                </form>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Per-booking fee</CardTitle>
            <CardDescription>What we keep from each booking.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatCents(org.platformFeeFlatCents)}
              </div>
              <p className="text-muted-foreground">
                Contact platform support to change the fee amount.
              </p>
            </div>
            <div className="border-t pt-4">
              <FeeModeToggle
                initialPassThrough={org.customerPaysPlatformFee}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function FlagRow({ label, done }: { label: string; done: boolean }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex items-center gap-2">
      <Icon
        className={done ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-muted-foreground"}
      />
      <span className={done ? "" : "text-muted-foreground"}>{label}</span>
      {!done ? (
        <AlertCircle className="ml-auto h-4 w-4 text-amber-500" />
      ) : null}
    </li>
  );
}
