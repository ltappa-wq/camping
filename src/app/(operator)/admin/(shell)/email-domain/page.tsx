import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import { isImpersonatingRequest } from "@/lib/impersonation-block";
import {
  getSendingDomainStatus,
  SendingDomainNotFoundError,
} from "@/lib/sending-domain";
import { EmailDomainPage } from "./email-domain-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requireOperatorPropertyOrSetup();
  const p = ctx.property;
  const impersonating = await isImpersonatingRequest();

  // Fetch DNS records up front when a domain is configured but not yet
  // verified — saves the operator a click and matches what Resend will
  // show in the unverified state. Best-effort: if the fetch fails (e.g.
  // Resend deleted the record server-side), we render the form so the
  // operator can re-add.
  let initialRecords: Awaited<
    ReturnType<typeof getSendingDomainStatus>
  >["records"] = [];
  let domainMissingInResend = false;
  if (p.sendingDomainResendId && !p.sendingDomainVerified) {
    try {
      const status = await getSendingDomainStatus(p.sendingDomainResendId);
      initialRecords = status.records;
    } catch (e) {
      domainMissingInResend = e instanceof SendingDomainNotFoundError;
    }
  }

  const fallbackFrom =
    process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  return (
    <div>
      <PageHeader
        title="Email domain"
        description="Send guest emails from your own address instead of the platform default."
      />
      {impersonating ? (
        <ImpersonationReadOnlyNotice
          sendingDomain={p.sendingDomain}
          sendingDomainVerified={p.sendingDomainVerified}
          sendingFromLocal={p.sendingFromLocal}
          fallbackFrom={fallbackFrom}
        />
      ) : (
        <EmailDomainPage
          sendingDomain={p.sendingDomain}
          sendingDomainVerified={p.sendingDomainVerified}
          sendingFromLocal={p.sendingFromLocal}
          initialRecords={initialRecords}
          domainMissingInResend={domainMissingInResend}
          fallbackFrom={fallbackFrom}
        />
      )}
    </div>
  );
}

function ImpersonationReadOnlyNotice({
  sendingDomain,
  sendingDomainVerified,
  sendingFromLocal,
  fallbackFrom,
}: {
  sendingDomain: string | null;
  sendingDomainVerified: boolean;
  sendingFromLocal: string;
  fallbackFrom: string;
}) {
  const currentFrom =
    sendingDomainVerified && sendingDomain
      ? `${sendingFromLocal}@${sendingDomain}`
      : fallbackFrom;
  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-medium">Read-only while acting as this operator.</div>
        <p className="mt-1 text-xs">
          ⓘ Sending-domain setup can only be changed by the operator
          (DNS access is theirs). Contact them directly to add or
          remove a domain.
        </p>
      </div>

      <div className="rounded-md border bg-card p-4 text-sm">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Current from address
        </div>
        <div className="mt-1 font-mono">{currentFrom}</div>
        {sendingDomain ? (
          <div className="mt-2 text-xs text-muted-foreground">
            Domain: {sendingDomain} ·{" "}
            {sendingDomainVerified ? "Verified" : "Pending verification"}
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">
            No custom domain configured. Mail goes from the platform
            fallback.
          </div>
        )}
      </div>
    </div>
  );
}
