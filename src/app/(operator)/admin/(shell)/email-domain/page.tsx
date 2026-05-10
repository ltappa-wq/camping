import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { PageHeader } from "@/components/admin/page-header";
import {
  getSendingDomainStatus,
  SendingDomainNotFoundError,
} from "@/lib/sending-domain";
import { EmailDomainPage } from "./email-domain-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requireOperatorPropertyOrSetup();
  const p = ctx.property;

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
      <EmailDomainPage
        sendingDomain={p.sendingDomain}
        sendingDomainVerified={p.sendingDomainVerified}
        sendingFromLocal={p.sendingFromLocal}
        initialRecords={initialRecords}
        domainMissingInResend={domainMissingInResend}
        fallbackFrom={fallbackFrom}
      />
    </div>
  );
}
