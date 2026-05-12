import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPlatformAdminSession } from "@/lib/platform-admin-auth";
import { platformAdminSignInAction } from "./actions";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  missing_email: "Enter an email.",
  denied:
    "If your email is on the allowlist, you're signed in. Refresh in a moment, or try again.",
};

export default async function PlatformAdminSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const existing = await getPlatformAdminSession();
  if (existing) redirect("/platform-admin");

  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? null : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
      <form
        action={platformAdminSignInAction}
        className="w-full max-w-sm space-y-5 rounded-md border bg-card p-6 shadow-sm"
      >
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-700">
            Platform
          </div>
          <h1 className="text-2xl font-semibold">Back-office sign-in</h1>
          <p className="text-sm text-muted-foreground">
            Allowlist-only. Use the email registered in
            <code className="ml-1 font-mono text-xs">
              PLATFORM_ADMIN_BOOTSTRAP_EMAILS
            </code>
            .
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
          >
            {errorMessage}
          </p>
        ) : null}

        <Button type="submit" className="w-full">
          Sign in
        </Button>

        <p className="text-xs text-muted-foreground">
          You&apos;ll land back on{" "}
          <code className="font-mono text-xs">/platform-admin</code> after a
          successful sign-in.
        </p>
      </form>
    </main>
  );
}
