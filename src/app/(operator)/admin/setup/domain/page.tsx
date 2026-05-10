import Link from "next/link";

import { requireOperatorProperty } from "@/lib/auth-property";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { WizardShell } from "../_components/wizard-shell";

export const dynamic = "force-dynamic";

export default async function DomainStep() {
  const ctx = await requireOperatorProperty();
  const p = ctx.property;
  const verified = p?.sendingDomainVerified === true;

  return (
    <WizardShell
      step="domain"
      title="Sending domain (optional)"
      description="Send guest emails from your own domain instead of the platform default. Verification needs DNS access — feel free to skip and come back later."
      skipHref="/admin/setup/done"
    >
      <div className="space-y-4">
        {verified ? (
          <Alert>
            <AlertTitle>Verified</AlertTitle>
            <AlertDescription>
              Sending from{" "}
              <code>
                {p?.sendingFromLocal}@{p?.sendingDomain}
              </code>
              . You can manage this from the Email Domain page anytime.
            </AlertDescription>
          </Alert>
        ) : p?.sendingDomain ? (
          <Alert>
            <AlertTitle>Pending DNS verification</AlertTitle>
            <AlertDescription>
              <code>{p.sendingDomain}</code> is registered with Resend but not
              verified yet. Add the DNS records and click verify on the Email
              Domain page.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertTitle>Currently sending from the platform default</AlertTitle>
            <AlertDescription>
              Until you verify your own domain, Resend can only deliver
              transactional email to the address that owns this Resend account.
              Set up your sending domain to send to actual guests.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/admin/email-domain">
              <Mail className="mr-1 h-4 w-4" />
              {p?.sendingDomain ? "Manage domain" : "Add domain"}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/setup/done">I&apos;ll do this later</Link>
          </Button>
        </div>
      </div>
    </WizardShell>
  );
}
