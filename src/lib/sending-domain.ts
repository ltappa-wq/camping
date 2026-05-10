import { getResend } from "@/lib/resend";

// Server-only wrapper around Resend's Domains API. Returns DNS records
// in a normalized shape the UI can render without depending on the SDK's
// internal types. All callers run as Server Actions, so the API key
// stays on the server.

if (typeof window !== "undefined") {
  throw new Error("src/lib/sending-domain.ts must not be imported in client code");
}

export type DnsRecord = {
  /** "DKIM" or "SPF" — display label for the operator. */
  record: string;
  /** DNS record type: "TXT", "MX", "CNAME". */
  type: string;
  /** Hostname they need to add (e.g. "send.monumentpoint.com"). */
  name: string;
  /** Value to set on the record. */
  value: string;
  /** Required priority for MX records. Undefined for TXT/CNAME. */
  priority?: number;
  /** Resend's reported status — useful when polling. */
  status: string;
  /** TTL Resend recommends, as a string (e.g. "Auto" or "300"). */
  ttl: string;
};

export type SendingDomainStatus =
  | "pending"
  | "verified"
  | "failed"
  | "temporary_failure"
  | "not_started";

export type CreateDomainResult = {
  resendId: string;
  status: SendingDomainStatus;
  records: DnsRecord[];
};

export type GetDomainResult = {
  resendId: string;
  status: SendingDomainStatus;
  /** True when Resend reports the domain as verified. */
  verified: boolean;
  records: DnsRecord[];
};

/** Distinct error so callers can show "domain no longer in Resend" instead
 *  of a generic failure when Resend has cleaned up the record. */
export class SendingDomainNotFoundError extends Error {
  constructor() {
    super("Domain no longer found in Resend");
    this.name = "SendingDomainNotFoundError";
  }
}

function normalizeRecords(records: unknown): DnsRecord[] {
  if (!Array.isArray(records)) return [];
  return records.map((r) => {
    const rec = r as {
      record?: string;
      type?: string;
      name?: string;
      value?: string;
      priority?: number;
      status?: string;
      ttl?: string;
    };
    return {
      record: rec.record ?? "",
      type: rec.type ?? "",
      name: rec.name ?? "",
      value: rec.value ?? "",
      priority: rec.priority,
      status: rec.status ?? "",
      ttl: rec.ttl ?? "Auto",
    };
  });
}

/**
 * Create a domain in Resend. Returns its Resend ID (store on Property)
 * and the DNS records the operator needs to add at their DNS host.
 * Always created in us-east-1 — operators don't get a region picker in v1.
 */
export async function createSendingDomainViaResend(
  domain: string,
): Promise<CreateDomainResult> {
  const result = await getResend().domains.create({ name: domain });
  if (result.error || !result.data) {
    throw new Error(
      result.error?.message ?? "Failed to create domain in Resend",
    );
  }
  return {
    resendId: result.data.id,
    status: result.data.status as SendingDomainStatus,
    records: normalizeRecords(result.data.records),
  };
}

/**
 * Polls Resend for the current state of a previously-created domain.
 * Throws SendingDomainNotFoundError if Resend has deleted the record
 * server-side (rare; happens if there's abuse) so the UI can surface
 * an actionable "please re-add" message instead of a generic error.
 */
export async function getSendingDomainStatus(
  resendId: string,
): Promise<GetDomainResult> {
  const result = await getResend().domains.get(resendId);
  if (result.error || !result.data) {
    const msg = result.error?.message ?? "";
    if (
      msg.toLowerCase().includes("not found") ||
      msg.toLowerCase().includes("404")
    ) {
      throw new SendingDomainNotFoundError();
    }
    throw new Error(msg || "Failed to fetch domain from Resend");
  }
  return {
    resendId: result.data.id,
    status: result.data.status as SendingDomainStatus,
    verified: result.data.status === "verified",
    records: normalizeRecords(result.data.records),
  };
}

/**
 * Asks Resend to attempt verification for a domain. Resend also auto-verifies
 * in the background when DNS propagates; calling this just nudges things
 * along when the operator clicks "Check verification."
 */
export async function triggerSendingDomainVerify(
  resendId: string,
): Promise<void> {
  const result = await getResend().domains.verify(resendId);
  if (result.error) {
    // Surface only as a soft failure — the subsequent get() call is what
    // actually drives the UI state.
    throw new Error(result.error.message);
  }
}

/**
 * Removes a domain from Resend. Idempotent-ish: a 404 from Resend means
 * the record is already gone, which is fine — we still want to clear our
 * local Property fields. Caller decides whether to swallow.
 */
export async function removeSendingDomainViaResend(
  resendId: string,
): Promise<void> {
  const result = await getResend().domains.remove(resendId);
  if (result.error) {
    const msg = result.error.message ?? "";
    if (
      msg.toLowerCase().includes("not found") ||
      msg.toLowerCase().includes("404")
    ) {
      return;
    }
    throw new Error(msg);
  }
}
