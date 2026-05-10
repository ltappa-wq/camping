"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Check, Copy, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  checkDomainVerification,
  createSendingDomain,
  removeSendingDomain,
} from "./actions";
import {
  sendingDomainFormSchema,
  type SendingDomainFormValues,
} from "./schema";
import type { DnsRecord } from "@/lib/sending-domain";

type Props = {
  sendingDomain: string | null;
  sendingDomainVerified: boolean;
  sendingFromLocal: string;
  initialRecords: DnsRecord[];
  domainMissingInResend: boolean;
  fallbackFrom: string;
};

export function EmailDomainPage(props: Props) {
  if (props.sendingDomainVerified && props.sendingDomain) {
    return (
      <VerifiedState
        domain={props.sendingDomain}
        fromLocal={props.sendingFromLocal}
      />
    );
  }
  if (props.sendingDomain) {
    return (
      <UnverifiedState
        domain={props.sendingDomain}
        fromLocal={props.sendingFromLocal}
        records={props.initialRecords}
        missingInResend={props.domainMissingInResend}
      />
    );
  }
  return (
    <NoDomainState
      defaultLocal={props.sendingFromLocal}
      fallbackFrom={props.fallbackFrom}
    />
  );
}

function NoDomainState({
  defaultLocal,
  fallbackFrom,
}: {
  defaultLocal: string;
  fallbackFrom: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<SendingDomainFormValues>({
    resolver: zodResolver(sendingDomainFormSchema),
    defaultValues: { domain: "", fromLocal: defaultLocal || "bookings" },
  });

  function onSubmit(values: SendingDomainFormValues) {
    startTransition(async () => {
      const parsed = sendingDomainFormSchema.safeParse(values);
      if (!parsed.success) {
        toast({
          variant: "destructive",
          title: "Invalid input",
          description: parsed.error.issues[0]?.message,
        });
        return;
      }
      const result = await createSendingDomain(parsed.data);
      if (result.ok) {
        toast({
          title: "Domain added",
          description:
            "Add the DNS records below at your DNS provider, then click Check verification.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Could not add domain",
          description: result.error,
        });
      }
    });
  }

  const previewLocal = form.watch("fromLocal") || "bookings";
  const previewDomain = form.watch("domain") || "yourdomain.com";

  return (
    <div className="max-w-2xl space-y-4">
      <Alert>
        <AlertTitle>Currently sending from {fallbackFrom}</AlertTitle>
        <AlertDescription>
          Until you verify your own domain, transactional email goes from the
          platform default. Resend will only deliver these to the address that
          owns the Resend account, so guests will not receive them. Set up your
          domain to fix this.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4 rounded-md border bg-card p-4"
        >
          <FormField
            control={form.control}
            name="domain"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sending domain</FormLabel>
                <FormControl>
                  <Input
                    placeholder="monumentpointcamping.com"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  The apex domain you own. We&apos;ll generate DKIM and SPF
                  records you add at your DNS host.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fromLocal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>From address prefix</FormLabel>
                <FormControl>
                  <Input
                    placeholder="bookings"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Emails will go from{" "}
                  <code className="font-mono text-xs">
                    {previewLocal}@{previewDomain}
                  </code>
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Add domain
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function UnverifiedState({
  domain,
  fromLocal,
  records,
  missingInResend,
}: {
  domain: string;
  fromLocal: string;
  records: DnsRecord[];
  missingInResend: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [latestRecords, setLatestRecords] = useState<DnsRecord[]>(records);
  const [verified, setVerified] = useState(false);
  const { toast } = useToast();

  function onCheck() {
    startTransition(async () => {
      const result = await checkDomainVerification();
      if (!result.ok) {
        toast({
          variant: "destructive",
          title: result.missing
            ? "Domain not in Resend"
            : "Verification check failed",
          description: result.error,
        });
        return;
      }
      setLatestRecords(result.records);
      setVerified(result.verified);
      if (result.verified) {
        toast({
          title: "Domain verified",
          description: `Outgoing email now sends from ${fromLocal}@${domain}.`,
        });
      } else {
        toast({
          title: "Not verified yet",
          description:
            "DNS can take up to 72 hours to propagate. Try again later.",
        });
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      {missingInResend ? (
        <Alert variant="destructive">
          <AlertTitle>Domain no longer found in Resend</AlertTitle>
          <AlertDescription>
            The domain record was removed on Resend&apos;s side. Remove it here
            and add it again to start over.
          </AlertDescription>
        </Alert>
      ) : verified ? (
        <Alert>
          <AlertTitle>Verified</AlertTitle>
          <AlertDescription>
            Reload to see the active state, or open the page again later.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>Add these DNS records, then come back</AlertTitle>
          <AlertDescription>
            Sign in to your DNS provider (GoDaddy, Cloudflare, Namecheap, etc.)
            and add each row below exactly as shown. DNS changes can take up to
            72 hours to propagate; most resolve within an hour.
          </AlertDescription>
        </Alert>
      )}

      <DomainHeader domain={domain} fromLocal={fromLocal} verified={false} />

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Record</TableHead>
              <TableHead className="w-20">Type</TableHead>
              <TableHead>Name / Host</TableHead>
              <TableHead>Value</TableHead>
              <TableHead className="w-24">Priority</TableHead>
              <TableHead className="w-28">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {latestRecords.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-6 text-center text-muted-foreground"
                >
                  No DNS records returned. Try checking again, or remove and
                  re-add the domain.
                </TableCell>
              </TableRow>
            ) : (
              latestRecords.map((r, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{r.record}</TableCell>
                  <TableCell className="font-mono text-xs">{r.type}</TableCell>
                  <TableCell>
                    <CopyCell value={r.name} />
                  </TableCell>
                  <TableCell>
                    <CopyCell value={r.value} />
                  </TableCell>
                  <TableCell>{r.priority ?? "—"}</TableCell>
                  <TableCell>
                    <RecordStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between">
        <RemoveDomainButton />
        <Button onClick={onCheck} disabled={isPending}>
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Check verification
        </Button>
      </div>
    </div>
  );
}

function VerifiedState({
  domain,
  fromLocal,
}: {
  domain: string;
  fromLocal: string;
}) {
  return (
    <div className="max-w-2xl space-y-4">
      <DomainHeader domain={domain} fromLocal={fromLocal} verified />

      <Alert>
        <AlertTitle>Sending from {fromLocal}@{domain}</AlertTitle>
        <AlertDescription>
          All transactional email — reservation confirmations, reminders,
          cancellations — now sends from your domain. Replies still go to your
          property contact email so you can respond directly.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <RemoveDomainButton />
      </div>
    </div>
  );
}

function DomainHeader({
  domain,
  fromLocal,
  verified,
}: {
  domain: string;
  fromLocal: string;
  verified: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-card p-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Domain
        </div>
        <div className="text-lg font-semibold">{domain}</div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          From: {fromLocal}@{domain}
        </div>
      </div>
      {verified ? (
        <Badge className="bg-emerald-600 hover:bg-emerald-700">
          <Check className="mr-1 h-3 w-3" /> Verified
        </Badge>
      ) : (
        <Badge variant="secondary">Pending verification</Badge>
      )}
    </div>
  );
}

function RecordStatusBadge({ status }: { status: string }) {
  if (status === "verified") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-700">Verified</Badge>
    );
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return <Badge variant="secondary">{status || "Pending"}</Badge>;
}

function CopyCell({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="group flex w-full items-center gap-2 text-left font-mono text-xs"
      title="Copy"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
      )}
    </button>
  );
}

function RemoveDomainButton() {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function onClick() {
    if (
      !confirm(
        "Remove this sending domain? Future emails will revert to the platform default until you add a new domain. Past emails are unaffected.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await removeSendingDomain();
      if (result.ok) {
        toast({ title: "Domain removed" });
      } else {
        toast({
          variant: "destructive",
          title: "Remove failed",
          description: result.error,
        });
      }
    });
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={isPending}>
      {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
      Remove domain
    </Button>
  );
}
