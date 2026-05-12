import { Button } from "@/components/ui/button";
import { endImpersonationAction } from "@/app/platform-admin/(shell)/impersonation-actions";

/**
 * Sticky banner rendered at the top of every /admin/* page when a
 * platform admin is currently impersonating an organization. The
 * "Switch back" form posts directly to endImpersonationAction, which
 * logs the duration and redirects back to the back-office org detail.
 */
export function ImpersonationBanner({
  organizationName,
  adminEmail,
}: {
  organizationName: string | null;
  adminEmail: string;
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base">⚠️</span>
          <span>
            Acting as{" "}
            <strong>{organizationName ?? "(unknown organization)"}</strong>{" "}
            as <span className="font-mono text-xs">{adminEmail}</span>.
            Mutations are logged.
          </span>
        </div>
        <form action={endImpersonationAction}>
          <Button type="submit" size="sm" variant="outline">
            Switch back to back-office →
          </Button>
        </form>
      </div>
    </div>
  );
}
