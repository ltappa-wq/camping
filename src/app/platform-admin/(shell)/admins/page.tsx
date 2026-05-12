import { prisma } from "@/lib/prisma";
import {
  isInBootstrapAllowlist,
  requirePlatformAdminSession,
} from "@/lib/platform-admin-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlatformTopbar } from "../_components/platform-topbar";
import { inviteAdminAction, toggleAdminActiveAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  bad_email: "Enter a valid email.",
  exists: "An admin with that email already exists.",
  self_deactivate: "You can't deactivate yourself. Another admin can.",
  not_found: "Admin not found.",
};

const NOTICES: Record<string, string> = {
  invited:
    "Admin invited. They still need to be in PLATFORM_ADMIN_BOOTSTRAP_EMAILS to sign in until we wire magic-link email delivery.",
};

export default async function AdminsListPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const me = await requirePlatformAdminSession();
  const sp = await searchParams;

  const admins = await prisma.platformAdmin.findMany({
    orderBy: [{ active: "desc" }, { email: "asc" }],
    include: { _count: { select: { actions: true } } },
  });

  return (
    <>
      <PlatformTopbar title="Admins" />
      <main className="space-y-4 p-6">
        {sp.error ? (
          <p
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {ERRORS[sp.error] ?? "Something went wrong."}
          </p>
        ) : null}
        {sp.ok ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            {NOTICES[sp.ok] ?? "Done."}
          </p>
        ) : null}

        <form
          action={inviteAdminAction}
          className="grid grid-cols-1 gap-3 rounded-md border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="newadmin@example.com"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="name">Name (optional)</Label>
            <Input id="name" name="name" placeholder="Pat Operator" />
          </div>
          <Button type="submit">Provision admin</Button>
        </form>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bootstrap allowlist</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions logged</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((a) => {
                const isMe = a.id === me.platformAdminId;
                const inAllowlist = isInBootstrapAllowlist(a.email);
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{a.email}</span>
                      {isMe ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (you)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{a.name ?? "—"}</TableCell>
                    <TableCell>
                      {a.active ? (
                        <Badge>Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {inAllowlist ? (
                        <Badge variant="outline">In .env</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not in env
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {a.lastLoginAt
                        ? a.lastLoginAt
                            .toISOString()
                            .replace("T", " ")
                            .slice(0, 16)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a._count.actions}
                    </TableCell>
                    <TableCell className="text-right">
                      {isMe ? null : (
                        <form action={toggleAdminActiveAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                          >
                            {a.active ? "Deactivate" : "Activate"}
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </main>
    </>
  );
}
