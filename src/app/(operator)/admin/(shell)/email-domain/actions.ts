"use server";

import { revalidatePath } from "next/cache";

import { requireOperatorPropertyOrSetup } from "@/lib/auth-property";
import { blockIfImpersonating } from "@/lib/impersonation-block";
import {
  createSendingDomainViaResend,
  getSendingDomainStatus,
  removeSendingDomainViaResend,
  SendingDomainNotFoundError,
  triggerSendingDomainVerify,
  type DnsRecord,
} from "@/lib/sending-domain";
import { sendingDomainFormSchema, type SendingDomainFormParsed } from "./schema";

export type DomainState =
  | { kind: "none" }
  | {
      kind: "unverified";
      domain: string;
      fromLocal: string;
      records: DnsRecord[];
    }
  | { kind: "verified"; domain: string; fromLocal: string };

export type CreateResult =
  | { ok: true; records: DnsRecord[] }
  | { ok: false; error: string };

export type CheckResult =
  | { ok: true; verified: boolean; records: DnsRecord[] }
  | { ok: false; error: string; missing?: boolean };

export type RemoveResult = { ok: true } | { ok: false; error: string };

/**
 * Create a domain in Resend, store the Resend ID + operator's chosen
 * local-part on Property, and return the DNS records the operator must
 * add at their DNS provider. Until those are in place + verified,
 * sendingDomainVerified stays false and outgoing email keeps using the
 * platform default.
 */
// Decision: every Server Action in this file is operator-only. The
// DNS verification flow belongs to the operator — a platform admin
// shouldn't add, verify, or remove the sending domain on their behalf.
// blockIfImpersonating() throws; the /admin/email-domain page renders
// a read-only notice instead of these controls when impersonating.

export async function createSendingDomain(
  values: SendingDomainFormParsed,
): Promise<CreateResult> {
  await blockIfImpersonating();
  const ctx = await requireOperatorPropertyOrSetup();
  const parsed = sendingDomainFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { domain, fromLocal } = parsed.data;

  // If a previous domain is on file, ask Resend to remove it first so we
  // don't accumulate orphans. The local field overwrite happens below.
  if (ctx.property.sendingDomainResendId) {
    try {
      await removeSendingDomainViaResend(ctx.property.sendingDomainResendId);
    } catch {
      // Best-effort cleanup — if Resend has already lost the domain we
      // still want to proceed with creating the new one.
    }
  }

  let created;
  try {
    created = await createSendingDomainViaResend(domain);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create domain",
    };
  }

  await ctx.prisma.property.update({
    where: { id: ctx.propertyId },
    data: {
      sendingDomain: domain,
      sendingDomainResendId: created.resendId,
      sendingDomainVerified: created.status === "verified",
      sendingFromLocal: fromLocal,
    },
  });

  revalidatePath("/admin/email-domain");
  return { ok: true, records: created.records };
}

/**
 * Polls Resend for the current verification status. Updates the local
 * Property.sendingDomainVerified flag so subsequent emails pick up the
 * verified-domain path automatically. Surfaces the not-found case
 * specifically so the UI can prompt a re-add instead of a generic error.
 */
export async function checkDomainVerification(): Promise<CheckResult> {
  await blockIfImpersonating();
  const ctx = await requireOperatorPropertyOrSetup();
  const resendId = ctx.property.sendingDomainResendId;
  if (!resendId) {
    return { ok: false, error: "No sending domain configured." };
  }

  // Nudge Resend to attempt verification before we read status — they
  // also poll on their side, but a manual click should re-check now.
  try {
    await triggerSendingDomainVerify(resendId);
  } catch {
    // Non-fatal: the get() below still returns useful state.
  }

  let status;
  try {
    status = await getSendingDomainStatus(resendId);
  } catch (e) {
    if (e instanceof SendingDomainNotFoundError) {
      return {
        ok: false,
        missing: true,
        error:
          "Domain no longer found in Resend. Remove it here and add it again.",
      };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to check status",
    };
  }

  if (status.verified !== ctx.property.sendingDomainVerified) {
    await ctx.prisma.property.update({
      where: { id: ctx.propertyId },
      data: { sendingDomainVerified: status.verified },
    });
  }

  revalidatePath("/admin/email-domain");
  return { ok: true, verified: status.verified, records: status.records };
}

/**
 * Removes the operator's domain in Resend and clears the local Property
 * fields. After this, outgoing email reverts to the platform default
 * (RESEND_FROM_EMAIL). Existing EmailLog rows are unaffected — they
 * record what was sent at the time.
 */
export async function removeSendingDomain(): Promise<RemoveResult> {
  await blockIfImpersonating();
  const ctx = await requireOperatorPropertyOrSetup();
  const resendId = ctx.property.sendingDomainResendId;

  if (resendId) {
    try {
      await removeSendingDomainViaResend(resendId);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to remove from Resend",
      };
    }
  }

  await ctx.prisma.property.update({
    where: { id: ctx.propertyId },
    data: {
      sendingDomain: null,
      sendingDomainResendId: null,
      sendingDomainVerified: false,
      // Keep sendingFromLocal as the operator's preference — they'll
      // want the same prefix if they re-add later.
    },
  });

  revalidatePath("/admin/email-domain");
  return { ok: true };
}
